import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
function flag(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}
function read(name) {
  const value = flag(name);
  if (!value) throw new Error(`${name} is required.`);
  return JSON.parse(fs.readFileSync(path.resolve(repoRoot, value), "utf8"));
}
function metricDelta(before, after) {
  return Object.fromEntries(
    ["top1", "recallAt5", "recallAt10", "mrrAt10", "candidateCoverage", "criticalMissesAt5"]
      .map((key) => [key, Number((after[key] - before[key]).toFixed(4))]),
  );
}

const before = read("--before");
const after = read("--after");
const outputValue = flag("--output");
if (!outputValue) throw new Error("--output is required.");
const outputPath = path.resolve(repoRoot, outputValue);
const beforeById = new Map(before.queries.map((entry) => [entry.id, entry]));
const changes = after.queries.flatMap((entry) => {
  const previous = beforeById.get(entry.id);
  if (!previous || previous.rank === entry.rank) return [];
  const beforeRank = previous.rank ?? Number.POSITIVE_INFINITY;
  const afterRank = entry.rank ?? Number.POSITIVE_INFINITY;
  return [{
    id: entry.id,
    query: entry.query,
    category: entry.category,
    signal: entry.signal,
    beforeRank: previous.rank,
    afterRank: entry.rank,
    direction: afterRank < beforeRank ? "gain" : "regression",
    relevant: entry.relevant,
  }];
});
const sliceDelta = (key) => Object.fromEntries(
  Object.keys(after[key]).sort().map((name) => [name, metricDelta(before[key][name], after[key][name])]),
);
const output = {
  schemaVersion: 1,
  before: before.snapshot,
  after: after.snapshot,
  overallBefore: before.overall,
  overallAfter: after.overall,
  overallDelta: metricDelta(before.overall, after.overall),
  byCategoryDelta: sliceDelta("byCategory"),
  bySignalDelta: sliceDelta("bySignal"),
  gains: changes.filter((entry) => entry.direction === "gain").sort((left, right) => (right.beforeRank ?? 1e9) - (right.afterRank ?? 1e9) - ((left.beforeRank ?? 1e9) - (left.afterRank ?? 1e9))),
  regressions: changes.filter((entry) => entry.direction === "regression").sort((left, right) => (right.afterRank ?? 1e9) - (right.beforeRank ?? 1e9) - ((left.afterRank ?? 1e9) - (left.beforeRank ?? 1e9))),
  unchanged: after.queries.length - changes.length,
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ ok: true, outputPath, overallDelta: output.overallDelta, gains: output.gains.length, regressions: output.regressions.length, unchanged: output.unchanged })}\n`);
