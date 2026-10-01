# ADR: DSH delegation mechanics are adapter-owned

## Context

Earlier mapping placed native job/continuable/Team distinctions in role skill references. The owner subsequently required automatic capability-based routing and moving all safely automatable coordination into the adapter. Reusing a role must not reuse a previous assignment, claim, material set or result.

## Decision

- Shared researcher/feature-architecture packages retain role semantics and narrow output contracts. DSH exposes delegate.start/result/complete; the model does not choose a backend, enumerate members or implement queue/recovery rules.
- The exact Agent's Team interface signals availability; actual execution validates only its required services, identity and provider. No user chat declaration, extra native/auto/team configuration or pluginManager/UI matrix selects the route. Host permission remains independent.
- DSH owns members and transport; adapter owns role orchestration; Core owns canonical plan/job/claim facts. Team tasks are not a mirror of the claw plan. No cross-Team/project-global role pool is introduced.
- Foreground invocation receipts are adapter-private operational data. They use the host user runtime directory, not unsupported DSH Session event types, package/source copies, or a new roster database. Unknown delivery stays pinned; API acceptance and inactive membership do not prove work completion.
- Automatic finalizer role creation/reuse, delivery and wakeup remain adapter-owned. Each job has a full unique delegate identity and exact claim association; both job and delegate must end before release. Proven release is retained across delegate-file cleanup.
- Report registration is guarded against the original parent plan inside the serialized CLI command. A changed focus defers registration; no automatic focus switch or unguarded replay is allowed.

## Alternatives

Keeping backend choreography in model-facing skills is superseded for DSH. Retaining role semantics in shared packages is not superseded. Reusing arbitrary labels, a global role database, or worker inactivity as completion is rejected. A tiny invocation receipt store is necessary because the installed Host rejects unregistered required Session events; writing custom chat records would corrupt persistence compatibility.

## Consequences

Capability inspection does not promise support for explicit Team model/effort overrides. Unsupported requests remain visible. Existing one-shot jobs are not migrated mid-execution. Source/integration tests are not evidence that a running DSH profile loaded the new artifact.

## Owners and evidence

- [DSH delegation behavior](<../features/dsh-subagent-delegation-contract.md>) owns the operational contract.
- [Shared source ownership](<../features/shared-planning-skill-source.md>) owns distribution and canonical skill location.
- [Adapter entry](<../../../packages/dsh-adapter/src/index.ts>), [role dispatcher](<../../../packages/dsh-adapter/src/finalizer-roles.ts>), [foreground façade](<../../../packages/dsh-adapter/src/delegation.ts>) and [receipt storage](<../../../packages/dsh-adapter/src/delegation-receipts.ts>).
- [Canonical execution association](<../../../packages/core/src/knowledge-sidecar.ts>) and [guarded command service](<../../../packages/cli/src/command-service.ts>).

<!-- state: history -->
## Decision evolution

<!-- dated: 2026-10-02 -->
### Move mechanics, not role meaning, into the adapter

The new source path replaces skill-level backend selection with semantic operations. It does not imply a published release or live activation. Private receipts, full job identities and parent-focus guards protect recovery without creating a second business truth.

<!-- dated: 2026-10-01 -->
### Correct fixed continuable assumptions

The earlier unification removed adapter-local skill copies and corrected native job versus continuable versus Team handles. Its source-ownership and narrow-context rationale remains valid; its decision to leave DSH mechanical dispatch in role references has now been superseded.
