import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { verifyCandidate } from "./release-candidate.mjs";

const assert = (value, message) => { if (!value) throw new Error(message); };
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
async function save(file, value) {
  const temporary = file + ".tmp-" + randomUUID();
  try { await fs.writeFile(temporary, JSON.stringify(value, null, 2) + "\n", { flag: "wx" }); await fs.rename(temporary, file); }
  finally { await fs.rm(temporary, { force: true }); }
}

/** Publish an already-tested DSH artifact. This owner never builds, exports or
 * packs workspace source. 'pack name@version' below is registry retrieval only. */
export async function promoteFrozenDsh(directory, { publish = false, runNpm, now = Date.now(), validateSource } = {}) {
  const verified = await verifyCandidate(directory, { ready: publish, now });
  const { candidate, manifestHash } = verified;
  const artifact = candidate.artifacts?.dsh;
  assert(artifact?.file && artifact.npmVersion, "Select a frozen candidate containing DSH.");
  const tarball = path.join(verified.directory, "artifacts", artifact.file);
  const relative = path.relative(path.join(verified.directory, "artifacts"), tarball);
  assert(!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(".." + path.sep), "DSH artifact escapes candidate.");
  const identity = "@veewo/dsh-claw-kit@" + artifact.npmVersion;
  if (!publish) return { ...verified, artifact, tarball, identity };
  assert(typeof runNpm === "function" && typeof validateSource === "function", "Publication requires the owning source validator and npm transport.");
  await validateSource(candidate.sourceRevision);
  const receipt = await publishFrozenNpmResource({ directory: verified.directory, candidateHash: manifestHash, identity, tarball,
    expectedHash: candidate.files[artifact.file], receiptName: "promotion-dsh.json", runNpm });
  return { ...verified, artifact, tarball, identity, receipt };
}

/** Exact-resource attempt ledger shared by npm artifact owners. */
export async function publishFrozenNpmResource({ directory, candidateHash, identity, tarball, expectedHash, receiptName, runNpm }) {
  assert(path.basename(receiptName) === receiptName && receiptName.endsWith(".json"), "Invalid receipt name.");
  const receiptPath = path.join(directory, receiptName), lockPath = receiptPath + ".lock";
  let lock;
  try { lock = await fs.open(lockPath, "wx"); }
  catch (error) {
    if (error.code !== "EEXIST") throw error;
    // A still-running or crashed uploader owns this lock. Recovery may inspect
    // the durable attempt and registry bytes but must not overwrite its ledger,
    // delete its lock, or issue another upload.
    const receipt = JSON.parse(await fs.readFile(receiptPath, "utf8"));
    assert(receipt.candidateHash === candidateHash && receipt.identity === identity, "Promotion receipt identity differs.");
    await verifyRegistryResource({ identity, expectedHash, runNpm });
    return { ...receipt, state: "verified", recoveryReadOnly: true };
  }
  try {
    let receipt;
    try { receipt = JSON.parse(await fs.readFile(receiptPath, "utf8")); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    if (receipt) assert(receipt.candidateHash === candidateHash && receipt.identity === identity, "Promotion receipt identity differs.");
    if (!receipt) {
      receipt = { schemaVersion: 1, candidateHash: candidateHash, identity, state: "attempted", attemptedAt: new Date().toISOString() };
      await save(receiptPath, receipt);
      try {
        await runNpm(["publish", tarball, "--ignore-scripts", "--access", "public", "--tag", "latest", "--registry=https://registry.npmjs.org"]);
        receipt.state = "accepted"; await save(receiptPath, receipt);
      } catch (error) {
        // A lost response cannot authorize another irreversible upload.
        receipt.state = "unknown"; await save(receiptPath, receipt);
        throw error;
      }
    }
    // Reconcile attempted/unknown/accepted by exact remote bytes, never resend.
    await verifyRegistryResource({ identity, expectedHash, runNpm });
    receipt.state = "verified"; receipt.verifiedAt = new Date().toISOString(); await save(receiptPath, receipt);
    return receipt;
  } finally { await lock.close(); await fs.unlink(lockPath); }
}

async function verifyRegistryResource({ identity, expectedHash, runNpm }) {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "claw-npm-retrieval-"));
  try {
    const result = JSON.parse(await runNpm(["pack", identity, "--ignore-scripts", "--json", "--pack-destination", temporary, "--registry=https://registry.npmjs.org"]));
    assert(result.length === 1 && path.basename(result[0].filename) === result[0].filename, "Invalid registry retrieval response.");
    assert(sha(await fs.readFile(path.join(temporary, result[0].filename))) === expectedHash, "Registry bytes differ; do not rebuild or resend this coordinate.");
  } finally { await fs.rm(temporary, { recursive: true, force: true }); }
}
