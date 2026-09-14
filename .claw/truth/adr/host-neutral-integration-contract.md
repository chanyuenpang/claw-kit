# ADR: Host-neutral integration contract

## Status

Accepted

## Context

Host-name branches had spread through Core and CLI, while CLI directly carried
Codex SDK and OpenCode finalizer runtime dependencies. This coupled the
host-neutral command surface and CLI release readiness to adapter-specific
runtimes and artifacts.

The high-level `claw-kit-core` workflow loop also did not provide a sufficiently
precise, queryable boundary for adding another platform: trusted context,
capabilities, transport outcomes, native effects, finalization, and readiness
could otherwise be interpreted differently by each adapter.

## Decision

- Core owns a closed, versioned v1 capability profile for supported integration
  hosts; Core and CLI resolve policy through that contract.
- Keep `claw-kit-core` as the high-level lifecycle model and establish the
  separate `platform-adapter-contract-v1` (PAC v1) as the detailed,
  platform-neutral adapter contract. PAC v1 names TrustedSessionContext,
  capability clauses, and the Bootstrap, Command, Effect, Finalizer, and
  Conformance logical ports; adapters implement those ports, while Core/CLI
  remain the sole canonical workflow and policy owner.
- Context recovery can return host-neutral workflow state. The invoking
  adapter, rather than stored session state, supplies the current host and
  consumes the recovery result through its native route; agent-facing Codex
  recovery uses its fixed code-mode driver rather than a naked CLI invocation.
- CLI/Core own canonical workflow and immutable background-dispatch semantics,
  not native platform writer runtimes.
- The shared Node envelope owns the versioned shape of Host actions, completion
  effects, and knowledge dispatch. Adapter application remains fail-open after
  commit, but failures must remain observable as structured diagnostics.
- Command outcomes are closed over `committed`, `partial`, `rejected`, and
  `unknown`. A post-commit native-effect failure cannot change or roll back a
  committed canonical result. An unknown transport outcome cannot be retried
  as though it were rejected; the caller must first recover and reconcile the
  canonical state.
- Each adapter owns its native finalizer/runtime implementation.
- CLI release readiness uses the independent `verify:cli` gate; adapter gates
  remain separate.
- Adapter readiness requires a declared profile, all five ports, shared
  conformance evidence, package checks, and real-host positive and negative
  smoke evidence. No single Core/CLI gate or prose declaration is sufficient.

## Alternatives

- Retain scattered host-name branches: rejected because policy changes would
  keep duplicating host-specific behavior across Core and CLI.
- Keep platform SDK/runtime code in CLI: rejected because it reverses adapter
  ownership and ties CLI release to unrelated platform artifacts.
- Replace the profile with permissive fallback behavior: rejected because an
  unknown integration must fail explicitly rather than silently inherit a host.
- Persist and reuse the host from a prior session binding: rejected because a
  historical adapter identity can be wrong for the current recovery caller.
- Fold the detailed adapter contract into `claw-kit-core`: rejected because
  port, transport, and host-effect detail would obscure the high-level workflow
  loop and make the two concerns harder to query independently.
- Reduce command results to success/failure or automatically retry unknown
  outcomes: rejected because partial commits and lost responses require
  reconciliation against canonical state, not blind replay.
- Treat Core/CLI checks as proof that every adapter is ready: rejected because
  native transport, effect, and finalizer behavior can only be verified in the
  adapter package and real host.

## Consequences

Host additions now require an explicit capability profile and an adapter-native
implementation for every enabled effect. CLI/Core can evolve canonical protocol
without importing platform runtimes, while adapters can validate and release on
their own schedules. Recovery callers must use the adapter-owned entry point;
they neither append `--host` manually nor inherit a host from an earlier
session.

Each new adapter has one explicit conformance path from trusted bootstrap
through command and effect handling to finalization and readiness. This adds a
larger evidence obligation before compatibility can be claimed, but prevents
transport uncertainty, post-commit failures, or incomplete native coverage
from being hidden behind a generic success result.

## Related code

- `packages/core/src/integration-contract.ts`
- `packages/cli/src/cli.ts`
- `packages/cli/src/invocation-host.ts`
- `packages/codex-adapter/scripts/knowledge-finalizer.mjs`
- `packages/opencode-adapter/plugin/index.ts`
- `.game-graph/mechanics/platform-adapter-contract-v1.mechanic.json`
- `.game-graph/definitions.graph.json`
- `.claw/truth/features/host-neutral-integration-contract.md`

## Search terms

`capability profile`, `host-neutral integration`, `platform-adapter-contract-v1`,
`PAC v1`, `CommandOutcome`, `adapter conformance`, `adapter-owned runtime`,
`verify:cli`, `internal-knowledge-dispatch`
