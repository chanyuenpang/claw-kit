import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { AutoTokenizer, env as transformersEnv } from "@huggingface/transformers";

const root = path.resolve(import.meta.dirname, "..");
const cli = path.join(root, "packages", "cli", "dist", "bin.js");
const corpus = JSON.parse(fs.readFileSync(path.join(root, "benchmarks", "search", "model-comparison-corpus.json"), "utf8"));
const storePath = path.join(root, ".claw", "memory.sqlite");
const outputFlag = process.argv.indexOf("--output");
const outputPath = outputFlag >= 0
  ? path.resolve(root, process.argv[outputFlag + 1] ?? "")
  : null;
if (outputFlag >= 0 && !process.argv[outputFlag + 1]) throw new Error("--output requires a path.");

function runCli(args, runtimeDir, timeout = 2 * 60 * 60 * 1000) {
  const started = performance.now();
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      CLAW_EMBEDDING_LOCAL_DEVICE: "cpu",
      CLAW_EMBEDDING_DAEMON_RUNTIME_DIR: runtimeDir,
      CLAW_EMBEDDING_PERSISTENT_WORKER: "1",
    },
    maxBuffer: 32 * 1024 * 1024,
    timeout,
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    throw new Error([result.error?.message, result.stderr, result.stdout].filter(Boolean).join("\n"));
  }
  return {
    wallMs: Number((performance.now() - started).toFixed(2)),
    output: JSON.parse(result.stdout),
  };
}

function inspectStore() {
  const db = new DatabaseSync(storePath, { readOnly: true });
  const metadata = Object.fromEntries(db.prepare("SELECT key, value FROM index_metadata ORDER BY key").all().map((row) => [row.key, row.value]));
  const result = {
    documents: db.prepare("SELECT COUNT(*) count FROM docs").get().count,
    vectors: db.prepare("SELECT COUNT(*) count FROM doc_embeddings").get().count,
    vectorDocuments: db.prepare("SELECT COUNT(DISTINCT doc_id) count FROM doc_embeddings").get().count,
    missingVectorDocuments: db.prepare("SELECT COUNT(*) count FROM docs d LEFT JOIN doc_embeddings e ON e.doc_id=d.id WHERE e.doc_id IS NULL").get().count,
    metadata,
  };
  db.close();
  return result;
}

function clearQueryCache() {
  const db = new DatabaseSync(storePath);
  db.exec("DELETE FROM query_embeddings");
  db.close();
}

function readChunks() {
  const db = new DatabaseSync(storePath, { readOnly: true });
  const chunks = db.prepare("SELECT chunk_text FROM doc_embeddings ORDER BY doc_id, chunk_index").all().map((row) => row.chunk_text);
  db.close();
  return chunks;
}

async function measureTokenLengths(tokenizer) {
  const lengths = readChunks().map((text) => tokenizer(text, { truncation: false }).input_ids.data.length).sort((a, b) => a - b);
  const percentile = (ratio) => lengths[Math.min(lengths.length - 1, Math.ceil(lengths.length * ratio) - 1)] ?? null;
  const over512 = lengths.filter((length) => length > 512).length;
  return {
    chunks: lengths.length,
    over512,
    over512Percent: Number((over512 * 100 / Math.max(1, lengths.length)).toFixed(2)),
    p50: percentile(0.5),
    p90: percentile(0.9),
    max: lengths.at(-1) ?? null,
  };
}

function relativeTruthPath(sourcePath) {
  const normalized = sourcePath.replaceAll("\\", "/");
  const marker = "/.claw/truth/";
  const index = normalized.toLowerCase().indexOf(marker);
  return index >= 0 ? normalized.slice(index + marker.length) : path.basename(normalized);
}

function percentile(values, ratio) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)] ?? null;
}

function summarize(entries) {
  const quality = entries.filter((entry) => entry.category !== "lexical_control");
  const mean = (values) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  return {
    top1Accuracy: Number(mean(quality.map((entry) => entry.rank === 1 ? 1 : 0)).toFixed(4)),
    recallAt5: Number(mean(quality.map((entry) => entry.rank !== null && entry.rank <= 5 ? 1 : 0)).toFixed(4)),
    mrrAt10: Number(mean(quality.map((entry) => entry.rank !== null && entry.rank <= 10 ? 1 / entry.rank : 0)).toFixed(4)),
    criticalMissesAt5: quality.filter((entry) => entry.critical && (entry.rank === null || entry.rank > 5)).map((entry) => entry.id),
    wallMs: {
      median: percentile(quality.map((entry) => entry.wallMs), 0.5),
      p95: percentile(quality.map((entry) => entry.wallMs), 0.95),
    },
    engineMs: {
      median: percentile(quality.map((entry) => entry.telemetry.durationMs), 0.5),
      p95: percentile(quality.map((entry) => entry.telemetry.durationMs), 0.95),
    },
  };
}

