import path from "node:path";
import { fileURLToPath } from "node:url";
import { syncSharedSkills } from "./sync-shared-skills.mjs";
export const syncPlanningSkill = syncSharedSkills;
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) syncPlanningSkill();
