# ADR: Hostless init owns the project agent entry block

## Status

Accepted

## Context

A newly initialized hostless project needs a short, durable instruction that routes agents through the shared `using-claw-kit` entry before project work. Copying workflow rules into `AGENTS.md` would create a second, drifting contract; naming a skill file path as fallback would couple users to package layout. Conversely, automatic setup and native adapters do not represent an explicit hostless initialization request and should not take over a user's root instructions.

## Decision

- Only explicit hostless `claw init` maintains the marked claw-kit bootstrap block in the project-root `AGENTS.md`.
- Keep the block concise: direct agents to load and follow `using-claw-kit`, which owns host selection, recovery, and plan admission. Do not duplicate workflow rules or add a path-based skill fallback.
- Provide `--skip-agent-instructions`; report the operation's status in init JSON.
- Preserve surrounding user content. Replace only one complete, unique marker pair; on malformed or duplicate markers, warn and leave the file unchanged. Repeated init must be idempotent.
- Automatic setup and native-host init do not manage `AGENTS.md`.

## Consequences

- The shared skill remains the single workflow entry contract, while hostless init makes it discoverable without dictating a skill installation path.
- Users retain control over root instructions and may opt out; ambiguous marker state is surfaced rather than destructively repaired.
- This behavior does not change native adapter initialization or general init's existing repeated-init/`--force` semantics.

## Evidence

- `packages/cli/src/agent-instructions.ts` implements marked-block preservation, unique-marker validation, and idempotence.
- `packages/cli/src/cli.ts` calls it only for explicit hostless init and exposes `--skip-agent-instructions` plus `agentInstructions` status.
- The completed task report records three focused tests passing and CLI build/test compilation success; this finalizer did not rerun tests.
