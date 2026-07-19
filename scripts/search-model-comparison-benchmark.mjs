import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

const repoRoot = path.resolve(import.meta.dirname, "..");
const cliEntry = path.join(repoRoot, "packages", "cli", "dist", "bin.js");
const corpusPath = path.join(repoRoot, "benchmarks", "search", "model-comparison-corpus.json");
const sourceStorePath = path.join(repoRoot, ".claw", "memory.sqlite");
const cliVersion = JSON.parse(fs.readFileSync(path.join(repoRoot, "packages", "cli", "package.json"), "utf8")).version;
const corpus = JSON.parse(fs.readFileSync(corpusPath, "utf8"));

const worktreeFlagIndex = process.argv.indexOf("--worktree");
const outputFlagIndex = process.argv.indexOf("--output");
const candidateModelFlagIndex = process.argv.indexOf("--candidate-model");
const candidateDimensionsFlagIndex = process.argv.indexOf("--candidate-dimensions");
const worktree = worktreeFlagIndex >= 0 ? path.resolve(process.argv[worktreeFlagIndex + 1] ?? "") : null;
const outputPath = outputFlagIndex >= 0 ? path.resolve(repoRoot, process.argv[outputFlagIndex + 1] ?? "") : null;
const candidateModel = candidateModelFlagIndex >= 0
  ? process.argv[candidateModelFlagIndex + 1]?.trim()
  : "Snowflake/snowflake-arctic-embed-xs";
const candidateDimensions = candidateDimensionsFlagIndex >= 0
  ? Number(process.argv[candidateDimensionsFlagIndex + 1])
  : 384;

if (!worktree) throw new Error("--worktree requires an existing detached worktree path.");
if (outputFlagIndex >= 0 && !process.argv[outputFlagIndex + 1]) throw new Error("--output requires a path.");
if (!candidateModel) throw new Error("--candidate-model requires a model id.");
if (!Number.isInteger(candidateDimensions) || candidateDimensions <= 0) {
  throw new Error("--candidate-dimensions requires a positive integer.");
}
if (!fs.existsSync(path.join(worktree, ".git"))) throw new Error(`Worktree not found: ${worktree}`);
if (!fs.existsSync(cliEntry)) throw new Error(`CLI build output not found: ${cliEntry}. Run npm run build first.`);
if (!fs.existsSync(sourceStorePath)) throw new Error(`Large-model baseline index not found: ${sourceStorePath}`);

const modelSpecs = {
  large: {
    model: "Snowflake/snowflake-arctic-embed-m-v2.0",
    expectedDimensions: 768,
  },
  small: {
    model: candidateModel,
    expectedDimensions: candidateDimensions,
  },
};

function runCli(cwd, args, env, timeout = 2 * 60 * 60 * 1000) {
  const startedAt = performance.now();
  const result = spawnSync(process.execPath, [cliEntry, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
    maxBuffer: 32 * 1024 * 1024,
    timeout,
    windowsHide: true,
  });
  const wallMs = Number((performance.now() - startedAt).toFixed(2));
  if (result.error || result.status !== 0) {
    throw new Error([
      `claw ${args.join(" ")} failed in ${cwd}`,
      result.error?.message,
      result.stderr,
      result.stdout,
    ].filter(Boolean).join("\n"));
  }
  return { output: JSON.parse(result.stdout), wallMs };
}

function writeProjectConfig(model, outputDimensionality) {
  fs.writeFileSync(path.join(worktree, ".claw", "project.json"), `${JSON.stringify({
    version: cliVersion,
    id: "search-model-comparison",
    name: "Search Model Comparison",
    maxTasksToKeep: 9,
    planning: false,
    autoUpdate: false,
    goalMode: false,
    contextPaths: [],
    memory: {
      enabled: true,
      externalDocPaths: [],
      embedding: {
        provider: "local",
        model,
        ...(outputDimensionality ? { outputDimensionality } : {}),
      },
    },
    gitnexus: false,
  }, null, 2)}\n`, "utf8");
}

function escapeSqliteString(value) {
  return value.replaceAll("'", "''");
}

