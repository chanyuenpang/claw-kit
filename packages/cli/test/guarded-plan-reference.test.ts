import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { initProject, showPlan, writePlan } from "@veewo/claw-core";
import { decodeClawCommand } from "../dist/command-contract.js";
import { SessionCommandExecutor } from "../dist/session-command.js";
import { SessionRegistryV2, createSessionIdentity } from "../dist/session-registry-v2.js";

const references = [{ path: "report.md", why: "Feature architecture report" }];
const operations = [{ type: "plan.update", updates: { references } }];
const guarded = (expectedPlanPath: unknown) => ({ operation: "plan.edit", input: { operations, expectedPlanPath } });
const hasCode = (code: string) => (error: unknown) => error instanceof Error && "code" in error && error.code === code;

function fixture(t: { after: (fn: () => void) => void }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claw-guarded-reference-"));
  const previous = process.env.CLAW_SESSION_RUNTIME_DIR;
  process.env.CLAW_SESSION_RUNTIME_DIR = path.join(root, "session-workflows");
  t.after(() => {
    if (previous === undefined) delete process.env.CLAW_SESSION_RUNTIME_DIR;
    else process.env.CLAW_SESSION_RUNTIME_DIR = previous;
    try { fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); }
    catch (error) {
      if (!["EPERM", "EBUSY"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
    }
  });
  const cwd = path.join(root, "project");
  fs.mkdirSync(cwd);
  initProject({ cwd, projectName: "Guarded reference", planning: false });
  const registry = new SessionRegistryV2(path.join(root, "registry"));
  const executor = new SessionCommandExecutor(registry);
  const identity = { agentSessionId: "guard-parent", workdir: cwd, client: { kind: "adapter" as const, host: "dsh" } };
  const execute = (operation: string, input: Record<string, unknown> = {}) => executor.execute(identity, { operation, input });
  const create = async (taskName: string, scope: "project" | "session" = "project") => {
    const result = await execute("plan.create", { taskName, title: taskName, scope, knowledgeCapture: false,
      goalText: "Guard report registration", planStatus: "process.active" });
    return (result.output as { planPath: string }).planPath;
  };
  const focused = () => registry.read(createSessionIdentity(identity.agentSessionId, cwd).sessionKeyHash).currentPlan;
  return { cwd, registry, executor, identity, execute, create, focused };
}

test("internal plan.edit guard accepts only its optional text field and keeps identity fields closed", () => {
  const expected = path.resolve("parent-plan.json");
  assert.deepEqual(decodeClawCommand(guarded(expected)), guarded(expected));
  assert.deepEqual(decodeClawCommand({ operation: "plan.edit", input: { operations } }), { operation: "plan.edit", input: { operations } });
  for (const value of [null, 3, {}, [expected]]) assert.throws(() => decodeClawCommand(guarded(value)), /Invalid or unsupported/);
  for (const key of ["sessionId", "ownerSessionKey", "host", "workdir", "planPath", "expected_plan_path"]) {
    assert.throws(() => decodeClawCommand({ operation: "plan.edit", input: { operations, expectedPlanPath: expected, [key]: "forged" } }), /Invalid or unsupported/);
  }
});

test("matching guarded reference appends normally and unguarded edits remain compatible", async (t) => {
  const { cwd, executor, identity, execute, create, focused } = fixture(t);
  const planPath = await create("parent-a");
  const expected = process.platform === "win32" ? planPath.toUpperCase() : path.join(path.dirname(planPath), ".", path.basename(planPath));
  await executor.execute(identity, guarded(expected));
  assert.deepEqual(showPlan({ cwd, scope: "project", taskName: "parent-a" }).plan.references, references);
  await execute("plan.edit", { operations: [{ type: "plan.update", updates: { requirementsSummary: "Still compatible" } }] });
  assert.equal(focused()?.taskName, "parent-a");
});

test("changed parent focus rejects a stale report and leaves both canonical plans unchanged", async (t) => {
  const { cwd, executor, identity, execute, create, focused } = fixture(t);
  const a = await create("parent-a");
  await execute("plan.leave");
  const b = await create("parent-b");
  const beforeA = fs.readFileSync(a, "utf8");
  const beforeB = fs.readFileSync(b, "utf8");
  await assert.rejects(executor.execute(identity, guarded(a)), hasCode("PLAN_FOCUS_CHANGED"));
  assert.equal(fs.readFileSync(a, "utf8"), beforeA);
  assert.equal(fs.readFileSync(b, "utf8"), beforeB);
  assert.equal(focused()?.taskName, "parent-b");
  assert.deepEqual(showPlan({ cwd, scope: "project", taskName: "parent-b" }).plan.references, []);
});

test("guard is evaluated after a queued focus switch within serialized execution", async (t) => {
  const { cwd, executor, identity, create, focused } = fixture(t);
  const a = await create("queued-a");
  await writePlan({ cwd, scope: "project", taskName: "queued-b", title: "Queued B", knowledgeCapture: false,
    content: { title: "Queued B", goal: { text: "Switch before report callback" }, status: "process.discussing", tasks: [{ id: 1, title: "Work", status: "pending" }] } });
  const switchFocus = executor.execute(identity, { operation: "plan.resume", input: { planId: "queued-b" } });
  const staleCallback = executor.execute(identity, guarded(a));
  const [switched, denied] = await Promise.allSettled([switchFocus, staleCallback]);
  assert.equal(switched.status, "fulfilled");
  assert.equal(denied.status, "rejected");
  if (denied.status === "rejected") assert.ok(hasCode("PLAN_FOCUS_CHANGED")(denied.reason));
  assert.equal(focused()?.taskName, "queued-b");
  for (const taskName of ["queued-a", "queued-b"]) assert.deepEqual(showPlan({ cwd, scope: "project", taskName }).plan.references ?? [], []);
});

test("same task name in another storage scope cannot satisfy expected plan path", async (t) => {
  const { executor, identity, execute, create, focused } = fixture(t);
  const projectPath = await create("same-name");
  await execute("plan.leave");
  const sessionPath = await create("same-name", "session");
  const beforeProject = fs.readFileSync(projectPath, "utf8");
  const beforeSession = fs.readFileSync(sessionPath, "utf8");
  await assert.rejects(executor.execute(identity, guarded(projectPath)), hasCode("PLAN_FOCUS_CHANGED"));
  assert.equal(fs.readFileSync(projectPath, "utf8"), beforeProject);
  assert.equal(fs.readFileSync(sessionPath, "utf8"), beforeSession);
  assert.equal(focused()?.scope, "session");
  await executor.execute(identity, guarded(sessionPath));
  assert.deepEqual(JSON.parse(fs.readFileSync(sessionPath, "utf8")).references, references);
});

test("missing focus and invalid guard paths fail closed without plan writes", async (t) => {
  const { executor, identity, execute, create, focused } = fixture(t);
  const a = await create("ended-parent");
  for (const expected of ["", "   ", "relative/plan.json"]) {
    const before = fs.readFileSync(a, "utf8");
    await assert.rejects(executor.execute(identity, guarded(expected)), hasCode("PROJECT_CONFIG_INVALID"));
    assert.equal(fs.readFileSync(a, "utf8"), before);
  }
  await execute("plan.leave");
  const before = fs.readFileSync(a, "utf8");
  await assert.rejects(executor.execute(identity, guarded(a)), hasCode("PLAN_FOCUS_CHANGED"));
  assert.equal(fs.readFileSync(a, "utf8"), before);
  assert.equal(focused(), undefined);
});
