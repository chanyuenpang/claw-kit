import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const thisDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = path.resolve(thisDir, "..");

export const SHARED_SKILL_NAMES = ["planning", "config", "update", "create-claw-skill"];
let syncQueue = Promise.resolve();
const LOCK_RETRY_MS = 50;
const LOCK_TIMEOUT_MS = 10_000;

function targetPathsForSkill(repoRoot, skillName) {
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRepoLock(repoRoot, work) {
  const lockPath = path.join(repoRoot, ".sync-shared-skills.lock");
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  let handle;

  while (!handle) {
    try {
      handle = await fs.open(lockPath, "wx");
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "EEXIST" && Date.now() < deadline) {
        await sleep(LOCK_RETRY_MS);
        continue;
      }
      throw error;
    }
  }

  try {
    return await work();
  } finally {
    await handle.close();
    await fs.rm(lockPath, { force: true });
  }
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
        continue;
      }

      const content = await fs.readFile(sourcePath, "utf8");
      if (currentSourceDir === sourceDir && entry.name === "SKILL.md") {
        await writeFileAtomically(targetPath, injectBanner(content, skillName));
        continue;
      }

      await writeFileAtomically(targetPath, content);
    }
  }

  await copyRecursive(sourceDir, targetDir);
}

async function syncSharedSkillsImpl({ repoRoot = defaultRepoRoot, skillNames = SHARED_SKILL_NAMES } = {}) {
  return withRepoLock(repoRoot, async () => {
    const synced = [];

    for (const skillName of skillNames) {
      const sourceDir = path.join(repoRoot, "shared", "skills", skillName);
      const sourcePath = path.join(sourceDir, "SKILL.md");
      const targetPaths = targetPathsForSkill(repoRoot, skillName);

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
  });
}

export async function syncSharedSkills(options = {}) {
  const run = syncQueue.then(() => syncSharedSkillsImpl(options));
  syncQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const result = await syncSharedSkills();
  for (const entry of result.synced) {
    console.log(`Synced shared ${entry.skillName} skill from ${entry.sourcePath}`);
  }
}