function prepareIndexedCorpusSnapshot() {
  const targetStorePath = path.join(worktree, ".claw", "memory.sqlite");
  for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(`${targetStorePath}${suffix}`, { force: true });

  const sourceDb = new DatabaseSync(sourceStorePath);
  const docs = sourceDb.prepare("SELECT source_path, kind, content, content_hash FROM docs ORDER BY source_path").all();
  const metadata = Object.fromEntries(
    sourceDb.prepare("SELECT key, value FROM index_metadata ORDER BY key").all().map((entry) => [entry.key, entry.value]),
  );
  const vectorCount = sourceDb.prepare("SELECT COUNT(*) AS count FROM doc_embeddings").get().count;
  const vectorDocCount = sourceDb.prepare("SELECT COUNT(DISTINCT source_path) AS count FROM doc_embeddings").get().count;
  sourceDb.exec(`VACUUM INTO '${escapeSqliteString(targetStorePath.replaceAll("\\", "/"))}'`);
  sourceDb.close();

  const truthDir = path.join(worktree, ".claw", "truth");
  fs.rmSync(truthDir, { recursive: true, force: true });
  fs.mkdirSync(truthDir, { recursive: true });
  const hash = crypto.createHash("sha256");
  let bytes = 0;
  for (const doc of docs) {
    const relativePath = path.relative(repoRoot, doc.source_path);
    if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
      throw new Error(`Baseline source is outside the repository: ${doc.source_path}`);
    }
    const targetPath = path.join(worktree, relativePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, doc.content, "utf8");
    hash.update(relativePath.replaceAll("\\", "/"));
    hash.update("\0");
    hash.update(doc.content);
    bytes += Buffer.byteLength(doc.content, "utf8");
  }
  return {
    docCount: docs.length,
    vectorCount,
    vectorDocCount,
    bytes,
    sha256: hash.digest("hex"),
    metadata,
  };
}

function relativeTruthPath(sourcePath) {
  const normalized = sourcePath.replaceAll("\\", "/");
  const marker = "/.claw/truth/";
  const markerIndex = normalized.toLowerCase().indexOf(marker);
  return markerIndex >= 0 ? normalized.slice(markerIndex + marker.length) : path.basename(normalized);
}

function percentile(values, ratio) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}

function mean(values) {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function summarizeQueries(entries) {
  return {
    count: entries.length,
    top1Accuracy: Number(mean(entries.map((entry) => entry.rank === 1 ? 1 : 0)).toFixed(4)),
    recallAt5: Number(mean(entries.map((entry) => entry.rank !== null && entry.rank <= 5 ? 1 : 0)).toFixed(4)),
    mrrAt10: Number(mean(entries.map((entry) => entry.rank !== null && entry.rank <= 10 ? 1 / entry.rank : 0)).toFixed(4)),
    wallMs: {
      median: percentile(entries.map((entry) => entry.wallMs), 0.5),
      p95: percentile(entries.map((entry) => entry.wallMs), 0.95),
    },
    engineMs: {
      median: percentile(entries.map((entry) => entry.telemetry.durationMs), 0.5),
      p95: percentile(entries.map((entry) => entry.telemetry.durationMs), 0.95),
    },
    routes: Object.fromEntries(
      [...new Set(entries.map((entry) => entry.telemetry.route))]
        .map((route) => [route, entries.filter((entry) => entry.telemetry.route === route).length]),
    ),
  };
}

function readDaemonProcessMetrics(runtimeDir) {
  const statePath = path.join(runtimeDir, "state.json");
  if (!fs.existsSync(statePath)) return null;
  const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  if (process.platform !== "win32") return { pid: state.pid };
  const command = `Get-Process -Id ${Number(state.pid)} | Select-Object Id,WorkingSet64,PeakWorkingSet64,PrivateMemorySize64,CPU | ConvertTo-Json -Compress`;
  const result = spawnSync("powershell.exe", ["-NoProfile", "-Command", command], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0 || !result.stdout.trim()) return { pid: state.pid };
  return JSON.parse(result.stdout);
}

function stopDaemon(runtimeDir) {
  const statePath = path.join(runtimeDir, "state.json");
  if (!fs.existsSync(statePath)) return;
  const { pid } = JSON.parse(fs.readFileSync(statePath, "utf8"));
  try {
    process.kill(Number(pid));
  } catch {
    // The isolated benchmark daemon may already have reached its idle timeout.
  }
}

function directorySize(rootDir) {
  if (!fs.existsSync(rootDir)) return null;
  let size = 0;
  const queue = [rootDir];
  while (queue.length > 0) {
    const current = queue.shift();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) queue.push(fullPath);
      else size += fs.statSync(fullPath).size;
    }
  }
  return size;
}

