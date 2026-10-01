import test from "node:test";
import assert from "node:assert/strict";
import { syncSharedSkills, verifySharedSkillsSynced, assertSharedSkillsSynced } from "./sync-shared-skills.mjs";
import { syncPlanningSkill } from "./sync-planning-skill.mjs";

test("obsolete sync-back APIs fail explicitly without writing source mirrors", () => {
  for (const operation of [syncSharedSkills, verifySharedSkillsSynced, assertSharedSkillsSynced, syncPlanningSkill]) {
    assert.throws(() => operation({}), /Source-tree skill synchronization was removed/);
  }
});