function readDaemonMetrics(runtimeDir) {
  const statePath = path.join(runtimeDir, "state.json");
  if (!fs.existsSync(statePath)) return null;
  const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  if (process.platform !== "win32") return { pid: state.pid };
  const result = spawnSync("powershell.exe", ["-NoProfile", "-Command", `Get-Process -Id ${Number(state.pid)} | Select-Object Id,CPU,WorkingSet64,PeakWorkingSet64,PrivateMemorySize64 | ConvertTo-Json -Compress`], {
    encoding: "utf8",
    windowsHide: true,
  });
  return result.status === 0 && result.stdout.trim() ? JSON.parse(result.stdout) : { pid: state.pid };
}

function stopDaemon(runtimeDir) {
  const statePath = path.join(runtimeDir, "state.json");
  if (!fs.existsSync(statePath)) return;
  try {
    process.kill(Number(JSON.parse(fs.readFileSync(statePath, "utf8")).pid));
  } catch {
    // Isolated benchmark daemon may already have stopped.
  }
}

function runQueries(label) {
  clearQueryCache();
  const runtimeDir = path.join(os.tmpdir(), `claw-chunking-${label}-${process.pid}`);
  const cold = runCli(["search", "--query", "怎样避免后台知识沉淀反复触发自身并形成递归任务", "--limit", "10"], runtimeDir);
  const entries = corpus.queries.map((spec) => {
    const result = runCli(["search", "--query", spec.query, "--limit", "10"], runtimeDir);
    const paths = result.output.results.map((entry) => relativeTruthPath(entry.sourcePath));
    const relevant = new Set(spec.relevant);
    const index = paths.findIndex((entry) => relevant.has(entry));
    return {
      ...spec,
      rank: index >= 0 ? index + 1 : null,
      topPaths: paths,
      wallMs: result.wallMs,
      telemetry: result.output.telemetry,
    };
  });
  const daemon = readDaemonMetrics(runtimeDir);
  stopDaemon(runtimeDir);
  return {
    cold: { wallMs: cold.wallMs, telemetry: cold.output.telemetry },
    summary: summarize(entries),
    entries,
    daemon,
  };
}

const tokenizerCache = path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local"), "claw", "models");
transformersEnv.cacheDir = tokenizerCache;
transformersEnv.allowRemoteModels = false;
const tokenizer = await AutoTokenizer.from_pretrained("jinaai/jina-embeddings-v2-base-zh", { local_files_only: true });

const startedAt = new Date().toISOString();
const before = {
  store: inspectStore(),
  tokens: await measureTokenLengths(tokenizer),
  queries: runQueries("before"),
};

const indexRuntime = path.join(os.tmpdir(), `claw-chunking-index-${process.pid}`);
const refreshes = [];
let refresh;
do {
  refresh = runCli(["search", "index", "--refresh"], indexRuntime);
  refreshes.push({ wallMs: refresh.wallMs, ...refresh.output });
} while (refresh.output.pendingFileCount > 0);
const indexDaemon = readDaemonMetrics(indexRuntime);
stopDaemon(indexRuntime);

const after = {
  store: inspectStore(),
  tokens: await measureTokenLengths(tokenizer),
  queries: runQueries("after"),
};

const report = {
  schemaVersion: 1,
  startedAt,
  finishedAt: new Date().toISOString(),
  runtime: {
    platform: process.platform,
    node: process.version,
    cpu: os.cpus()[0]?.model ?? null,
    logicalCpuCount: os.cpus().length,
  },
  model: "jinaai/jina-embeddings-v2-base-zh",
  dimensions: 768,
  chunking: { targetTokens: 448, overlapTokens: 64, version: "token-aware-v1" },
  before,
  index: {
    refreshCount: refreshes.length,
    wallMs: Number(refreshes.reduce((sum, entry) => sum + entry.wallMs, 0).toFixed(2)),
    processedFileCount: refreshes.reduce((sum, entry) => sum + entry.processedFileCount, 0),
    pendingFileCount: refresh.output.pendingFileCount,
    vectorIndex: refresh.output.vectorIndex,
    daemon: indexDaemon,
  },
  after,
  comparison: {
    vectorCountRatio: Number((after.store.vectors / before.store.vectors).toFixed(4)),
    rankChanges: corpus.queries.map((query, index) => ({
      id: query.id,
      before: before.queries.entries[index]?.rank ?? null,
      after: after.queries.entries[index]?.rank ?? null,
    })).filter((entry) => entry.before !== entry.after),
  },
};

const text = `${JSON.stringify(report, null, 2)}\n`;
if (outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, text, "utf8");
  process.stdout.write(`${JSON.stringify({ ok: true, outputPath, vectors: after.store.vectors, indexWallMs: report.index.wallMs })}\n`);
} else {
  process.stdout.write(text);
}