function evaluateQuery(querySpec, searchResult) {
  const rankedPaths = searchResult.output.results.map((entry) => relativeTruthPath(entry.sourcePath));
  const relevant = new Set(querySpec.relevant);
  const firstRelevantIndex = rankedPaths.findIndex((entry) => relevant.has(entry));
  return {
    ...querySpec,
    rank: firstRelevantIndex >= 0 ? firstRelevantIndex + 1 : null,
    topPaths: rankedPaths,
    wallMs: searchResult.wallMs,
    telemetry: searchResult.output.telemetry,
  };
}

function runQueries(modelKey, runtimeDir) {
  const env = {
    CLAW_EMBEDDING_LOCAL_DEVICE: "cpu",
    CLAW_EMBEDDING_DAEMON_RUNTIME_DIR: runtimeDir,
    CLAW_EMBEDDING_PERSISTENT_WORKER: "1",
  };
  const coldProbe = runCli(
    worktree,
    ["search", "--query", "怎样避免后台知识沉淀反复触发自身并形成递归任务", "--limit", "10"],
    env,
  );
  const queries = corpus.queries.map((querySpec) => evaluateQuery(
    querySpec,
    runCli(worktree, ["search", "--query", querySpec.query, "--limit", "10"], env),
  ));
  const cacheProbeQuery = "语义检索缓存命中和新查询延迟应该怎样区分";
  runCli(worktree, ["search", "--query", cacheProbeQuery, "--limit", "10"], env);
  const cacheProbe = runCli(worktree, ["search", "--query", cacheProbeQuery, "--limit", "10"], env);
  const daemonProcess = readDaemonProcessMetrics(runtimeDir);
  stopDaemon(runtimeDir);

  const qualityResults = queries.filter((entry) => entry.category !== "lexical_control");
  const lexicalResults = queries.filter((entry) => entry.category === "lexical_control");
  const model = modelSpecs[modelKey].model;
  const cacheRoot = path.join(
    process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local"),
    "claw", "models", ...model.split("/"),
  );
  return {
    model,
    expectedDimensions: modelSpecs[modelKey].expectedDimensions,
    modelCacheBytes: directorySize(cacheRoot),
    coldProbe: {
      wallMs: coldProbe.wallMs,
      telemetry: coldProbe.output.telemetry,
      topPath: relativeTruthPath(coldProbe.output.results[0]?.sourcePath ?? ""),
    },
    quality: summarizeQueries(qualityResults),
    byLanguage: Object.fromEntries(
      ["zh", "en", "mixed"].map((language) => [language, summarizeQueries(
        qualityResults.filter((entry) => entry.language === language),
      )]),
    ),
    lexicalControl: summarizeQueries(lexicalResults),
    criticalMissesAt5: qualityResults
      .filter((entry) => entry.critical && (entry.rank === null || entry.rank > 5))
      .map((entry) => ({ id: entry.id, rank: entry.rank, topPaths: entry.topPaths.slice(0, 5) })),
    cacheProbe: { wallMs: cacheProbe.wallMs, telemetry: cacheProbe.output.telemetry },
    daemonProcess,
    queries,
  };
}

function inspectStore() {
  const db = new DatabaseSync(path.join(worktree, ".claw", "memory.sqlite"), { readOnly: true });
  const result = {
    docs: db.prepare("SELECT COUNT(*) AS count FROM docs").get().count,
    vectors: db.prepare("SELECT COUNT(*) AS count FROM doc_embeddings").get().count,
    vectorDocs: db.prepare("SELECT COUNT(DISTINCT source_path) AS count FROM doc_embeddings").get().count,
    metadata: Object.fromEntries(
      db.prepare("SELECT key, value FROM index_metadata ORDER BY key").all().map((entry) => [entry.key, entry.value]),
    ),
  };
  db.close();
  return result;
}

function ratio(numerator, denominator) {
  return denominator === 0 ? null : Number((numerator / denominator).toFixed(4));
}

const startedAt = new Date().toISOString();
const baselineSnapshot = prepareIndexedCorpusSnapshot();
writeProjectConfig(modelSpecs.large.model, modelSpecs.large.expectedDimensions);
const largeBefore = inspectStore();
if (JSON.parse(largeBefore.metadata.vector_index).dimensions !== modelSpecs.large.expectedDimensions) {
  throw new Error("Copied baseline is not the expected 768-dimensional large-model index.");
}

const runtimeRoot = path.join(os.tmpdir(), `claw-search-model-comparison-runtime-${process.pid}`);
const large = runQueries("large", path.join(runtimeRoot, "large-query"));

