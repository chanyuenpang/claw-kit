import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createProjectPlan, writePlan } from "../src/index.js";

const fixture = () => fs.mkdtempSync(path.join(os.tmpdir(), "claw-create-project-"));
for (const capture of [undefined, true, false]) {
  test("public creation auto-initializes project storage with capture=" + capture, async () => {
    const cwd = fixture();
    const result = await createProjectPlan({ title: "Normal workflow", ...(capture === undefined ? {} : { knowledgeCapture: capture }) }, { cwd });
    assert.equal(result.scope, "project");
    assert.equal(result.plan.knowledgeCapture, capture ?? true);
    assert.ok(result.planPath.startsWith(path.join(cwd, ".claw", "tasks")));
    assert.ok(fs.existsSync(path.join(cwd, ".claw", "project.json")));
  });
}
for (const bad of [{ scope: "session" }, { scope: "project" }, { knowledgeCapture: "false" }, { forcePlanning: "false" }]) {
  test("invalid public intent is rejected before project writes: " + JSON.stringify(bad), async () => {
    const cwd = fixture();
    await assert.rejects(createProjectPlan({ title: "Rejected", ...bad } as any, { cwd }), (error: any) => {
      assert.equal(error.execution.effect, "none"); assert.equal(error.execution.outcome, "known"); return true;
    });
    assert.deepEqual(fs.readdirSync(cwd), []);
  });
}

test("auxiliary roots with identical titles cannot overwrite another actor", async () => {
  const cwd = fixture();
  const first = await createProjectPlan({ title: "Same display title", knowledgeCapture: false }, { cwd, ownerSessionKey: randomUUID() });
  const before = fs.readFileSync(first.planPath, "utf8");
  const second = await createProjectPlan({ title: "Same display title", knowledgeCapture: false }, { cwd, ownerSessionKey: randomUUID() });
  assert.notEqual(first.planPath, second.planPath);
  assert.equal(first.plan.title, second.plan.title);
  assert.equal(fs.readFileSync(first.planPath, "utf8"), before);
});

test("knowledge-result lifecycle cannot enable recursive capture, independent of template name", async () => {
  const cwd = fixture(), templateFile = path.join(cwd, "TEMPLATE.json");
  fs.writeFileSync(templateFile, JSON.stringify({ id: "different-display-id", version: "1.0.0", knowledgeCapture: false,
    title: "Auxiliary result", status: "process.active", tasks: [{ id: 1, title: "Result", status: "pending", execution: { type: "default", lifecycle: "knowledge.result" } }] }));
  await assert.rejects(createProjectPlan({ title: "Rejected", templateFile, knowledgeCapture: true }, { cwd }),
    (error: any) => { assert.equal(error.execution.effect, "none"); return true; });
  assert.equal(fs.existsSync(path.join(cwd, ".claw")), false);
  const created = await createProjectPlan({ title: "Accepted", templateFile }, { cwd });
  assert.equal(created.plan.knowledgeCapture, false);
});

test("removed template scope is rejected before project initialization", async () => {
  const cwd = fixture(), templateFile = path.join(cwd, "TEMPLATE.json");
  fs.writeFileSync(templateFile, JSON.stringify({ id: "old-scope", version: "1.0.0", scope: "session", knowledgeCapture: false,
    title: "Old template", status: "process.active", tasks: [{ id: 1, title: "Work", status: "pending" }] }));
  await assert.rejects(createProjectPlan({ title: "Rejected", templateFile }, { cwd }), { code: "PLAN_SCOPE_REMOVED" });
  assert.deepEqual(fs.readdirSync(cwd), ["TEMPLATE.json"]);
});

test("legacy session focus no longer blocks an unrelated new root", async () => {
  const cwd = fixture(), ownerSessionKey = randomUUID();
  const old = await writePlan({ cwd, scope: "session", knowledgeCapture: false, title: "Old work", ownerSessionKey });
  const before = fs.readFileSync(old.planPath, "utf8");
  // A focused legacy session plan no longer refuses an unrelated root creation;
  // the focus owner switches, and the old plan bytes stay untouched.
  const created = await createProjectPlan({ title: "New work", knowledgeCapture: false }, { cwd, ownerSessionKey });
  assert.ok(created.planPath);
  assert.equal(fs.readFileSync(old.planPath, "utf8"), before);
});

test("personal override participates before missing team config is initialized", async () => {
  const cwd = fixture();
  fs.mkdirSync(path.join(cwd, ".claw"));
  const override = path.join(cwd, ".claw", "project-override.json");
  const source = JSON.stringify({ planning: false, goalMode: false });
  fs.writeFileSync(override, source);
  const result = await createProjectPlan({ title: "No planning", knowledgeCapture: false }, { cwd });
  assert.equal(result.plan.status, "process.active");
  assert.equal(fs.readFileSync(override, "utf8"), source);
});
