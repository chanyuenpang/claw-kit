import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const corpusPath = path.join(repoRoot, "benchmarks", "complexity-gate-corpus.json");
const corpus = JSON.parse(fs.readFileSync(corpusPath, "utf8"));
const validStates = new Set(["direct", "discussing", "active"]);

for (const entry of corpus.cases) {
  for (const field of ["expectedKnowledgeDeposition", "nextTasksExplicit", "canProceedWithoutUser"]) {
    if (typeof entry[field] !== "boolean") {
      throw new TypeError(`${entry.id}.${field} must be a boolean`);
    }
  }
  if (!validStates.has(entry.expectedState)) {
    throw new TypeError(`${entry.id}.expectedState must be direct, discussing, or active`);
  }
}

function classifyByScore(entry, dependencyField) {
  const score = entry.files + entry.clarity + entry[dependencyField] + entry.workflow;
  return { score, state: score >= 6 ? "active" : "direct" };
}

function classifyByKnowledgeOnly(entry) {
  return { state: entry.expectedKnowledgeDeposition ? "active" : "direct" };
}

function classifyByKnowledgeAndHandoff(entry) {
  if (!entry.expectedKnowledgeDeposition) return { state: "direct" };
  return { state: entry.canProceedWithoutUser ? "active" : "discussing" };
}

function classifyByLifecycle(entry) {
  if (!entry.expectedKnowledgeDeposition) return { state: "direct" };
  return {
    state: entry.nextTasksExplicit && entry.canProceedWithoutUser ? "active" : "discussing",
  };
}

function summarize(classify) {
  const results = corpus.cases.map((entry) => ({
    id: entry.id,
    band: entry.band,
    expectedState: entry.expectedState,
    ...classify(entry),
  }));
  const expectedDirect = results.filter((entry) => entry.expectedState === "direct");
  const expectedFormal = results.filter((entry) => entry.expectedState !== "direct");
  const expectedDiscussing = results.filter((entry) => entry.expectedState === "discussing");
  return {
    results,
    directFalsePositiveRate:
      expectedDirect.filter((entry) => entry.state !== "direct").length / expectedDirect.length,
    formalRecall:
      expectedFormal.filter((entry) => entry.state !== "direct").length / expectedFormal.length,
    prematureActivationRate:
      expectedDiscussing.filter((entry) => entry.state === "active").length / expectedDiscussing.length,
    stateAccuracy:
      results.filter((entry) => entry.state === entry.expectedState).length / results.length,
  };
}

const legacy = summarize((entry) => classifyByScore(entry, "legacyDependency"));
const calibratedScore = summarize((entry) => classifyByScore(entry, "calibratedDependency"));
const knowledgeOnly = summarize(classifyByKnowledgeOnly);
const knowledgeAndHandoff = summarize(classifyByKnowledgeAndHandoff);
const lifecycle = summarize(classifyByLifecycle);
const metrics = (summary) => ({
  directFalsePositiveRate: summary.directFalsePositiveRate,
  formalRecall: summary.formalRecall,
  prematureActivationRate: summary.prematureActivationRate,
  stateAccuracy: summary.stateAccuracy,
});
const report = {
  schemaVersion: 4,
  corpusPath,
  caseCount: corpus.cases.length,
  legacy: metrics(legacy),
  calibratedScore: metrics(calibratedScore),
  knowledgeOnly: metrics(knowledgeOnly),
  knowledgeAndHandoff: metrics(knowledgeAndHandoff),
  lifecycle: metrics(lifecycle),
  lifecycleResults: lifecycle.results,
};

if (
  lifecycle.directFalsePositiveRate > 0 ||
  lifecycle.formalRecall < 1 ||
  lifecycle.prematureActivationRate > 0 ||
  lifecycle.stateAccuracy < 1
) {
  process.stderr.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
