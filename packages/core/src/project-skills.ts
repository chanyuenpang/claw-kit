import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ClawError } from "./errors.js";

/** Install standalone, versionable project skills without replacing user files. */
export function installProjectKnowledgeSkill(projectRoot: string, createdPaths: string[]): void {
  const resources = path.join(path.dirname(fileURLToPath(import.meta.url)), "resources");
  // Publish the entry last so an interrupted first install can be completed safely.
  const files = [
    ["references/knowledge-format.md", "knowledge-writer/knowledge-format.md"],
    ["agents/openai.yaml", "knowledge-capture/agents/openai.yaml"],
    ["SKILL.md", "knowledge-capture/SKILL.md"],
  ].map(([target, source]) => ({ target, content: fs.readFileSync(path.join(resources, source), "utf8") }));
  const root = fs.realpathSync(projectRoot);
  for (const host of [".agents", ".claude"]) {
    for (const file of files) {
      const relative = path.join(host, "skills", "knowledge-capture", file.target);
      const directory = ensureProjectSkillDirectory(root, path.dirname(relative), createdPaths);
      const target = path.join(directory, path.basename(relative));
      try {
        fs.writeFileSync(target, file.content, { encoding: "utf8", flag: "wx" });
        createdPaths.push(target);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
    }
  }
}

function ensureProjectSkillDirectory(root: string, relative: string, createdPaths: string[]): string {
  let directory = root;
  for (const part of relative.split(path.sep)) {
    const next = path.join(directory, part);
    try {
      fs.mkdirSync(next);
      createdPaths.push(next);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    // Existing .agents/skills may point at .claude/skills (as in mechanics).
    // Check each resolved parent before the next write: an external link would
    // otherwise install project files into a different project's/global skills.
    directory = fs.realpathSync(next);
    const inside = path.relative(root, directory);
    if (path.isAbsolute(inside) || inside === ".." || inside.startsWith(`..${path.sep}`)) {
      throw new ClawError("PATH_OUTSIDE_ROOT", "Project skill directory resolves outside the project.", { path: next });
    }
  }
  return directory;
}
