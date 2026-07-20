import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(import.meta.dirname, "..");

function flag(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

const projectRoot = path.resolve(flag("--project-root") ?? "");
const corpusPath = path.resolve(repoRoot, flag("--corpus") ?? "benchmarks/search/tiny-world-hybrid-development-corpus.json");
const outputPath = path.resolve(repoRoot, flag("--output") ?? "benchmarks/search/tiny-world-hybrid-development-candidates.json");
const cliEntry = path.resolve(repoRoot, flag("--cli-entry") ?? "packages/cli/dist/bin.js");
if (!flag("--project-root")) throw new Error("--project-root is required.");

const corpus = JSON.parse(fs.readFileSync(corpusPath, "utf8"));
const queries = corpus.queries.filter((entry) => entry.category !== "lexical_control");
const runtimeDir = path.join(projectRoot, ".claw", "ranking-snapshot-runtime");
const env = {
  ...process.env,
  CLAW_EMBEDDING_LOCAL_DEVICE: "cpu",
  CLAW_EMBEDDING_DAEMON_RUNTIME_DIR: runtimeDir,
  CLAW_EMBEDDING_PERSISTENT_WORKER: "1",
  CLAW_SEARCH_RANKING_DIAGNOSTICS: "1",
};

function normalizeResultPath(sourcePath) {
  return path.relative(projectRoot, path.resolve(sourcePath)).replaceAll("\\", "/");
}

const snapshots = [];
for (const [index, query] of queries.entries()) {
  const result = spawnSync(process.execPath, [cliEntry, "search", "--query", query.query, "--limit", "1000"], {
    cwd: projectRoot,
    env,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 128 * 1024 * 1024,
    timeout: 10 * 60 * 1000,
  });
  if (result.error || result.status !== 0) {
    throw new Error([result.error?.message, result.stderr, result.stdout].filter(Boolean).join("\n"));
  }
  const payload = JSON.parse(result.stdout);
  for (const entry of payload.results) {
    if (!entry._ranking) {
      throw new Error(`Missing ranking diagnostics for ${query.id}: ${entry.sourcePath}`);
    }
  }
  snapshots.push({
    id: query.id,
    query: query.query,
    category: query.category,
    signal: query.signal ?? "legacy_complex",
    critical: query.critical,
    relevant: query.relevant,
    expectedIntent: query.expectedIntent ?? null,
    allowedStates: query.allowedStates ?? [],
    relevantSections: query.relevantSections ?? [],
    forbiddenHardDistractorChunks: query.forbiddenHardDistractorChunks ?? [],
    candidates: payload.results.map((entry, candidateIndex) => ({
      sourcePath: normalizeResultPath(entry.sourcePath),
      kind: entry.kind,
      actualRank: candidateIndex + 1,
      documentKind: entry.documentKind ?? null,
      documentState: entry.documentState ?? null,
      state: entry.state ?? null,
      dated: entry.dated ?? null,
      headingPath: entry.headingPath ?? null,
      ranking: entry._ranking,
    })),
  });
  process.stderr.write(`snapshot ${index + 1}/${queries.length} ${query.id}\n`);
}

const output = {
  schemaVersion: 1,
  corpus: corpusPath,
  projectRoot,
  queryCount: snapshots.length,
  candidates: snapshots,
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ ok: true, outputPath, queryCount: snapshots.length })}\n`);
