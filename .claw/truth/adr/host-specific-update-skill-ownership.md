# ADR: Host-specific ownership for update skills

## Status

Accepted

## Context

Codex and OpenCode both expose an `update` skill, but their plugin refresh and completion evidence are materially different. Codex updates through the official GitHub marketplace and active identity/source/cache chain; OpenCode updates through the maintained installer that deploys its plugin payload, discovery copies, agents, shim, references, and workflow guidance.

The former shared `shared/skills/update/` package encoded those differences as a runtime platform-choice task. That made an already loaded adapter ask which host it was running on, coupled unrelated installation rules in one template, and allowed shared synchronization to overwrite host-specific maintenance.

## Decision

- Keep the public skill name and template id `update` in both adapters, but make the loaded adapter the sole platform selector.
- Codex independently owns `packages/codex-adapter/skills/update/`; OpenCode independently owns `packages/opencode-adapter/skills/update/`.
- Each adapter owns its complete update package: entry skill, three-task template, no-`.claw` fallback, and coverage contract.
- Remove `update` from `SHARED_SKILL_NAMES` and delete `shared/skills/update/`. Shared-skill synchronization must never generate or overwrite either adapter's update package.
- Preserve the shared outcome contract—published CLI plus current-host plugin are one update unit—but express host commands, verification evidence, and restart boundaries only in the owning adapter.
- Reject workflow-time host selection. Neither update template may contain Codex/OpenCode/conservative route choices or a task that asks, infers, or confirms the platform.
- Protect the boundary in shared-sync and adapter bundle tests so future synchronization or packaging changes cannot silently merge the implementations again.

## Alternatives considered

- Keep one shared template with a platform choice. Rejected because the adapter identity is already known and the choice recreates avoidable routing state.
- Infer the host inside a shared workflow. Rejected because hidden inference still couples two installation contracts and makes the shared package the owner of platform-specific behavior.
- Fork only `TEMPLATE.json` while retaining shared entry/fallback/coverage files. Rejected because ownership would remain split and shared synchronization could still overwrite or contradict host-specific instructions.

## Consequences

- Maintainers edit the Codex and OpenCode update packages independently and must review both when changing the common update outcome.
- The same `claw plan create --template update` entry resolves to different host-owned content without adding a user-visible routing step.
- Codex can enforce official marketplace identity/source/cache evidence without carrying OpenCode deployment details; OpenCode can enforce its full installed-surface verification without carrying Codex identity rules.
- Shared-skill synchronization remains the canonical materializer only for the skills listed in `SHARED_SKILL_NAMES`; `update` is an explicit adapter-owned exception.
- The canonical current behavior is documented in `.claw/truth/features/host-specific-update-skills.md`. Older shared-update records remain historical evidence only.

## Related code

- `packages/codex-adapter/skills/update/`
- `packages/opencode-adapter/skills/update/`
- `scripts/sync-shared-skills.mjs`
- `scripts/sync-shared-skills.test.mjs`
- `scripts/codex-plugin-bundle.test.mjs`
- `scripts/opencode-plugin-bundle.test.mjs`
- `packages/opencode-adapter/references/opencode-plugin-update.md`
- `shared/skills/update/` (removed historical source)

## Search terms

- `host-specific update ownership`
- `adapter-owned update skill`
- `remove update from shared sync`
- `no platform choice`
- `Codex OpenCode update split`
