import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(import.meta.dirname, "..");
const cliEntry = path.join(repoRoot, "packages", "cli", "dist", "bin.js");
const cases = [
  { name: "low", businessTaskCount: 1 },
  { name: "medium", businessTaskCount: 3 },
  { name: "high", businessTaskCount: 5 },
];

function percentile(values, ratio) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
}

function run(cwd, args) {
  const startedAt = performance.now();
  const result = spawnSync(process.execPath, [cliEntry, ...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      CLAW_HOST: "benchmark",
      CLAW_OWNER_SESSION_KEY: `workflow-benchmark-${process.pid}`,
    },
  });
  const durationMs = Number((performance.now() - startedAt).toFixed(2));
  if (result.status !== 0) {
    throw new Error(`${args.join(" ")} failed (${result.status}): ${result.stderr || result.stdout}`);
  }
  return {
    durationMs,
    output: result.stdout.trim() ? JSON.parse(result.stdout) : null,
  };
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function runCase(spec, mode) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `claw-workflow-${spec.name}-`));
  try {
    run(root, ["init", "--name", `Workflow Benchmark ${spec.name}`, "--gitnexus", "false"]);
    const title = `benchmark-${spec.name}-${Date.now()}`;
    const create = run(root, ["plan", "create", title, "--goal", `Benchmark ${spec.name} workflow`]);
    const taskName = path.basename(path.dirname(create.output.planPath));
    const patchPath = path.join(root, "plan-patch.json");
    const tasksPath = path.join(root, "tasks.json");
    writeJson(patchPath, {
      requirements: {
        summary: `Fixed ${spec.name} benchmark corpus`,
        openQuestions: [],
        acceptanceCriteria: ["All benchmark tasks complete"],
      },
      rules: ["Keep benchmark inputs deterministic"],
    });
    writeJson(tasksPath, Array.from({ length: spec.businessTaskCount }, (_, index) => ({
      title: `${spec.name} outcome ${index + 1}`,
      detail: "Deterministic benchmark task",
      status: "pending",
    })));
    const lifecycle = mode === "atomic"
      ? {
          start: run(root, [
            "plan", "start", "--task", taskName, "--patch", patchPath, "--append-tasks", tasksPath,
          ]),
        }
      : {
          patch: run(root, ["plan", "edit", "--task", taskName, "--patch", patchPath]),
          append: run(root, ["plan", "edit", "--task", taskName, "--append-tasks", tasksPath]),
          planningDone: run(root, ["plan", "edit", "--task", taskName, "--task-id", "1", "--task-status", "done"]),
          activate: run(root, ["plan", "edit", "--task", taskName, "--plan-status", "process.active"]),
        };
    const show = run(root, ["plan", "show", "--task", taskName]);
    const stages = { create, ...lifecycle, show };
    return {
      case: spec.name,
      mode,
      businessTaskCount: spec.businessTaskCount,
      managementCommandsBeforeWork: mode === "atomic" ? 3 : 6,
      planMutationCommandsBeforeWork: mode === "atomic" ? 2 : 5,
      totalBeforeWorkMs: Number(Object.values(stages)
        .filter((stage) => stage !== show)
        .reduce((sum, stage) => sum + stage.durationMs, 0)
        .toFixed(2)),
      stageMs: Object.fromEntries(Object.entries(stages).map(([name, stage]) => [name, stage.durationMs])),
      success: show.output.planStatus === "process.active",
    };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

if (!fs.existsSync(cliEntry)) {
  throw new Error(`CLI build output not found: ${cliEntry}. Run npm run build first.`);
}

const startedAt = new Date().toISOString();
const legacyResults = cases.map((spec) => runCase(spec, "legacy"));
const atomicResults = cases.map((spec) => runCase(spec, "atomic"));
const results = [...legacyResults, ...atomicResults];
const legacyTotals = legacyResults.map((result) => result.totalBeforeWorkMs);
const atomicTotals = atomicResults.map((result) => result.totalBeforeWorkMs);
const legacyP50 = percentile(legacyTotals, 0.5);
const atomicP50 = percentile(atomicTotals, 0.5);
const report = {
  schemaVersion: 2,
  startedAt,
  machine: {
    platform: process.platform,
    release: os.release(),
    arch: process.arch,
    cpu: os.cpus()[0]?.model ?? "unknown",
    node: process.version,
  },
  runtime: {
    packageVersion: JSON.parse(fs.readFileSync(path.join(repoRoot, "packages", "cli", "package.json"), "utf8")).version,
    cliEntry,
    modes: ["legacy-five-mutation", "atomic-refine-and-activate"],
  },
  corpus: cases,
  results,
  summary: {
    legacyP50BeforeWorkMs: legacyP50,
    atomicP50BeforeWorkMs: atomicP50,
    p50ImprovementPercent: Number((((legacyP50 - atomicP50) / legacyP50) * 100).toFixed(2)),
    legacyP95BeforeWorkMs: percentile(legacyTotals, 0.95),
    atomicP95BeforeWorkMs: percentile(atomicTotals, 0.95),
    allSuccessful: results.every((result) => result.success),
  },
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
