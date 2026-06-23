import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const thisDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(thisDir, "..");

const sharedSkills = ["planning", "config"];

function targetPathsForSkill(skillName) {
  return [
    path.join(repoRoot, "packages", "codex-adapter", "skills", skillName, "SKILL.md"),
    path.join(repoRoot, "packages", "opencode-adapter", "skills", skillName, "SKILL.md"),
  ];
}

function injectBanner(content, skillName) {
  const trimmed = content.replace(/\r\n/g, "\n");
  const frontmatterEnd = trimmed.indexOf("\n---\n", 4);
  if (frontmatterEnd === -1) {
    throw new Error(`Shared ${skillName} skill is missing a closing frontmatter delimiter.`);
  }
  const insertAt = frontmatterEnd + "\n---\n".length;
  const generatedBanner = `<!-- AUTO-GENERATED from shared/skills/${skillName}/SKILL.md. Edit the shared source instead. -->\n`;
  return `${trimmed.slice(0, insertAt)}${generatedBanner}${trimmed.slice(insertAt)}`;
}

async function writeFileAtomically(targetPath, content) {
  const tempPath = path.join(
    path.dirname(targetPath),
    `.${path.basename(targetPath)}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`,
  );
  await fs.writeFile(tempPath, content, "utf8");
  await fs.rename(tempPath, targetPath);
}

export async function syncSharedSkills() {
  const synced = [];

  for (const skillName of sharedSkills) {
    const sourcePath = path.join(repoRoot, "shared", "skills", skillName, "SKILL.md");
    const targetPaths = targetPathsForSkill(skillName);
    const source = await fs.readFile(sourcePath, "utf8");
    const generated = injectBanner(source, skillName);

    for (const targetPath of targetPaths) {
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await writeFileAtomically(targetPath, generated);
    }

    synced.push({
      skillName,
      sourcePath,
      targetPaths,
    });
  }

  return {
    synced,
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const result = await syncSharedSkills();
  for (const entry of result.synced) {
    console.log(`Synced shared ${entry.skillName} skill from ${entry.sourcePath}`);
  }
}
