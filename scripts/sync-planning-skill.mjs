import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const thisDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(thisDir, "..");

const sourcePath = path.join(repoRoot, "shared", "skills", "planning", "SKILL.md");
const targetPaths = [
  path.join(repoRoot, "packages", "codex-adapter", "skills", "planning", "SKILL.md"),
  path.join(repoRoot, "packages", "opencode-adapter", "skills", "planning", "SKILL.md"),
];

const generatedBanner = "<!-- AUTO-GENERATED from shared/skills/planning/SKILL.md. Edit the shared source instead. -->\n";

function injectBanner(content) {
  const trimmed = content.replace(/\r\n/g, "\n");
  const frontmatterEnd = trimmed.indexOf("\n---\n", 4);
  if (frontmatterEnd === -1) {
    throw new Error("Shared planning skill is missing a closing frontmatter delimiter.");
  }
  const insertAt = frontmatterEnd + "\n---\n".length;
  return `${trimmed.slice(0, insertAt)}${generatedBanner}${trimmed.slice(insertAt)}`;
}

export async function syncPlanningSkill() {
  const source = await fs.readFile(sourcePath, "utf8");
  const generated = injectBanner(source);

  for (const targetPath of targetPaths) {
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, generated, "utf8");
  }

  return {
    sourcePath,
    targetPaths: [...targetPaths],
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const result = await syncPlanningSkill();
  console.log(`Synced shared planning skill from ${result.sourcePath}`);
}
