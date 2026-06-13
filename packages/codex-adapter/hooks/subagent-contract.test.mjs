import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const hooksDir = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(hooksDir, "..");

function readPluginFile(relativePath) {
  return fs.readFileSync(path.join(pluginRoot, relativePath), "utf-8");
}

test("researcher dispatch contract stays explicit, host-light, and blocking for research work", () => {
  const researcherSkill = readPluginFile(path.join("skills", "researcher", "SKILL.md"));
  const dispatchReference = readPluginFile(path.join("references", "codex-subagent-dispatch.md"));
  const workflowReference = readPluginFile(path.join("references", "workflow-guidance-consumption.md"));

  assert.match(researcherSkill, /do not read (?:the )?search skill inline before dispatch/i);
  assert.match(researcherSkill, /attach (?:the )?`claw-kit:researcher` skill explicitly/i);
  assert.match(researcherSkill, /for research tasks, wait for the result/i);
  assert.match(researcherSkill, /do not skip ahead/i);

  assert.match(dispatchReference, /do not read (?:the )?search skill inline/i);
  assert.match(dispatchReference, /attach (?:the )?`claw-kit:researcher` skill item/i);
  assert.match(dispatchReference, /if the task is research, wait for completion/i);
  assert.match(dispatchReference, /do not skip ahead/i);

  assert.match(workflowReference, /the main agent does not need to read specialist skill files inline before dispatch/i);
  assert.match(workflowReference, /for a research delegate, the host must wait when the task is research/i);
});
