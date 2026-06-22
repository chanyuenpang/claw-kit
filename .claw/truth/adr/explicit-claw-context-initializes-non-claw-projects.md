# ADR: Explicit `claw context` initializes non-`claw` projects

## Status

Accepted

## Context

`claw-kit` already distinguishes normal workflow entry from project initialization. In a repo that is not yet a `claw` project, Codex needs a narrow, user-visible initialization action that does not expand into a longer bootstrap checklist or duplicate the later planning flow.

The current init skill already states the intended behavior, but the canonical ADR layer was missing a durable decision for it.

## Decision

For explicit non-`claw` project initialization in Codex, a visible `claw context` invocation is sufficient.

- `claw context` is the initialization action
- if `claw context` succeeds, the project is treated as initialized for Codex-side `claw-kit` entry
- do not require `claw init` as a pre-step for this Codex-side initialization path
- do not invent a broader manual bootstrap sequence before continuing into normal workflow entry

## Consequences

- The `init` skill can stay compact and point directly at the real initialization action
- Codex can report the concrete startup recovery result instead of describing a generic bootstrap process
- Users who want to do real work after initialization can continue with `using-claw-kit` and the normal `claw plan write -> claw search (when useful) -> workflowGuidance` flow
- Non-`claw` project initialization remains distinct from the normal planning and closeout lifecycle

## Related Code

- `packages/codex-adapter/skills/init/SKILL.md`
- `packages/codex-adapter/skills/using-claw-kit/SKILL.md`
- `packages/codex-adapter/hooks/hooks.json`
- `packages/core/src/init.ts`

## Search Terms

- `claw context`
- `non-claw project`
- `init`
- `startup recovery`
- `Codex initialization`
