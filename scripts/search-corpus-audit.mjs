import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const repoRoot = path.resolve(import.meta.dirname, "..");

function flag(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

const projectRoot = path.resolve(flag("--project-root") ?? "");
const developmentPath = path.resolve(repoRoot, flag("--development") ?? "benchmarks/search/tiny-world-hybrid-development-corpus.json");
const holdoutPath = path.resolve(repoRoot, flag("--holdout") ?? "benchmarks/search/tiny-world-hybrid-holdout-corpus.json");
if (!flag("--project-root")) throw new Error("--project-root is required.");

const development = JSON.parse(fs.readFileSync(developmentPath, "utf8"));
const holdout = JSON.parse(fs.readFileSync(holdoutPath, "utf8"));
const databasePath = path.join(projectRoot, ".claw", "memory.sqlite");
const db = new DatabaseSync(databasePath, { readOnly: true });
const indexedPaths = new Set(
  db.prepare("SELECT source_path FROM docs").all()
    .map((row) => path.relative(projectRoot, row.source_path).replaceAll("\\", "/")),
);
db.close();

function duplicates(values) {
  const seen = new Set();
  const repeated = new Set();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated];
}

function auditSplit(document, expectedSplit, minimumQuality) {
  const quality = document.queries.filter((entry) => entry.category !== "lexical_control");
  const issues = [];
  if (document.split !== expectedSplit) issues.push(`split must be ${expectedSplit}`);
  if (quality.length < minimumQuality) issues.push(`quality query count ${quality.length} < ${minimumQuality}`);
  const duplicateIds = duplicates(document.queries.map((entry) => entry.id));
  const duplicateQueries = duplicates(document.queries.map((entry) => entry.query.trim().toLowerCase()));
  if (duplicateIds.length > 0) issues.push(`duplicate ids: ${duplicateIds.join(", ")}`);
  if (duplicateQueries.length > 0) issues.push(`duplicate queries: ${duplicateQueries.slice(0, 5).join(" | ")}`);
  for (const entry of document.queries) {
    const minimumLength = entry.category === "lexical_control" ? 4 : 12;
    if (!entry.query?.trim() || entry.query.length < minimumLength || entry.query.length > 300) {
      issues.push(`${entry.id}: query length ${entry.query?.length ?? 0} outside ${minimumLength}..300`);
    }
    if (!Array.isArray(entry.relevant) || entry.relevant.length === 0) {
      issues.push(`${entry.id}: relevant paths required`);
      continue;
    }
    for (const target of entry.relevant) {
      if (!indexedPaths.has(target)) issues.push(`${entry.id}: target not indexed: ${target}`);
    }
  }
  return { quality: quality.length, total: document.queries.length, issues };
}

const developmentAudit = auditSplit(development, "development", 100);
const holdoutAudit = auditSplit(holdout, "sealed_holdout", 100);
const developmentTargets = new Set(development.queries.flatMap((entry) => entry.relevant));
const overlap = [...new Set(holdout.queries.flatMap((entry) => entry.relevant))]
  .filter((target) => developmentTargets.has(target));
const crossSplitIds = duplicates([...development.queries, ...holdout.queries].map((entry) => entry.id));
const issues = [
  ...developmentAudit.issues,
  ...holdoutAudit.issues,
  ...(overlap.length > 0 ? [`target overlap: ${overlap.join(", ")}`] : []),
  ...(crossSplitIds.length > 0 ? [`cross-split duplicate ids: ${crossSplitIds.join(", ")}`] : []),
];

const result = {
  ok: issues.length === 0,
  development: developmentAudit,
  holdout: holdoutAudit,
  targetOverlap: overlap.length,
  indexedDocuments: indexedPaths.size,
  issues,
};
process.stdout.write(`${JSON.stringify(result)}\n`);
if (!result.ok) process.exitCode = 1;
