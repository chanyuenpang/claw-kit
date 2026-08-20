# Platform skill startup gating

<!-- state: current -->
## Current behavior

- The adapter-owned `using-claw-kit` skills for Cindy, Codex, and OpenCode begin by deciding whether the request is expected to produce reusable project knowledge. Requests that are not expected to do so skip the skill and proceed directly with the requested work.
- When reusable project knowledge is expected, Codex and OpenCode continue through their default `claw plan create` entry route. Cindy continues through its required runtime-specific route; the common admission gate does not replace its platform routing contract.
- This gate belongs to each adapter-owned entry skill, not to the shared `planning` skill. Keeping the rule at the entry point prevents duplicate admission rules while preserving each host's lifecycle owner.

## Verification boundary

- Verify the three source skills' `First Action` ordering and the `Otherwise` transition to their respective routes.
- Treat the recorded UTF-8 pattern checks and `git diff --check` as the validation evidence for this completed alignment; do not represent them as a general end-to-end runtime test.

## Evidence

- `packages/cindy-adapter/plugin/skills/using-claw-kit/SKILL.md`
- `packages/codex-adapter/skills/using-claw-kit/SKILL.md`
- `packages/opencode-adapter/skills/using-claw-kit/SKILL.md`
- `.claw/truth/adr/using-claw-kit-session-entry.md`
