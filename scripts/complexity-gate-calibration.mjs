import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const corpusPath = path.join(repoRoot, "benchmarks", "complexity-gate-corpus.json");
const corpus = JSON.parse(fs.readFileSync(corpusPath, "utf8"));

function classify(entry, dependencyField) {
  const score = entry.files + entry.clarity + entry[dependencyField] + entry.workflow;
  return { score, formal: score >= 6 };
}

function summarize(dependencyField) {
  const results = corpus.cases.map((entry) => ({
    id: entry.id,
    band: entry.band,
    expectedFormal: entry.expectedFormal,
    ...classify(entry, dependencyField),
  }));
  const low = results.filter((entry) => entry.band === "low");
  const expectedFormal = results.filter((entry) => entry.expectedFormal);
  return {
    results,
    lowFalsePositiveRate: low.filter((entry) => entry.formal).length / low.length,
    formalRecall: expectedFormal.filter((entry) => entry.formal).length / expectedFormal.length,
    accuracy: results.filter((entry) => entry.formal === entry.expectedFormal).length / results.length,
  };
}

const legacy = summarize("legacyDependency");
const calibrated = summarize("calibratedDependency");
const report = {
  schemaVersion: 1,
  corpusPath,
  caseCount: corpus.cases.length,
  legacy: {
    lowFalsePositiveRate: legacy.lowFalsePositiveRate,
    formalRecall: legacy.formalRecall,
    accuracy: legacy.accuracy,
  },
  calibrated: {
    lowFalsePositiveRate: calibrated.lowFalsePositiveRate,
    formalRecall: calibrated.formalRecall,
    accuracy: calibrated.accuracy,
  },
  improvement: {
    lowFalsePositiveRateDelta: calibrated.lowFalsePositiveRate - legacy.lowFalsePositiveRate,
  },
  calibratedResults: calibrated.results,
};

if (calibrated.lowFalsePositiveRate > legacy.lowFalsePositiveRate || calibrated.formalRecall < 1) {
  process.stderr.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
