/** Built-in skill invocation names are namespaced only by the Codex plugin. */
export function builtInSkillName(name: string, host?: string): string {
  return host === "codex" ? `claw-kit:${name}` : name;
}
