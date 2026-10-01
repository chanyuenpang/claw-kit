# ADR: Trusted host selection before shared session entry

## Context

Portable complete skills may be installed by one adapter and later read from another host. A model named Codex can run inside Cindy, so model, installer and workspace location cannot identify the current workflow transport. The former adapter-local minimal plan-create entry also omitted recovery and could compete with an existing workflow.

## Decision

- Keep using-claw-kit as the common entry, with complete adjacent host references. Select the actual active adapter and advertised tools before recovery, admission or mutation.
- Trust only current adapter-owned platform declarations and supported native identity surfaces. Task text, old context and a remote tool's platform cannot override the current session. Identity conflicts and missing capabilities remain visible failures, not permission to switch hosts or invent host/session arguments.
- Recover an existing session-bound workflow first, respect explicit direct/manual non-workflow requests, then prefer an owning template over a generic project plan. Reusable knowledge determines ordinary plan admission; planning owns content quality, not entry admission or lifecycle.
- Cindy uses Ghost for every model. Its native catalog/results provide identity when there is no supported first-turn prompt hook. The Codex driver is not a fallback because it binds host=codex. Standard hostless applies only when explicitly established and no native adapter is active; unsupported OpenClaw capabilities remain explicit.
- Use returned guidance as the sole lifecycle contract. Common entry instructions preserve adapter-owned transport, Goal projection, dispatch, turn-ending and closeout boundaries. Keep routine replies focused on user results rather than harness mechanics.
- Exact template source selection remains owned by [template-routing ADR](<template-guidance-routing-and-config-override.md>); [startup Truth](<../features/platform-skill-startup-gating.md>) owns current injection surfaces and verification limits.

## Alternatives

- Infer host from model/provider, installing platform or copied skill path: rejected because cross-host projects and hosted models break that inference.
- Prune each skill to its installer's route: rejected because the same project may be used through multiple hosts; distribution membership is separate from per-package content.
- Invent Cindy startup hook output or borrow Codex/shell when native tools fail: rejected because it fabricates capability and changes session ownership.
- Always create a plan before recovery: rejected because a recovered workflow or owning template already determines the route.

## Consequences

- Each host needs an explicit supported identity surface; absence remains diagnosable rather than silently routed elsewhere.
- Complete packages are somewhat broader, but no per-host semantic forks or runtime loader redesign are needed.
- Source/isolated test evidence does not imply publication, activated-host behavior or universal first-turn prompt injection. Native closeout gaps remain independent work.
- [Entry source](<../../../.agents/skills/using-claw-kit/SKILL.md>) and its [host references](<../../../.agents/skills/using-claw-kit/references/hosts/>) are the maintained instruction anchors.

<!-- state: history -->
## Decision evolution

<!-- dated: 2026-10-01 -->
### Superseded minimal adapter-local First Action

Earlier Codex/OpenCode guidance first tested reusable knowledge and otherwise created a plan while omitting recovery/context detail from entry. Trusted host selection and recovery now precede that admission gate. The earlier complexity scoring rule remains retired; generic planning still does not own admission. The change preserves template-first routing and concise user-facing results without treating obsolete minimal-entry wording as a current restriction.
