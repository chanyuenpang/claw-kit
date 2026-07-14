import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const thisDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(thisDir, "..");

export const SHARED_SKILL_NAMES = ["planning", "config", "update", "create-claw-skill"];
const defaultAdapterDirs = [
  path.join(repoRoot, "packages", "codex-adapter"),
  path.join(repoRoot, "packages", "opencode-adapter"),
];

function targetPathsForSkill(skillName, adapterDirs) {
  return adapterDirs.map((adapterDir) => path.join(adapterDir, "skills", skillName, "SKILL.md"));
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

async function copySkillDirectory(sourceDir, targetDir, skillName) {
  await fs.rm(targetDir, { recursive: true, force: true });
  await fs.mkdir(targetDir, { recursive: true });

  async function copyRecursive(currentSourceDir, currentTargetDir) {
    const entries = await fs.readdir(currentSourceDir, { withFileTypes: true });
    for (const entry of entries) {
      const sourcePath = path.join(currentSourceDir, entry.name);
      const targetPath = path.join(currentTargetDir, entry.name);
      if (entry.isDirectory()) {
        await fs.mkdir(targetPath, { recursive: true });
        await copyRecursive(sourcePath, targetPath);
      } else if (currentSourceDir === sourceDir && entry.name === "SKILL.md") {
        await writeFileAtomically(targetPath, injectBanner(await fs.readFile(sourcePath, "utf8"), skillName));
      } else {
        await fs.copyFile(sourcePath, targetPath);
      }
    }
  }

  await copyRecursive(sourceDir, targetDir);
}

export async function syncSharedSkills({ adapterDirs = defaultAdapterDirs } = {}) {
  const synced = [];

  for (const skillName of SHARED_SKILL_NAMES) {
    const sourceDir = path.join(repoRoot, "shared", "skills", skillName);
    const sourcePath = path.join(sourceDir, "SKILL.md");
    const targetPaths = targetPathsForSkill(skillName, adapterDirs);

    for (const targetPath of targetPaths) {
      await copySkillDirectory(sourceDir, path.dirname(targetPath), skillName);
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
