import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

const repoRoot = path.resolve(import.meta.dirname, "..");
const cliEntry = path.join(repoRoot, "packages", "cli", "dist", "bin.js");
const corpusPath = path.join(repoRoot, "benchmarks", "search", "tiny-world-model-comparison-corpus.json");
const cliVersion = JSON.parse(fs.readFileSync(path.join(repoRoot, "packages", "cli", "package.json"), "utf8")).version;
const corpus = JSON.parse(fs.readFileSync(corpusPath, "utf8"));

function flagValue(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : fallback;
}

const sourceProject = path.resolve(flagValue("--source-project", "D:/Users/chany/Documents/tiny-world"));
const outputArg = flagValue("--output");
const outputPath = outputArg ? path.resolve(repoRoot, outputArg) : null;
const sourceStorePath = path.join(sourceProject, ".claw", "memory.sqlite");
const keepEvaluationRoots = process.argv.includes("--keep-evaluation-roots");

if (!outputPath) throw new Error("--output is required.");
if (!fs.existsSync(cliEntry)) throw new Error(`CLI build output not found: ${cliEntry}`);
if (!fs.existsSync(sourceStorePath)) throw new Error(`Source claw index not found: ${sourceStorePath}`);

const modelSpecs = [
  { key: "jina", model: "jinaai/jina-embeddings-v2-base-zh", dimensions: 768 },
  { key: "snowflake", model: "Snowflake/snowflake-arctic-embed-m-v2.0", dimensions: 768 },
];

function normalizePath(value) {
  return value.replaceAll("\\", "/");
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function percentile(values, ratio) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}

function mean(values) {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function ratio(numerator, denominator) {
  return denominator ? Number((numerator / denominator).toFixed(4)) : null;
}

function runCli(cwd, args, env, timeout = 2 * 60 * 60 * 1000) {
  const started = performance.now();
  const result = spawnSync(process.execPath, [cliEntry, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
    maxBuffer: 64 * 1024 * 1024,
    timeout,
    windowsHide: true,
  });
  const wallMs = Number((performance.now() - started).toFixed(2));
  if (result.error || result.status !== 0) {
    throw new Error([
      `claw ${args.join(" ")} failed in ${cwd}`,
      result.error?.message,
      result.stderr,
      result.stdout,
    ].filter(Boolean).join("\n"));
  }
  try {
    return { output: JSON.parse(result.stdout), wallMs };
  } catch (error) {
    throw new Error(`Invalid claw JSON output: ${error.message}\n${result.stdout}\n${result.stderr}`);
  }
}

function processMetrics(runtimeDir) {
  const statePath = path.join(runtimeDir, "state.json");
  if (!fs.existsSync(statePath)) return null;
  const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  if (process.platform !== "win32") return { pid: state.pid };
  const command = `Get-Process -Id ${Number(state.pid)} | Select-Object Id,WorkingSet64,PeakWorkingSet64,PrivateMemorySize64,PeakPagedMemorySize64,CPU | ConvertTo-Json -Compress`;
  const result = spawnSync("powershell.exe", ["-NoProfile", "-Command", command], {
    encoding: "utf8",
    windowsHide: true,
  });
  return result.status === 0 && result.stdout.trim() ? JSON.parse(result.stdout) : { pid: state.pid };
}

function stopDaemon(runtimeDir) {
  const statePath = path.join(runtimeDir, "state.json");
  if (!fs.existsSync(statePath)) return;
  const { pid } = JSON.parse(fs.readFileSync(statePath, "utf8"));
  try {
    process.kill(Number(pid));
  } catch {
    // The isolated daemon may already have exited.
  }
}

function directorySize(root) {
  if (!fs.existsSync(root)) return null;
  let bytes = 0;
  const queue = [root];
  while (queue.length > 0) {
    const current = queue.shift();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) queue.push(fullPath);
      else bytes += fs.statSync(fullPath).size;
    }
  }
  return bytes;
}

