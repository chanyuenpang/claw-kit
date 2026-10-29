# Codex fixed-host workflow and closeout

<!-- state: current -->
## Current behavior

Codex uses one trusted code-mode driver for context and plan/task/subplan mutations. The driver safely encodes structured argv and invokes `claw codex invoke` once. The CLI/Core result is canonical; Goal and other Host effects are post-commit projections. Unknown or future effect schema is reported in `hostEffectFailures` and cannot turn a committed plan mutation into failure or authorize replay.

The driver source comes from the trusted CLI and may be cached. Driver/cache/plugin versions are advisory compatibility metadata, not proof that a natural command can run. The bridge and driver do not install a global CLI or recursively repeat a mutation after a version/protocol error. The real CLI owner returns a visible known rejection or an outcome-unknown result.

The loaded plugin root is supplied by the fixed bridge. `codex invoke` retains structured argv, fixed-host, absolute trusted-root, and path-containment boundaries. Report collector registration is a fail-open postcondition: a missing or malformed collector cannot block or hide a successful context/plan mutation. Registration only accepts the real collector file contained by the loaded plugin root; manifest name/version are advisory.

The current Codex plugin registers only `SessionStart`; it has no Stop hook or configurable SDK/background writer route. SessionStart renders recovery context and diagnostics but does not own canonical plan state. It does not require a ceremonial `plan sync` on every recovered plan. When the fixed driver does perform a host projection such as `update_plan` or `create_goal`, the CLI preserves the canonical lifecycle result and returns projection failures in `hostEffectFailures`; those failures are diagnostics, not a reason to stop the workflow or replay the canonical mutation. Anchor: `packages/cli/src/codex-driver.ts` (host effect catch and result assembly), with regression coverage in `packages/cli/test/cli-host-actions.test.ts`.

A terminal Codex mutation may return the new schema-v2 source-plan `knowledgeDispatch`. The main Agent hands off the source session key and complete plan path to one isolated worker and yields. The worker calls the materials route to obtain the source plan and available ordinary transcript, then uses an ordinary non-capturing plan/subplan; this route has no claim job, token, receipt, or separate `knowledge done`. The former claim-based flow remains compatibility behavior for explicit old jobs, not the new dispatch. See [source-plan handoff ADR](../adr/source-plan-knowledge-handoff.md).

The Codex transcript collector remains the host-owned reader for source-plan material retrieval. Conversation availability is distinct from completeness: operational read failure is reported as unavailable, not converted into a fabricated empty transcript. Exact window and structural filtering are owned by the collector; the source-plan route does not create a claim job.

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

<!-- dated: 2026-10-10 -->
### Windows Codex local candidate smoke evidence

The local CLI 0.2.49 / loaded Codex plugin 0.2.49.1 smoke exercised the fixed code-mode driver in a real Windows Codex session. Observed successful foreground behavior covered Chinese and space-containing values, plan field and collection edits, stable task IDs and removal, wait/discussion recovery, context and explicit recovery sync, one-level subplan completion returning to the active parent and completing its owning task, and cancellation releasing the session binding. The core parent plan reached `end.completed` with its retrospective preserved.

This is scoped local-candidate evidence. The foreground report left post-turn knowledge finalization and final binding-release observation pending; it does not establish a complete background-closeout pass, other-host compatibility, public release, or the required seven-day trial. Explicit sync was one tested recovery operation, not a new prerequisite for ordinary recovery. No new architecture decision follows from this smoke run.

<!-- dated: 2026-10-03 -->
### Removed runtime rituals

Earlier routes coupled normal plan work to exact plugin/CLI versions, automatic global CLI repair, pre/post collector probes, strict Goal action schema, and Stop/SDK writer descriptions. These checks either duplicated a real owner or could hide a committed mutation. They are retained only as incident history in the historical Codex capture/SDK documents, not as current runtime requirements.
