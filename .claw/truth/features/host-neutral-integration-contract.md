# Host-neutral integration contract

<!-- state: current -->
## Current behavior

Core owns a closed, versioned v1 integration-capability contract. CLI and Core
resolve host behavior through `resolveHostIntegrationProfile()` instead of
scattered platform-name branches; unsupported hosts or profile/version
mismatches fail explicitly.

- Profiles cover Codex, OpenCode, Cindy, and DSH and declare plan/Goal effects,
  finalization, report capture, workflow recovery, and compact-output behavior.
- CLI/Core retain canonical plan, job, claim, done, and immutable dispatch
  semantics. They no longer embed Codex SDK or OpenCode writer runtimes.
- Platform adapters own their native implementations. In particular, Codex and
  OpenCode obtain canonical immutable knowledge dispatch and run their own
  native finalizer/runtime rather than asking CLI to host it.
- `npm run verify:cli` builds and checks Core, client, and CLI only; adapter
  release readiness remains independently owned by each adapter gate.

## Related code

- `packages/core/src/integration-contract.ts`
- `packages/core/src/knowledge-sidecar.ts`
- `packages/core/src/plan.ts`
- `packages/core/src/workflow-guidance.ts`
- `packages/cli/src/cli.ts`
- `packages/cli/src/command-service.ts`
- `packages/cli/src/invocation-host.ts`
- `packages/codex-adapter/scripts/knowledge-finalizer.mjs`
- `packages/opencode-adapter/plugin/index.ts`
- `package.json`

## Verification

The completed decoupling plan recorded passing CLI gate, Codex adapter 20/20,
OpenCode check, and DSH 41/41 verification. The source change removes CLI
Codex/OpenCode runtime modules and adds focused host-profile coverage.

## Boundaries

This document owns current cross-platform capability and runtime ownership.
Host-specific mutation consumption, DSH native subagent dispatch, and the
general knowledge job lifecycle remain owned by their existing Truth/ADR
documents.

## Search terms

`integration contract`, `capability profile`, `resolveHostIntegrationProfile`,
`internal-knowledge-dispatch`, `verify:cli`, `adapter-owned runtime`
