import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The DSH delegation contract belongs to the skills that actually delegate:
// `researcher` and `feature-architecture`. The general workflow entry
// (`using-claw-kit`) carries none of it -- on DSH the knowledge finalizer is
// dispatched by the adapter, so the main workflow path needs no delegation
// capability at all. These are text assertions on purpose: the contract IS
// text, and the failure they protect against (a model reading a host-agnostic
// "wait for completion" and choosing the one DSH form that destroys reuse) is
// a wording failure.

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (...segments) => fs.readFileSync(path.join(packageRoot, ...segments), "utf8");

const researcher = read("skills", "researcher", "SKILL.md");
const usingClawKit = read("skills", "using-claw-kit", "SKILL.md");
const featureArchitecture = read("skills", "feature-architecture", "SKILL.md");
const featureArchitectureSource = fs.readFileSync(
  path.resolve(packageRoot, "..", "..", "shared", "skills", "feature-architecture", "SKILL.md"),
  "utf8",
);
const builtPlugin = read("lib", "index.js");

test("the researcher skill carries the DSH delegation contract itself", () => {
  assert.match(researcher, /## Host routing/);
  assert.match(researcher, /delegateSubagents:/);
  assert.match(researcher, /preferReuse: true/);
  assert.match(researcher, /closePolicy: keep_open_for_reuse/);
  // The retired framing: delegation was "optional" and background was a
  // preference, which is how a foreground run became the default.
  assert.doesNotMatch(researcher, /DSH delegation \(optional\)/);
  assert.doesNotMatch(researcher, /prefer `run_in_background: true`/);
});

test("the researcher contract names the durable form, the reuse sequence and the fallback", () => {
  assert.match(researcher, /list_agents/);
  assert.match(researcher, /send_message/);
  assert.match(researcher, /omitting[\s\S]{0,24}run_in_background/);
  assert.match(researcher, /Never pass `run_in_background: false`/);
  assert.match(researcher, /session-scoped and best-effort/);
  assert.match(researcher, /UNAUTHORIZED/);
  assert.match(researcher, /NOT_RESUMABLE/);
  assert.match(researcher, /Enumerable is not\s+reusable/);
});

test("feature-architecture routes delegation per host, naming the DSH form", () => {
  assert.match(featureArchitectureSource, /list_agents/);
  assert.match(featureArchitectureSource, /send_message/);
  assert.match(featureArchitectureSource, /spawn_agent/);
  assert.match(featureArchitectureSource, /wait_agent/);
  assert.match(featureArchitectureSource, /run_in_background/);
  assert.match(featureArchitectureSource, /UNAUTHORIZED/);
  assert.match(featureArchitectureSource, /NOT_RESUMABLE/);
  // The synced copy the model actually reads must carry the same routing.
  assert.match(featureArchitecture, /list_agents/);
  assert.match(featureArchitecture, /run_in_background/);
});

test("the general workflow entry carries no delegation capability", () => {
  assert.doesNotMatch(usingClawKit, /## 委派与复用/);
  assert.doesNotMatch(usingClawKit, /dsh-delegation-contract/);
  assert.doesNotMatch(usingClawKit, /run_in_background/);
  assert.doesNotMatch(usingClawKit, /list_agents/);
});

test("no surface still points at the retired using-claw-kit references file", () => {
  assert.doesNotMatch(builtPlugin, /dsh-delegation-contract/);
  assert.equal(
    fs.existsSync(path.join(packageRoot, "skills", "using-claw-kit", "references")),
    false,
    "the misplaced contract file must be gone",
  );
});
