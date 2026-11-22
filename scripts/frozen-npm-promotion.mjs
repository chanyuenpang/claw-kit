import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { verifyCandidate } from "./release-candidate.mjs";

const assert = (value, message) => { if (!value) throw new Error(message); };
async function save(file, value) {
  const temporary = file + ".tmp-" + randomUUID();
  try { await fs.writeFile(temporary, JSON.stringify(value, null, 2) + "\n", { flag: "wx" }); await fs.rename(temporary, file); }
  finally { await fs.rm(temporary, { force: true }); }
}

/** Publish an already-tested DSH artifact. Never build, export, repack or download. */
export async function promoteFrozenDsh(directory, { publish = false, runNpm, now = Date.now(), validateSource, trialWaiver } = {}) {
  assert(trialWaiver === undefined || typeof trialWaiver === "string" && trialWaiver.trim().length > 0, "Trial waiver requires the owner's explicit authorization evidence.");
  const verified = await verifyCandidate(directory, { ready: publish && trialWaiver === undefined, now });
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
  if (trialWaiver !== undefined) {
    // Separate owner authorization, never a backdated or overwritten trial.
    const waiverPath = path.join(verified.directory, "trial-waiver-dsh.json");
    const waiver = { schemaVersion: 1, candidateHash: manifestHash, identity,
      authorizedAt: new Date(now).toISOString(), evidence: trialWaiver.trim() };
    try { await fs.writeFile(waiverPath, JSON.stringify(waiver, null, 2) + "\n", { flag: "wx" }); }
    catch (error) {
      if (error.code !== "EEXIST") throw error;
      const existing = JSON.parse(await fs.readFile(waiverPath, "utf8"));
      assert(existing.candidateHash === manifestHash && existing.identity === identity && existing.evidence === waiver.evidence,
        "Existing DSH trial waiver differs from this candidate or authorization.");
    }
  }
  const receipt = await publishFrozenNpmResource({ directory: verified.directory, candidateHash: manifestHash, identity, tarball,
    receiptName: "promotion-dsh.json", runNpm });
  return { ...verified, artifact, tarball, identity, receipt };
}

/** Exact-resource attempt ledger shared by npm artifact owners. */
export async function publishFrozenNpmResource({ directory, candidateHash, identity, tarball, receiptName, runNpm }) {
  assert(path.basename(receiptName) === receiptName && receiptName.endsWith(".json"), "Invalid receipt name.");
  const receiptPath = path.join(directory, receiptName), lockPath = receiptPath + ".lock";
  let lock;
  try { lock = await fs.open(lockPath, "wx"); }
  catch (error) {
    if (error.code !== "EEXIST") throw error;
    // A still-running or crashed uploader owns this lock. Inspect its durable
    // result only; never take over the lock, download, or issue another upload.
    const receipt = JSON.parse(await fs.readFile(receiptPath, "utf8"));
    assert(receipt.candidateHash === candidateHash && receipt.identity === identity, "Promotion receipt identity differs.");
    assertUploadAccepted(receipt);
    return { ...receipt, recoveryReadOnly: true };
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
    // A successful owner response completes publication. Propagation is not a
    // second gate; old verified receipts already include upload acceptance.
    assertUploadAccepted(receipt);
    return receipt;
  } finally { await lock.close(); await fs.unlink(lockPath); }
}

function assertUploadAccepted(receipt) {
  assert(["accepted", "verified"].includes(receipt.state),
    `Upload outcome for ${receipt.identity} is ${receipt.state}; do not resend this coordinate.`);
}
