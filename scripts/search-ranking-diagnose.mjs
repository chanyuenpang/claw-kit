import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");

function flag(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

const snapshotPath = path.resolve(repoRoot, flag("--snapshot") ?? "benchmarks/search/tiny-world-hybrid-development-candidates.json");
const outputPath = path.resolve(repoRoot, flag("--output") ?? "benchmarks/search/tiny-world-hybrid-development-baseline-diagnosis.json");
const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));

function mean(values) {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function summarize(entries) {
  return {
    queries: entries.length,
    top1: Number(mean(entries.map((entry) => entry.rank === 1 ? 1 : 0)).toFixed(4)),
    recallAt5: Number(mean(entries.map((entry) => entry.rank !== null && entry.rank <= 5 ? 1 : 0)).toFixed(4)),
    recallAt10: Number(mean(entries.map((entry) => entry.rank !== null && entry.rank <= 10 ? 1 : 0)).toFixed(4)),
    mrrAt10: Number(mean(entries.map((entry) => entry.rank !== null && entry.rank <= 10 ? 1 / entry.rank : 0)).toFixed(4)),
    candidateCoverage: Number(mean(entries.map((entry) => entry.rank !== null ? 1 : 0)).toFixed(4)),
    criticalMissesAt5: entries.filter((entry) => entry.critical && (entry.rank === null || entry.rank > 5)).length,
  };
}

function group(entries, key) {
  return Object.fromEntries(
    Array.from(new Set(entries.map((entry) => entry[key])))
      .sort()
      .map((value) => [value, summarize(entries.filter((entry) => entry[key] === value))]),
  );
}

const queries = snapshot.candidates.map((query) => {
  const relevant = new Set(query.relevant);
  const relevantCandidates = query.candidates.filter((candidate) => relevant.has(candidate.sourcePath));
  const bestRelevant = relevantCandidates.sort((left, right) => left.actualRank - right.actualRank)[0] ?? null;
  const rank = bestRelevant?.actualRank ?? null;
  const leadingInterferers = rank === null
    ? query.candidates.slice(0, 5)
    : query.candidates.slice(0, Math.min(rank - 1, 5));
  return {
    id: query.id,
    query: query.query,
    category: query.category,
    signal: query.signal,
    critical: query.critical,
    relevant: query.relevant,
    rank,
    candidateCount: query.candidates.length,
    bestRelevant: bestRelevant && {
      sourcePath: bestRelevant.sourcePath,
      ranking: bestRelevant.ranking,
    },
    failureClass: rank === null ? "candidate_miss" : rank > 10 ? "deep_ranking" : rank > 5 ? "top10_ranking" : rank > 1 ? "top5_ranking" : "top1",
    leadingInterferers: leadingInterferers.map((candidate) => ({
      sourcePath: candidate.sourcePath,
      actualRank: candidate.actualRank,
      ranking: candidate.ranking,
    })),
  };
});

const failureClasses = Object.fromEntries(
  Array.from(new Set(queries.map((entry) => entry.failureClass)))
    .sort()
    .map((failureClass) => [failureClass, queries.filter((entry) => entry.failureClass === failureClass).length]),
);
const routeCoverage = {
  vector: queries.filter((entry) => entry.bestRelevant?.ranking.vectorRank).length,
  fulltext: queries.filter((entry) => entry.bestRelevant?.ranking.textRank).length,
  signal: queries.filter((entry) => entry.bestRelevant?.ranking.signalRank).length,
  noRoute: queries.filter((entry) => entry.rank === null).length,
};

const output = {
  schemaVersion: 1,
  snapshot: snapshotPath,
  frozenIndex: snapshot.projectRoot,
  overall: summarize(queries),
  byCategory: group(queries, "category"),
  bySignal: group(queries, "signal"),
  failureClasses,
  relevantRouteCoverage: routeCoverage,
  queries,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ ok: true, outputPath, overall: output.overall, failureClasses, routeCoverage })}\n`);
