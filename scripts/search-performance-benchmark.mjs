import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(import.meta.dirname, "..");
const cliEntry = path.join(repoRoot, "packages", "cli", "dist", "bin.js");
const runId = Date.now().toString(36);

function percentile(values, ratio) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
}

function search(query, extraEnv = {}) {
  const startedAt = performance.now();
  const result = spawnSync(process.execPath, [cliEntry, "search", "--query", query], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, ...extraEnv },
    windowsHide: true,
  });
  const wallMs = Number((performance.now() - startedAt).toFixed(2));
  if (result.status !== 0) {
    throw new Error(`search failed (${result.status}): ${result.stderr || result.stdout}`);
  }
  const output = JSON.parse(result.stdout);
  return {
    query,
    wallMs,
    resultCount: output.results.length,
    topSourcePath: output.results[0]?.sourcePath ?? null,
    telemetry: output.telemetry,
  };
}

if (!fs.existsSync(cliEntry)) {
  throw new Error(`CLI build output not found: ${cliEntry}. Run npm run build first.`);
}

const exact = Array.from({ length: 5 }, () => search("workflow-cost-and-runtime-path.md"));
search(`warm embedding daemon lifecycle primer ${runId}`);
const semanticWarm = Array.from({ length: 5 }, (_, index) =>
  search(`workflow lifecycle background refresh coordination semantics ${runId}${String.fromCharCode(97 + index)}`));
const cacheQuery = `semantic cache telemetry workflow ${runId}`;
search(cacheQuery);
const semanticCache = Array.from({ length: 3 }, () => search(cacheQuery));
const oneShotFallback = search(
  `one shot fallback workflow evidence ${runId}`,
  { CLAW_EMBEDDING_PERSISTENT_WORKER: "0" },
);

const exactP95 = percentile(exact.map((entry) => entry.wallMs), 0.95);
const semanticWarmP95 = percentile(semanticWarm.map((entry) => entry.wallMs), 0.95);
const report = {
  schemaVersion: 1,
  startedAt: new Date().toISOString(),
  runtime: {
    node: process.version,
    cliVersion: JSON.parse(fs.readFileSync(path.join(repoRoot, "packages", "cli", "package.json"), "utf8")).version,
  },
  exact,
  semanticWarm,
  semanticCache,
  oneShotFallback,
  summary: {
    exactP95Ms: exactP95,
    semanticWarmP95Ms: semanticWarmP95,
    exactThresholdMs: 500,
    semanticWarmThresholdMs: 1000,
    exactPass: exactP95 < 500,
    semanticWarmPass: semanticWarmP95 < 1000,
    allSuccessful: [...exact, ...semanticWarm, ...semanticCache, oneShotFallback]
      .every((entry) => entry.resultCount > 0),
  },
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.summary.exactPass || !report.summary.semanticWarmPass || !report.summary.allSuccessful) {
  process.exitCode = 1;
}
