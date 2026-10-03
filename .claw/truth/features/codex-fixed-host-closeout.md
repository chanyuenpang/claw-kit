# Codex fixed-host workflow and closeout

<!-- state: current -->
## Current behavior

Codex uses one trusted code-mode driver for context and plan/task/subplan mutations. The driver safely encodes structured argv and invokes `claw codex invoke` once. The CLI/Core result is canonical; Goal and other Host effects are post-commit projections. Unknown or future effect schema is reported in `hostEffectFailures` and cannot turn a committed plan mutation into failure or authorize replay.

The driver source comes from the trusted CLI and may be cached. Driver/cache/plugin versions are advisory compatibility metadata, not proof that a natural command can run. The bridge and driver do not install a global CLI or recursively repeat a mutation after a version/protocol error. The real CLI owner returns a visible known rejection or an outcome-unknown result.

The loaded plugin root is supplied by the fixed bridge. `codex invoke` retains structured argv, fixed-host, absolute trusted-root, and path-containment boundaries. Report collector registration is a fail-open postcondition: a missing or malformed collector cannot block or hide a successful context/plan mutation. Registration only accepts the real collector file contained by the loaded plugin root; manifest name/version are advisory.

The current Codex plugin registers only `SessionStart`; it has no Stop hook or configurable SDK/background writer route. SessionStart renders recovery context and diagnostics but does not own canonical plan state. It does not require a ceremonial `plan sync` on every recovered plan.

A terminal Codex mutation may return `knowledgeDispatch`. The main Agent launches one isolated native knowledge finalizer for that exact full finalize ID and immediately yields. The worker claims the existing canonical job; claim-time collection invokes the registered Codex transcript collector, publishes a capture receipt, and issues an immutable claim token before governance writes. `knowledge done` accepts only that token and exact terminal result. Missing capture, lost claim outcome, or worker permission affects only that job and never rolls back the completed plan or authorizes another worker/replay.

The collector resolves the exact session transcript, requires valid frozen bounds, and accepts only parsed successful owner receipts and proven `final_answer` records inside the window. Quoted command text, unrelated untimed records, filename substring matches, and records outside the window are not authority. Collector failure leaves the exact job without write eligibility; it never fabricates an empty successful capture.

Artifact assembly and release tooling own complete skill/manifest/hook payloads, symlink containment, hashes, marketplace layout, and frozen publication bytes. Those build/release checks are not repeated as daily driver admission gates.

## Owners and evidence

- Fixed driver and post-commit Host effects: `packages/cli/src/codex-driver.ts`, `packages/cli/src/codex-host-actions.ts`.
- Fixed-host invocation and fail-open collector registration: `packages/cli/src/cli.ts` (`runCodex`).
- SessionStart-only adapter surface: `packages/codex-adapter/hooks/hooks.json`, `scripts/session-start.mjs`.
- Transcript evidence conversion: `packages/codex-adapter/scripts/report-collector.mjs`.
- Canonical capture, claim, token and result: `packages/core/src/knowledge-sidecar.ts`, `packages/cli/src/knowledge-command.ts`.
- Bridge contract: `.agents/skills/using-claw-kit/references/hosts/codex.md`.
- Cross-host validation policy: [execute-first validation ADR](<../adr/execute-first-validation-ownership.md>) and [`docs/validation-engineering.md`](<../../../docs/validation-engineering.md>).
- Build/release owner: `scripts/codex-plugin-bundle.mjs`, `scripts/release-candidate.mjs`, `docs/beta-release.md`.

<!-- state: history -->
## Evolution history

<!-- dated: 2026-10-03 -->
### Removed runtime rituals

Earlier routes coupled normal plan work to exact plugin/CLI versions, automatic global CLI repair, pre/post collector probes, strict Goal action schema, and Stop/SDK writer descriptions. These checks either duplicated a real owner or could hide a committed mutation. They are retained only as incident history in the historical Codex capture/SDK documents, not as current runtime requirements.
