export declare const CLAW_SKILLS_PROVIDER = "claw-kit";
export type SkillFrontmatter = {
    name?: string;
    description?: string;
    whenToUse?: string;
};
/** Parse the leading YAML-ish frontmatter of a SKILL.md (name/description/whenToUse). */
export declare function parseSkillFrontmatter(content: string): SkillFrontmatter;
type DiscoveredSkill = {
    name: string;
    description: string;
    whenToUse?: string;
    dir: string;
};
/** List skill directories under the package `skills/` root that carry SKILL.md. */
export declare function discoverBundledSkills(root?: string): DiscoveredSkill[];
/** Strip the leading frontmatter block, returning the markdown body. */
export declare function stripFrontmatter(content: string): string;
/** Register the bundled provider into a DSH `ctx.skills`-shaped service. */
export declare function registerBundledSkills(skills: {
    registerProvider(create: (control: unknown) => unknown): () => void;
}): void;
export {};
