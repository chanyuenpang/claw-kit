// Deliberately fail old callers instead of recreating generated source trees.
import path from "node:path";
import { fileURLToPath } from "node:url";

function removed() {
  throw new Error("Source-tree skill synchronization was removed. Use skill-artifacts.mjs with explicit sourceRoot, targetHost and outputRoot; check sources with --check-source.");
}
export const syncSharedSkills = removed;
export const verifySharedSkillsSynced = removed;
export const assertSharedSkillsSynced = removed;
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) removed();
