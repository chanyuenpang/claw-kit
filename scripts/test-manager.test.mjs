import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import {
  CLI_DOMAIN_TEST_FILES,
  createExecutionPlan,
  selectDomains,
  TEST_DOMAINS,
} from "./test-manager.mjs";

test("functional paths select their focused test domains", () => {
  assert.deepEqual(selectDomains(["packages/core/src/embedding-local.ts"]).domains, ["embeddings"]);
  assert.deepEqual(selectDomains(["packages/cli/src/session-daemon.ts"]).domains, ["session-protocol"]);
  assert.deepEqual(selectDomains(["packages/cli/src/command-service.ts"]).domains, ["session-commands"]);
  assert.deepEqual(selectDomains(["packages/cli/src/search-entry.ts"]).domains, ["cli-search"]);
  assert.deepEqual(selectDomains(["packages/cli/src/knowledge-hook-preflight.ts"]).domains, ["cli-closeout"]);
  assert.deepEqual(selectDomains(["packages/cli/src/codex-driver.ts"]).domains, ["cli-host-actions"]);
  assert.deepEqual(selectDomains(["packages/cli/test/cli-workflow.test.ts"]).domains, ["cli-workflow"]);
  assert.deepEqual(selectDomains(["packages/cli/src/cli.ts"]).domains, [
    "cli-closeout",
    "cli-host-actions",
    "cli-project",
    "cli-search",
    "cli-session-scope",
    "cli-surface",
    "cli-workflow",
  ]);
  assert.deepEqual(selectDomains(["shared/skills/planning/SKILL.md"]).domains, ["shared-skills"]);
  assert.deepEqual(selectDomains(["packages/dsh-adapter/src/index.ts"]).domains, ["dsh"]);
});

test("explicit cross-boundary paths select every required domain", () => {
  assert.deepEqual(selectDomains(["packages/client/src/protocol.ts"]).domains, [
    "session-commands",
    "session-protocol",
  ]);
  assert.deepEqual(selectDomains(["packages/cli/src/session-registry-v2.ts"]).domains, [
    "session-focus",
    "session-state",
  ]);
});

test("documentation-only paths do not schedule executable tests", () => {
  assert.deepEqual(selectDomains(["README.md", "docs/session-notes.md"]), { domains: [], unmatched: [] });
});

test("cross-cutting and unclassified paths conservatively select the full suite", () => {
  assert.deepEqual(selectDomains(["package.json"]).domains, ["full"]);
  assert.deepEqual(selectDomains(["new-runtime/tool.ts"]), { domains: ["full"], unmatched: ["new-runtime/tool.ts"] });
});

test("execution planning rejects unknown domains and deduplicates shared setup", () => {
  assert.throws(() => createExecutionPlan(["missing"]), /Unknown test domain/);
  const steps = createExecutionPlan(["session-commands", "session-protocol"]);
  assert.equal(steps.filter((step) => step.args.join(" ") === "run build -w @veewo/claw-core").length, 1);
});

test("every declared domain produces at least one executable step", () => {
  for (const domain of Object.keys(TEST_DOMAINS)) assert.ok(createExecutionPlan([domain]).length > 0, domain);
  assert.equal(Object.hasOwn(TEST_DOMAINS, "cli-compat"), false);
});

test("the full suite runs every workspace runtime adapter test gate", () => {
  const commands = createExecutionPlan(["full"]).map((step) => step.args.join(" "));
  assert.ok(commands.includes("run test -w @veewo/dsh-claw-kit"));
  assert.ok(commands.includes("run test -w @claw-kit/openclaw-adapter"));
});

test("CLI domain files replace the monolith with unique discoverable tests", () => {
  const repoRoot = path.resolve(import.meta.dirname, "..");
  const testDir = path.join(repoRoot, "packages", "cli", "test");
  assert.equal(fs.existsSync(path.join(testDir, "cli.test.ts")), false);

  const names = new Set();
  for (const [domain, basename] of Object.entries(CLI_DOMAIN_TEST_FILES)) {
    const file = path.join(testDir, `${basename}.ts`);
    const source = fs.readFileSync(file, "utf8");
    const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const domainNames = sourceFile.statements
      .filter((statement) => ts.isExpressionStatement(statement)
        && ts.isCallExpression(statement.expression)
        && statement.expression.expression.getText(sourceFile) === "test")
      .map((statement) => statement.expression.arguments[0])
      .map((name) => ts.isStringLiteral(name) ? name.text : null);
    assert.ok(domainNames.length > 0, domain);
    for (const name of domainNames) {
      assert.ok(name, `${domain} contains a dynamic test name`);
      assert.equal(names.has(name), false, `duplicate CLI test: ${name}`);
      names.add(name);
    }
  }

  assert.equal(names.size, 144);
  const plannedFiles = createExecutionPlan(Object.keys(CLI_DOMAIN_TEST_FILES))
    .filter((step) => step.kind === "node" && step.args[0] === "--test")
    .map((step) => path.basename(step.args[1]))
    .sort();
  assert.deepEqual(plannedFiles, Object.values(CLI_DOMAIN_TEST_FILES).map((name) => `${name}.js`).sort());
});
