import { syncSharedSkills } from "./sync-shared-skills.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export async function syncPlanningSkill() {
  return syncSharedSkills();
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const result = await syncPlanningSkill();
  for (const entry of result.synced) {
    console.log(`Synced shared ${entry.skillName} skill from ${entry.sourcePath}`);
  }
}