function loadFrozenSnapshot() {
  const db = new DatabaseSync(sourceStorePath, { readOnly: true });
  const docs = db.prepare("SELECT source_path, kind, content, content_hash FROM docs ORDER BY source_path").all();
  const sourceMetadata = Object.fromEntries(
    db.prepare("SELECT key, value FROM index_metadata ORDER BY key").all().map((entry) => [entry.key, entry.value]),
  );
  db.close();
  const hash = crypto.createHash("sha256");
  const paths = new Set();
  let bytes = 0;
  const normalizedDocs = docs.map((doc) => {
    const absoluteSource = path.resolve(doc.source_path);
    if (!isInside(sourceProject, absoluteSource)) {
      throw new Error(`Indexed source is outside tiny-world: ${doc.source_path}`);
    }
    const relativePath = normalizePath(path.relative(sourceProject, absoluteSource));
    paths.add(relativePath);
    hash.update(relativePath);
    hash.update("\0");
    hash.update(doc.content);
    bytes += Buffer.byteLength(doc.content, "utf8");
    return { ...doc, relativePath };
  });
  for (const query of corpus.queries) {
    for (const relevant of query.relevant) {
      if (!paths.has(relevant)) throw new Error(`Corpus label is absent from frozen snapshot: ${relevant}`);
    }
  }
  return {
    docs: normalizedDocs,
    metadata: sourceMetadata,
    docCount: normalizedDocs.length,
    bytes,
    sha256: hash.digest("hex"),
  };
}

function prepareEvaluationRoot(root, snapshot, spec) {
  fs.mkdirSync(path.join(root, ".claw"), { recursive: true });
  const config = {
    version: cliVersion,
    id: `tiny-world-search-eval-${spec.key}`,
    name: `tiny-world Search Evaluation ${spec.key}`,
    maxTasksToKeep: 9,
    planning: false,
    autoUpdate: false,
    goalMode: false,
    contextPaths: [],
    memory: {
      enabled: true,
      externalDocPaths: ["docs", ".agents/skills"],
      embedding: {
        provider: "local",
        model: spec.model,
        outputDimensionality: spec.dimensions,
      },
    },
    gitnexus: false,
  };
  fs.writeFileSync(path.join(root, ".claw", "project.json"), `${JSON.stringify(config, null, 2)}\n`, "utf8");
  for (const doc of snapshot.docs) {
    const target = path.resolve(root, doc.relativePath);
    if (!isInside(root, target)) throw new Error(`Unsafe evaluation target: ${target}`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, doc.content, "utf8");
  }
}

function inspectStore(root) {
  const db = new DatabaseSync(path.join(root, ".claw", "memory.sqlite"), { readOnly: true });
  const result = {
    docs: db.prepare("SELECT COUNT(*) AS count FROM docs").get().count,
    vectors: db.prepare("SELECT COUNT(*) AS count FROM doc_embeddings").get().count,
    vectorDocs: db.prepare("SELECT COUNT(DISTINCT source_path) AS count FROM doc_embeddings").get().count,
    chunkCharacters: db.prepare("SELECT length(chunk_text) AS length FROM doc_embeddings").all().map((entry) => entry.length),
    metadata: Object.fromEntries(
      db.prepare("SELECT key, value FROM index_metadata ORDER BY key").all().map((entry) => [entry.key, entry.value]),
    ),
  };
  db.close();
  return {
    ...result,
    chunkCharacters: {
      median: percentile(result.chunkCharacters, 0.5),
      p90: percentile(result.chunkCharacters, 0.9),
      max: Math.max(...result.chunkCharacters),
    },
  };
}

function relativeResultPath(root, sourcePath) {
  const absolute = path.resolve(sourcePath);
  return isInside(root, absolute) ? normalizePath(path.relative(root, absolute)) : normalizePath(sourcePath);
}

