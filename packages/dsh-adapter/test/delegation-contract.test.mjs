import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { assembleSkills } from "../../../scripts/skill-artifacts.mjs";
import { fileURLToPath } from "node:url";

// Check the installed shape in a fresh artifact, not removed source mirrors.
const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const artifactRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-dsh-delegation-"));
after(() => fs.rmSync(artifactRoot, { recursive: true, force: true }));
await assembleSkills({ sourceRoot, targetHost: "dsh", outputRoot: artifactRoot });
const readSkill = (name, file = "SKILL.md") =>
  fs.readFileSync(path.join(artifactRoot, "skills", name, file), "utf8");
const researcher = readSkill("researcher");
const architect = readSkill("feature-architecture");
const researchHost = readSkill("researcher", "references/host-execution.md");
const architectureHost = readSkill("feature-architecture", "references/host-execution.md");
const dshSection = (text) => {
  const section = text.split("## DSH\n")[1]?.split("\n## ")[0];
  assert.ok(section, "the package must include a DSH execution route");
  return section;
};

test("role contracts preserve bounded assignment and prevent recursive dispatch", () => {
  assert.match(researcher, /worker: readonly/);
  assert.match(researcher, /do not delegate again/);
  assert.match(researcher, /Before every dispatch or reuse assignment/);
  assert.match(architect, /不得再次委派/);
  assert.match(architect, /包括向复用的子代理或 Worker 派送新任务/);
  for (const skill of [researcher, architect]) {
    assert.match(skill, /fork_context: false/);
    assert.match(skill, /waitForCompletion: true/);
    assert.match(skill, /skillPath:/);
    assert.match(skill, /hostRoute:/);
  }
});

test("DSH role mechanics stay inside the adapter semantic interface", () => {
  for (const host of [researchHost, architectureHost]) {
    const dsh = dshSection(host);
    for (const operation of ["delegate.start", "delegate.result", "delegate.complete"]) assert.ok(dsh.includes(operation));
    for (const backendHandle of ["job_output", "subagentId", "spawn_teammate", "send_message"]) assert.ok(!dsh.includes(backendHandle));
    assert.match(dsh, /adapter/i);
    assert.match(dsh, /unsupported|Unsupported/);
  }
});

test("architecture keeps sources readonly and grants only the task report directory", () => {
  assert.match(architect, /taskDir:.*task 绝对目录/);
  assert.match(architect, /reportDir: taskDir\/feature-architecture\//);
  assert.match(architect, /无 activeWorkflow 时两者都为 null，不创建目录或文件/);
  assert.match(architect, /源代码和项目资料只读/);
  assert.match(architect, /唯一允许的写入是一份 reportDir 内的设计报告/);
  assert.match(architect, /不要自动优先读取项目 \.agents 同名副本/);
});

test("DSH context, recall and report references stay on the native adapter", () => {
  const dsh = dshSection(architectureHost);
  for (const operation of ["context", "search", "delegate.start", "delegate.result"]) {
    assert.ok(dsh.includes(`operation: "${operation}"`), `missing native ${operation} route`);
  }
  assert.ok(dsh.includes("validates/records the report reference"));
  assert.match(dsh, /adapter owns progress and goal synchronization/);
  assert.match(dshSection(researchHost), /operation: "search"/);
  assert.doesNotMatch(dsh, /claw plan edit|claw context|claw search --query/);
});