writeProjectConfig(modelSpecs.small.model, modelSpecs.small.expectedDimensions);
const smallIndexRuntime = path.join(runtimeRoot, "small-index");
const smallIndexEnv = {
  CLAW_EMBEDDING_LOCAL_DEVICE: "cpu",
  CLAW_EMBEDDING_DAEMON_RUNTIME_DIR: smallIndexRuntime,
  CLAW_EMBEDDING_PERSISTENT_WORKER: "1",
};
const refreshes = [];
let refresh;
do {
  refresh = runCli(worktree, ["search", "index", "--refresh"], smallIndexEnv);
  refreshes.push({ wallMs: refresh.wallMs, ...refresh.output });
} while (refresh.output.pendingFileCount > 0);
const smallIndexProcess = readDaemonProcessMetrics(smallIndexRuntime);
stopDaemon(smallIndexRuntime);
if (refresh.output.vectorIndex?.dimensions !== modelSpecs.small.expectedDimensions) {
  throw new Error(`Small-model refresh returned ${refresh.output.vectorIndex?.dimensions} dimensions; expected 384.`);
}

const small = runQueries("small", path.join(runtimeRoot, "small-query"));
const smallAfter = inspectStore();
small.index = {
  refreshCount: refreshes.length,
  wallMs: Number(refreshes.reduce((sum, entry) => sum + entry.wallMs, 0).toFixed(2)),
  indexedCount: refresh.output.indexedCount,
  processedFileCount: refreshes.reduce((sum, entry) => sum + entry.processedFileCount, 0),
  pendingFileCount: refresh.output.pendingFileCount,
  vectorIndex: refresh.output.vectorIndex,
  sourceCount: refresh.output.sources.length,
  daemonProcess: smallIndexProcess,
};

const gate = corpus.qualityGate;
const qualityGate = {
  recallAt5Ratio: ratio(small.quality.recallAt5, large.quality.recallAt5),
  mrrAt10Ratio: ratio(small.quality.mrrAt10, large.quality.mrrAt10),
  smallCriticalMissCount: small.criticalMissesAt5.length,
};
qualityGate.recallAt5Pass = qualityGate.recallAt5Ratio >= gate.recallAt5RelativeFloor;
qualityGate.mrrAt10Pass = qualityGate.mrrAt10Ratio >= gate.mrrAt10RelativeFloor;
qualityGate.criticalMissPass = qualityGate.smallCriticalMissCount <= gate.maxCriticalMissesAt5;
qualityGate.pass = qualityGate.recallAt5Pass && qualityGate.mrrAt10Pass && qualityGate.criticalMissPass;

const report = {
  schemaVersion: 2,
  startedAt,
  finishedAt: new Date().toISOString(),
  runtime: {
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    cliVersion,
    cpu: os.cpus()[0]?.model ?? null,
    logicalCpuCount: os.cpus().length,
    totalMemoryBytes: os.totalmem(),
  },
  isolation: {
    worktree,
    device: "cpu",
    sourceProjectIndexUntouched: true,
    baselineDatabaseCopiedWithVacuumInto: true,
    smallModelAppliedThroughProjectConfigAndClawSearchRefresh: true,
    allRetrievalExecutedThroughClawSearch: true,
    separateQueryDaemonRuntimePerModel: true,
  },
  corpus: {
    ...baselineSnapshot,
    queryCount: corpus.queries.length,
    qualityQueryCount: corpus.queries.filter((entry) => entry.category !== "lexical_control").length,
    lexicalControlCount: corpus.queries.filter((entry) => entry.category === "lexical_control").length,
  },
  thresholds: gate,
  stores: { largeBefore, smallAfter },
  models: { large, small },
  comparison: {
    qualityGate,
    smallToLarge: {
      modelCacheSizeRatio: ratio(small.modelCacheBytes, large.modelCacheBytes),
      coldQueryWallTimeRatio: ratio(small.coldProbe.wallMs, large.coldProbe.wallMs),
      warmQualityMedianWallTimeRatio: ratio(small.quality.wallMs.median, large.quality.wallMs.median),
      daemonWorkingSetRatio: ratio(small.daemonProcess?.WorkingSet64, large.daemonProcess?.WorkingSet64),
    },
    verdict: qualityGate.pass ? "small_model_meets_quality_gate" : "small_model_fails_quality_gate",
  },
};

const reportText = `${JSON.stringify(report, null, 2)}\n`;
if (outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, reportText, "utf8");
  process.stdout.write(`${JSON.stringify({ ok: true, outputPath, verdict: report.comparison.verdict })}\n`);
} else {
  process.stdout.write(reportText);
}