function summarize(entries) {
  const ranks = entries.map((entry) => entry.rank);
  return {
    count: entries.length,
    top1: Number(mean(ranks.map((rank) => rank === 1 ? 1 : 0)).toFixed(4)),
    recallAt5: Number(mean(ranks.map((rank) => rank !== null && rank <= 5 ? 1 : 0)).toFixed(4)),
    recallAt10: Number(mean(ranks.map((rank) => rank !== null && rank <= 10 ? 1 : 0)).toFixed(4)),
    mrrAt10: Number(mean(ranks.map((rank) => rank !== null && rank <= 10 ? 1 / rank : 0)).toFixed(4)),
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

function evaluateQueries(root, spec, runtimeDir) {
  const env = {
    CLAW_EMBEDDING_LOCAL_DEVICE: "cpu",
    CLAW_EMBEDDING_DAEMON_RUNTIME_DIR: runtimeDir,
    CLAW_EMBEDDING_PERSISTENT_WORKER: "1",
  };
  const cold = runCli(root, ["search", "--query", "怎样检查游戏项目中的知识索引是否完整", "--limit", "10"], env);
  const entries = [];
  for (const querySpec of corpus.queries) {
    const result = runCli(root, ["search", "--query", querySpec.query, "--limit", "10"], env);
    const topPaths = result.output.results.map((entry) => relativeResultPath(root, entry.sourcePath));
    const relevant = new Set(querySpec.relevant);
    const index = topPaths.findIndex((entry) => relevant.has(entry));
    entries.push({
      ...querySpec,
      rank: index >= 0 ? index + 1 : null,
      topPaths,
      wallMs: result.wallMs,
      telemetry: result.output.telemetry,
    });
  }
  const daemonProcess = processMetrics(runtimeDir);
  stopDaemon(runtimeDir);
  const quality = entries.filter((entry) => entry.category !== "lexical_control");
  const lexical = entries.filter((entry) => entry.category === "lexical_control");
  return {
    coldProbe: {
      wallMs: cold.wallMs,
      engineMs: cold.output.telemetry.durationMs,
      topPath: relativeResultPath(root, cold.output.results[0]?.sourcePath ?? ""),
    },
    quality: summarize(quality),
    byCategory: Object.fromEntries(
      [...new Set(quality.map((entry) => entry.category))]
        .map((category) => [category, summarize(quality.filter((entry) => entry.category === category))]),
    ),
    lexicalControl: summarize(lexical),
    criticalMissesAt5: quality
      .filter((entry) => entry.critical && (entry.rank === null || entry.rank > 5))
      .map((entry) => ({ id: entry.id, rank: entry.rank, topPaths: entry.topPaths.slice(0, 5) })),
    daemonProcess,
    queries: entries,
  };
}

function evaluateModel(evalRoot, snapshot, spec, runtimeRoot) {
  prepareEvaluationRoot(evalRoot, snapshot, spec);
  const indexRuntime = path.join(runtimeRoot, `${spec.key}-index`);
  const indexEnv = {
    CLAW_EMBEDDING_LOCAL_DEVICE: "cpu",
    CLAW_EMBEDDING_DAEMON_RUNTIME_DIR: indexRuntime,
    CLAW_EMBEDDING_PERSISTENT_WORKER: "1",
  };
  const refreshes = [];
  let refresh;
  do {
    refresh = runCli(evalRoot, ["search", "index", "--refresh"], indexEnv);
    refreshes.push({ wallMs: refresh.wallMs, ...refresh.output });
    process.stdout.write(`${JSON.stringify({ phase: "index", model: spec.key, pass: refreshes.length, pending: refresh.output.pendingFileCount, wallMs: refresh.wallMs })}\n`);
  } while (refresh.output.pendingFileCount > 0);
  const indexProcess = processMetrics(indexRuntime);
  stopDaemon(indexRuntime);
  const store = inspectStore(evalRoot);
  const vectorIndex = JSON.parse(store.metadata.vector_index);
  if (store.docs !== snapshot.docCount) throw new Error(`${spec.key} indexed ${store.docs}/${snapshot.docCount} docs.`);
  if (vectorIndex.dimensions !== spec.dimensions) throw new Error(`${spec.key} produced ${vectorIndex.dimensions} dimensions.`);

  process.stdout.write(`${JSON.stringify({ phase: "queries", model: spec.key, queryCount: corpus.queries.length })}\n`);
  const queries = evaluateQueries(evalRoot, spec, path.join(runtimeRoot, `${spec.key}-query`));
  const modelCacheRoot = path.join(
    process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local"),
    "claw", "models", ...spec.model.split("/"),
  );
  const indexWallMs = Number(refreshes.reduce((sum, entry) => sum + entry.wallMs, 0).toFixed(2));
  return {
    model: spec.model,
    dimensions: spec.dimensions,
    modelCacheBytes: directorySize(modelCacheRoot),
    store,
    index: {
      refreshCount: refreshes.length,
      wallMs: indexWallMs,
      cpuSeconds: indexProcess?.CPU ?? null,
      averageLogicalCores: indexProcess?.CPU == null ? null : Number((indexProcess.CPU / (indexWallMs / 1000)).toFixed(3)),
      peakWorkingSetBytes: indexProcess?.PeakWorkingSet64 ?? null,
      privateMemoryBytes: indexProcess?.PrivateMemorySize64 ?? null,
      daemonProcess: indexProcess,
      refreshes,
    },
    ...queries,
  };
}

const startedAt = new Date().toISOString();
const snapshot = loadFrozenSnapshot();
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-tiny-world-model-eval-"));
const runtimeRoot = path.join(tempRoot, "runtime");
fs.mkdirSync(runtimeRoot, { recursive: true });
const models = {};

try {
  process.stdout.write(`${JSON.stringify({ phase: "start", docCount: snapshot.docCount, queryCount: corpus.queries.length, tempRoot })}\n`);
  for (const spec of modelSpecs) {
    models[spec.key] = evaluateModel(path.join(tempRoot, spec.key), snapshot, spec, runtimeRoot);
  }
  const jina = models.jina;
  const snowflake = models.snowflake;
  const report = {
    schemaVersion: 1,
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
      sourceProject,
      sourceDatabase: sourceStorePath,
      sourceProjectIndexUntouched: true,
      sourceProjectFilesUntouched: true,
      evaluationRootsReconstructedFromFrozenDocsTable: true,
      correctedSourceBuiltClawCli: cliEntry,
      allIndexingAndRetrievalExecutedThroughClawSearch: true,
      separateIndexAndQueryDaemonPerModel: true,
      device: "cpu",
      evaluationRootsRetained: keepEvaluationRoots,
      tempRoot: keepEvaluationRoots ? tempRoot : null,
    },
    corpus: {
      path: corpusPath,
      frozenDocCount: snapshot.docCount,
      bytes: snapshot.bytes,
      sha256: snapshot.sha256,
      sourceMetadata: snapshot.metadata,
      queryCount: corpus.queries.length,
      qualityQueryCount: corpus.queries.filter((entry) => entry.category !== "lexical_control").length,
      lexicalControlCount: corpus.queries.filter((entry) => entry.category === "lexical_control").length,
    },
    models,
    comparison: {
      jinaMinusSnowflake: {
        top1: Number((jina.quality.top1 - snowflake.quality.top1).toFixed(4)),
        recallAt5: Number((jina.quality.recallAt5 - snowflake.quality.recallAt5).toFixed(4)),
        recallAt10: Number((jina.quality.recallAt10 - snowflake.quality.recallAt10).toFixed(4)),
        mrrAt10: Number((jina.quality.mrrAt10 - snowflake.quality.mrrAt10).toFixed(4)),
        criticalMissesAt5: jina.criticalMissesAt5.length - snowflake.criticalMissesAt5.length,
      },
      jinaToSnowflake: {
        vectorCountRatio: ratio(jina.store.vectors, snowflake.store.vectors),
        indexWallTimeRatio: ratio(jina.index.wallMs, snowflake.index.wallMs),
        indexCpuTimeRatio: ratio(jina.index.cpuSeconds, snowflake.index.cpuSeconds),
        warmQueryMedianWallTimeRatio: ratio(jina.quality.wallMs.median, snowflake.quality.wallMs.median),
        queryWorkingSetRatio: ratio(jina.daemonProcess?.WorkingSet64, snowflake.daemonProcess?.WorkingSet64),
      },
    },
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({ phase: "done", outputPath })}\n`);
} finally {
  if (!keepEvaluationRoots && fs.existsSync(tempRoot)) {
    const resolvedTemp = path.resolve(tempRoot);
    const resolvedOsTemp = path.resolve(os.tmpdir());
    if (!isInside(resolvedOsTemp, resolvedTemp) || !path.basename(resolvedTemp).startsWith("claw-tiny-world-model-eval-")) {
      throw new Error(`Refusing to remove unsafe temporary path: ${resolvedTemp}`);
    }
    fs.rmSync(resolvedTemp, { recursive: true, force: true });
  }
}
