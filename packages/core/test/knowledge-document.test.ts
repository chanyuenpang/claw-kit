import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  analyzeKnowledgeDocument,
  compactKnowledgeDocument,
} from "../src/knowledge-document.js";
import {
  governChangedKnowledgeMarkdown,
  snapshotKnowledgeMarkdown,
} from "../src/knowledge-governance.js";

test("analyzeKnowledgeDocument reads generic hidden markers and dated evolution sections", () => {
  const content = [
    "# ADR: Example",
    "",
    "<!-- document-state: superseded -->",
    "",
    "## Decision",
    "",
    "The old decision.",
    "",
    "<!-- state: history -->",
    "## Evolution",
    "",
    "<!-- dated: 2026-07-20 -->",
    "### First transition",
    "",
    "Historical detail.",
    "",
  ].join("\n");

  const result = analyzeKnowledgeDocument(content, ".claw/truth/adr/example.md");

  assert.equal(result.kind, "adr");
  assert.equal(result.state, "superseded");
  assert.deepEqual(result.evolutionSections.map((section) => section.date), ["2026-07-20"]);
});

test("analyzeKnowledgeDocument infers kind and default state from path", () => {
  const truth = analyzeKnowledgeDocument("# Topic\n\nCurrent fact.\n", ".claw/truth/features/topic.md");
  const adr = analyzeKnowledgeDocument(
    "# ADR\n\n## Status\n\nSuperseded\n",
    ".claw/truth/adr/topic.md",
  );

  assert.equal(truth.kind, "truth");
  assert.equal(truth.state, "current");
  assert.equal(adr.kind, "adr");
  assert.equal(adr.state, "superseded");
});

test("compaction is inactive at or below the dated section limit regardless of prose size", () => {
  const content = buildDocument(3);
  const result = compactKnowledgeDocument(content, {
    datedSectionsToKeep: 3,
  });

  assert.equal(result.triggered, false);
  assert.equal(result.changed, false);
  assert.equal(result.removedSections.length, 0);
  assert.equal(result.content, content);
});

test("compaction removes oldest complete evolution sections in document order", () => {
  const content = buildDocument(4);
  const result = compactKnowledgeDocument(content, {
    datedSectionsToKeep: 2,
  });

  assert.equal(result.triggered, true);
  assert.equal(result.changed, true);
  assert.deepEqual(result.removedSections.map((section) => section.date), [
    "2026-07-20",
    "2026-07-20",
  ]);
  assert.doesNotMatch(result.content, /Evolution 1/u);
  assert.doesNotMatch(result.content, /Evolution 2/u);
  assert.match(result.content, /Evolution 3/u);
  assert.match(result.content, /Evolution 4/u);
  assert.match(result.content, /Current fact/u);
  assert.equal(result.datedSectionCountBefore, 4);
  assert.equal(result.datedSectionCountAfter, 2);
});

test("compaction never limits current content without dated evolution sections", () => {
  const content = [
    "# Topic",
    "",
    "<!-- state: current -->",
    "## Current",
    "",
    "Current one.",
    "",
    "Current two.",
    "",
    "Current three.",
    "",
  ].join("\n");
  const result = compactKnowledgeDocument(content, {
    datedSectionsToKeep: 0,
  });

  assert.equal(result.changed, false);
  assert.equal(result.triggered, false);
  assert.match(result.content, /Current one/u);
  assert.match(result.content, /Current three/u);
});

test("governChangedKnowledgeMarkdown trims only files changed after the snapshot", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claw-knowledge-governance-"));
  const unchangedPath = path.join(root, "unchanged.md");
  const changedPath = path.join(root, "adr", "changed.md");
  fs.mkdirSync(path.dirname(changedPath), { recursive: true });
  fs.writeFileSync(unchangedPath, buildDocument(4), "utf-8");
  fs.writeFileSync(changedPath, buildDocument(2), "utf-8");
  const before = snapshotKnowledgeMarkdown(root);

  fs.writeFileSync(changedPath, buildDocument(4), "utf-8");
  const result = governChangedKnowledgeMarkdown({
    truthDir: root,
    before,
    datedSectionsToKeep: 2,
  });

  assert.equal(result.changedFiles, 1);
  assert.equal(result.compactedFiles, 1);
  assert.equal(result.removedSections, 2);
  assert.equal(analyzeKnowledgeDocument(fs.readFileSync(changedPath, "utf-8")).evolutionSections.length, 2);
  assert.equal(analyzeKnowledgeDocument(fs.readFileSync(unchangedPath, "utf-8")).evolutionSections.length, 4);
});

function buildDocument(historyCount: number): string {
  const lines = [
    "# Topic",
    "",
    "<!-- state: current -->",
    "## Current",
    "",
    "Current fact.",
    "",
    "<!-- state: history -->",
    "## Evolution",
    "",
  ];
  for (let index = 1; index <= historyCount; index += 1) {
    lines.push(
      "<!-- dated: 2026-07-20 -->",
      "### Evolution " + index,
      "",
      "Historical paragraph " + index + ".",
      "",
    );
  }
  return lines.join("\n");
}
