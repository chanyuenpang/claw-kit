import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { knowledgeDelegateTemplatePath, resolvePlanTemplateFile, buildKnowledgeAssignmentTemplate, buildKnowledgeWriterAssignments, buildDirectKnowledgeAssignments } from "../src/index.js";

const resources = path.dirname(path.dirname(knowledgeDelegateTemplatePath()));
test("writer module reuses outcome template and preserves configured retention", async () => {
  const json = await resolvePlanTemplateFile(path.join(resources, "knowledge-writer", "TEMPLATE.json"));
  const module = await resolvePlanTemplateFile(path.join(resources, "knowledge-writer", "TEMPLATE.mjs"), "ignore", {
    knowledgeWriter: { datedSectionsToKeep: 3 }, context: { finalizeId: "example" },
  });
  assert.equal(json.tasks.length, 2);
  assert.deepEqual(module.tasks.map((task) => task.title), json.tasks.map((task) => task.title));
  assert.match(module.tasks[0]?.detail ?? "", /example/);
  assert.ok(module.rules?.some((rule) => rule.includes("at most 3")));
  assert.equal(module.knowledgeCapture, false);
});

test("external docs remain a real dependent outcome, without procedural task-id rewrites", async () => {
  const job = { finalizeId: "b".repeat(64), planPath: "source/plan.json", reportPath: "source/plan.report", writer: {}, docUpdate: { externalDocPaths: ["docs"] } };
  const template = buildKnowledgeAssignmentTemplate({ assignments: buildKnowledgeWriterAssignments(job), finalizeId: job.finalizeId, version: "1.0.0" });
  assert.equal(template.scope, undefined);
  assert.equal(template.knowledgeCapture, false);
  assert.equal(template.tasks.length, 3);
  assert.match(template.tasks[1]?.detail ?? "", /doc-updater/);
  assert.match(template.tasks[2]?.detail ?? "", /external documentation/);
  assert.match(template.tasks[1]?.detail ?? "", /failure independently/);
  assert.ok(template.tasks[2]?.detail?.includes("does not negate successful Truth/ADR maintenance"));
  const docs = await resolvePlanTemplateFile(path.join(resources, "doc-updater", "TEMPLATE.json"));
  assert.equal(docs.tasks.length, 1);
  assert.match(docs.tasks[0]?.detail ?? "", /no-edit reason/);
  for (const name of ["delegate-writer", "cindy-delegate-writer", "dsh-delegate-writer"]) {
    const delegate = JSON.parse(fs.readFileSync(path.join(resources, name, "TEMPLATE.json"), "utf8"));
    assert.equal(delegate.tasks[2].execution.lifecycle, "knowledge.result");
    assert.doesNotMatch(delegate.tasks[1].detail, /--parent|task_id:|task id 2/);
    assert.ok(delegate.rules.some((rule: string) => rule.includes("outcome-unknown")));
    assert.ok(!delegate.rules.some((rule: string) => rule.includes("Do not continue")));
  }
});

test("all canonical writer routes share the format and evidence minimum without imposing external retention", () => {
  const job = { finalizeId: "c".repeat(64), planPath: "source/plan.json", reportPath: "source/plan.report", writer: {} };
  const externalWriter = { externalSkills: ["project-writer"] };
  const finalizerBuiltin = buildKnowledgeWriterAssignments(job)[0]!;
  const finalizerExternal = buildKnowledgeWriterAssignments({ ...job, writer: externalWriter })[0]!;
  const directBuiltin = buildDirectKnowledgeAssignments({})[0]!;
  const directExternal = buildDirectKnowledgeAssignments({ writer: externalWriter })[0]!;
  for (const assignment of [finalizerBuiltin, finalizerExternal, directBuiltin, directExternal]) {
    assert.ok(assignment.prompt.includes(path.join(resources, "knowledge-writer", "knowledge-format.md")));
    assert.match(assignment.prompt, /conclusion-bearing evidence/);
    assert.match(assignment.prompt, /Preserve unrelated user edits/);
    assert.ok(assignment.prompt.includes("or manufacture an ADR"));
  }
  assert.equal(directExternal.formatPath, directBuiltin.formatPath);
  assert.ok(fs.existsSync(directExternal.formatPath!));
  for (const assignment of [finalizerExternal, directExternal]) {
    assert.doesNotMatch(assignment.prompt, /keep at most/);
    assert.match(assignment.prompt, /Invoke the project-writer skill/);
  }
});

test("optional external-document failure is an independent reported outcome on both writer routes", () => {
  for (const writer of [{}, { externalSkills: ["project-writer"] }]) {
    const job = { finalizeId: "d".repeat(64), planPath: "source/plan.json", reportPath: "source/plan.report", writer, docUpdate: { externalDocPaths: ["docs"] } };
    const assignments = buildKnowledgeWriterAssignments(job);
    const template = buildKnowledgeAssignmentTemplate({ assignments, finalizeId: job.finalizeId, version: "1.0.0" });
    for (const assignment of [assignments.at(-1)!, buildDirectKnowledgeAssignments(job).at(-1)!]) {
      assert.equal(assignment.kind, "doc_updater");
      assert.match(assignment.prompt, /failure independently/);
      assert.ok(assignment.prompt.includes("does not negate successful Truth/ADR maintenance"));
      assert.match(assignment.prompt, /unresolved external inconsistency/);
      assert.match(assignment.prompt, /do not claim the external update succeeded or replay an accepted or outcome-unknown operation/);
    }
    assert.match(JSON.stringify(template), /optional/);
  }
});
