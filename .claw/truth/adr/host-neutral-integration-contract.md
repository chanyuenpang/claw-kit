# ADR: Host-neutral integration contract

## Status

Accepted

## Context

Host-name branches had spread through Core and CLI, while CLI directly carried
Codex SDK and OpenCode finalizer runtime dependencies. This coupled the
host-neutral command surface and CLI release readiness to adapter-specific
runtimes and artifacts.

## Decision

- Core owns a closed, versioned v1 capability profile for supported integration
  hosts; Core and CLI resolve policy through that contract.
- Context recovery can return host-neutral workflow state. The invoking
  adapter, rather than stored session state, supplies the current host and
  consumes the recovery result through its native route; agent-facing Codex
  recovery uses its fixed code-mode driver rather than a naked CLI invocation.
- CLI/Core own canonical workflow and immutable background-dispatch semantics,
  not native platform writer runtimes.
- The shared Node envelope owns the versioned shape of Host actions, completion
  effects, and knowledge dispatch. Adapter application remains fail-open after
  commit, but failures must remain observable as structured diagnostics.
- Each adapter owns its native finalizer/runtime implementation.
- CLI release readiness uses the independent `verify:cli` gate; adapter gates
  remain separate.

## Alternatives considered

- Retain scattered host-name branches: rejected because policy changes would
  keep duplicating host-specific behavior across Core and CLI.
- Keep platform SDK/runtime code in CLI: rejected because it reverses adapter
  ownership and ties CLI release to unrelated platform artifacts.
- Replace the profile with permissive fallback behavior: rejected because an
  unknown integration must fail explicitly rather than silently inherit a host.
- Persist and reuse the host from a prior session binding: rejected because a
  historical adapter identity can be wrong for the current recovery caller.

## Consequences

Host additions now require an explicit capability profile and an adapter-native
implementation for every enabled effect. CLI/Core can evolve canonical protocol
without importing platform runtimes, while adapters can validate and release on
their own schedules. Recovery callers must use the adapter-owned entry point;
they neither append `--host` manually nor inherit a host from an earlier
session.

## Related code

- `packages/core/src/integration-contract.ts`
- `packages/cli/src/cli.ts`
- `packages/cli/src/invocation-host.ts`
- `packages/codex-adapter/scripts/knowledge-finalizer.mjs`
- `packages/opencode-adapter/plugin/index.ts`
- `.claw/truth/features/host-neutral-integration-contract.md`

## Search terms

`capability profile`, `host-neutral integration`, `adapter-owned runtime`,
`verify:cli`, `internal-knowledge-dispatch`
