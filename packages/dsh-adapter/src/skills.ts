/**
 * Bundled skill provider for the dsh-claw-kit plugin: discovers the package's
 * `skills/` directory (shared-synced + host-specific skills) and registers
 * them into the DSH layered `ctx.skills` registry as a `bundled` source, so
 * installing the plugin is sufficient to expose the claw-kit skills — no
 * manual copy into ~/.agents/skills needed.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skillsRoot = path.join(packageRoot, "skills");

export const CLAW_SKILLS_PROVIDER = "claw-kit";

export type SkillFrontmatter = { name?: string; description?: string; whenToUse?: string };

/** Parse the leading YAML-ish frontmatter of a SKILL.md (name/description/whenToUse). */
export function parseSkillFrontmatter(content: string): SkillFrontmatter {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(content);
  if (!match) return {};
  const meta: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (kv) meta[kv[1]] = kv[2].replace(/^"|"$/g, "");
  }
  return {
    ...(meta.name !== undefined ? { name: meta.name } : {}),
    ...(meta.description !== undefined ? { description: meta.description } : {}),
    ...(meta.whenToUse !== undefined ? { whenToUse: meta.whenToUse } : {}),
  };
}

type DiscoveredSkill = { name: string; description: string; whenToUse?: string; dir: string };

/** List skill directories under the package `skills/` root that carry SKILL.md. */
export function discoverBundledSkills(root = skillsRoot): DiscoveredSkill[] {
  if (!fs.existsSync(root)) return [];
  const out: DiscoveredSkill[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(root, entry.name);
    const skillFile = path.join(dir, "SKILL.md");
    if (!fs.existsSync(skillFile)) continue;
    const meta = parseSkillFrontmatter(fs.readFileSync(skillFile, "utf8"));
    if (!meta.name) continue;
    out.push({ name: meta.name, description: meta.description ?? entry.name, whenToUse: meta.whenToUse, dir });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Strip the leading frontmatter block, returning the markdown body. */
export function stripFrontmatter(content: string): string {
  return content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "").replace(/^\r?\n/, "");
}

/** Register the bundled provider into a DSH `ctx.skills`-shaped service. */
export function registerBundledSkills(skills: {
  registerProvider(create: (control: unknown) => unknown): () => void;
}): void {
  skills.registerProvider(() => ({
    name: CLAW_SKILLS_PROVIDER,
    async list() {
      return discoverBundledSkills().map((skill) => ({
        name: skill.name,
        description: skill.description,
        ...(skill.whenToUse !== undefined ? { whenToUse: skill.whenToUse } : {}),
        invocation: { modelInvocable: true, userInvocable: true },
        source: "bundled",
        provider: CLAW_SKILLS_PROVIDER,
        resourceBase: { kind: "directory", path: skill.dir },
        rank: 600,
        locator: skill.dir,
      }));
    },
    async get(candidate: { name: string; description: string; whenToUse?: string; invocation: unknown; source: unknown; provider: unknown; resourceBase: unknown; locator: unknown }) {
      const dir = typeof candidate.locator === "string" ? candidate.locator : "";
      const skillFile = path.join(dir, "SKILL.md");
      if (!fs.existsSync(skillFile)) return undefined;
      return {
        name: candidate.name,
        description: candidate.description,
        ...(candidate.whenToUse !== undefined ? { whenToUse: candidate.whenToUse } : {}),
        invocation: candidate.invocation,
        source: candidate.source,
        provider: candidate.provider,
        resourceBase: candidate.resourceBase,
        content: stripFrontmatter(fs.readFileSync(skillFile, "utf8")),
      };
    },
  }));
}
