import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(import.meta.dirname, "..");
const cliEntry = path.join(repoRoot, "packages", "cli", "dist", "bin.js");
const corpusPath = path.join(repoRoot, "benchmarks", "search", "tiny-world-model-comparison-corpus.json");

function flag(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

const projectRoot = path.resolve(flag("--project-root") ?? "");
const outputPath = path.resolve(repoRoot, flag("--output") ?? "");
const runtimeDir = path.resolve(flag("--runtime-dir") ?? path.join(projectRoot, ".claw", "quality-runtime"));
const corpus = JSON.parse(fs.readFileSync(corpusPath, "utf8"));

if (!flag("--project-root")) throw new Error("--project-root is required.");
if (!flag("--output")) throw new Error("--output is required.");
if (!fs.existsSync(path.join(projectRoot, ".claw", "memory.sqlite"))) throw new Error("Existing claw index not found.");

function percentile(values, ratio) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)] ?? null;
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function normalizeResultPath(sourcePath) {
  const relative = path.relative(projectRoot, path.resolve(sourcePath));
  return relative.replaceAll("\\", "/");
}

function summarize(entries) {
  return {
    count: entries.length,
    top1: Number(mean(entries.map((entry) => entry.rank === 1 ? 1 : 0)).toFixed(4)),
    recallAt5: Number(mean(entries.map((entry) => entry.rank !== null && entry.rank <= 5 ? 1 : 0)).toFixed(4)),
    recallAt10: Number(mean(entries.map((entry) => entry.rank !== null && entry.rank <= 10 ? 1 : 0)).toFixed(4)),
    mrrAt10: Number(mean(entries.map((entry) => entry.rank !== null && entry.rank <= 10 ? 1 / entry.rank : 0)).toFixed(4)),
    wallMs: {
      median: percentile(entries.map((entry) => entry.wallMs), 0.5),
      p95: percentile(entries.map((entry) => entry.wallMs), 0.95),
    },
    engineMs: {
      median: percentile(entries.map((entry) => entry.telemetry.durationMs), 0.5),
      p95: percentile(entries.map((entry) => entry.telemetry.durationMs), 0.95),
    },
  };
}

const env = {
  ...process.env,
  CLAW_EMBEDDING_LOCAL_DEVICE: "cpu",
  CLAW_EMBEDDING_DAEMON_RUNTIME_DIR: runtimeDir,
  CLAW_EMBEDDING_PERSISTENT_WORKER: "1",
};
const entries = [];
for (const querySpec of corpus.queries) {
  const started = performance.now();
  const result = spawnSync(process.execPath, [cliEntry, "search", "--query", querySpec.query, "--limit", "10"], {
    cwd: projectRoot,
    env,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
    timeout: 10 * 60 * 1000,
  });
  if (result.error || result.status !== 0) {
    throw new Error([result.error?.message, result.stderr, result.stdout].filter(Boolean).join("\n"));
  }
  const output = JSON.parse(result.stdout);
  const topPaths = output.results.map((entry) => normalizeResultPath(entry.sourcePath));
  const relevant = new Set(querySpec.relevant);
  const relevantIndex = topPaths.findIndex((entry) => relevant.has(entry));
  entries.push({
    ...querySpec,
    rank: relevantIndex >= 0 ? relevantIndex + 1 : null,
    topPaths,
    wallMs: Number((performance.now() - started).toFixed(2)),
    telemetry: output.telemetry,
  });
}

const quality = entries.filter((entry) => entry.category !== "lexical_control");
const lexical = entries.filter((entry) => entry.category === "lexical_control");
const report = {
  schemaVersion: 1,
  evaluatedAt: new Date().toISOString(),
  projectRoot,
  corpusPath,
  allRetrievalExecutedThroughClawSearch: true,
  queryCount: entries.length,
  quality: summarize(quality),
  byCategory: Object.fromEntries(
    [...new Set(quality.map((entry) => entry.category))]
      .map((category) => [category, summarize(quality.filter((entry) => entry.category === category))]),
  ),
  lexicalControl: summarize(lexical),
  criticalMissesAt5: quality
    .filter((entry) => entry.critical && (entry.rank === null || entry.rank > 5))
    .map((entry) => ({ id: entry.id, rank: entry.rank, topPaths: entry.topPaths.slice(0, 5) })),
  queries: entries,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ ok: true, outputPath, quality: report.quality, criticalMissesAt5: report.criticalMissesAt5.length })}\n`);
