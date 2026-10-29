# Finalizer conversation capture

<!-- state: current -->
## Current behavior

The DSH, Codex, Cindy, and OpenCode finalizer routes capture ordinary user/assistant text from their host conversation history. Assistant commentary and other ordinary assistant messages are eligible; capture is not restricted to a final answer. Each adapter owns extraction from its native history/events, preserving role and message order. This is best-effort history capture, not a completeness guarantee.

- DSH: packages/dsh-adapter/src/capture.ts selects user/message, assistant/message, and compatible assistant/final events; accepts ordinary text blocks; applies the plan window; may prepend the nearest earlier user message as plan_request; and deduplicates by message ID. packages/dsh-adapter/src/index.ts passes normalized entries to private CLI report capture.
- Codex: packages/codex-adapter/scripts/report-collector.mjs selects user/assistant transcript messages and textual content in the plan interval, retains the nearest preceding user request, and stops at the next successful plan creation.
- Cindy: packages/cindy-adapter/plugin/node/cindy-sqlite-reader.cjs reads user/assistant text from the originating SQLite session, bounded by the plan interval and next plan creation, retaining the triggering user request.
- OpenCode: packages/opencode-adapter/plugin/index.ts collects user/assistant text from session history, filters synthetic/ignored/summary/compaction and non-text parts, preserves message identity/order, and can use event snapshots when history read fails.

These routes structurally exclude tool records, reasoning/thinking, system content, and synthetic host context. Core/CLI ingestion deduplicates by message identity where supported. For the new DSH/Codex/Cindy source-plan route, collection is requested through `knowledge.materials` using the originating session key and complete source-plan path; it returns conversation availability and ordinary writer templates without creating a claim job or separate completion record. OpenCode retains its existing job lifecycle, and Standard retains agent-memory closeout rather than acquiring a transcript collector. This implementation does not establish an automated full-conversation capture contract for OpenClaw.

Capture is bounded by source-plan time/window semantics and each host's available history. Material may be omitted according to each collector's existing behavior; there is no cross-host completeness metric, cursor protocol, or new completeness hard gate. Operational read/commit errors remain distinct from incomplete-but-available history. The source-plan handoff and ordinary plan/subplan completion boundary are specified by [source-plan knowledge handoff ADR](../adr/source-plan-knowledge-handoff.md).

## Related code and verification

- packages/dsh-adapter/src/capture.ts and src/index.ts
- packages/codex-adapter/scripts/report-collector.mjs
- packages/cindy-adapter/plugin/node/cindy-sqlite-reader.cjs
- packages/opencode-adapter/plugin/index.ts
- packages/core/src/knowledge-sidecar.ts and packages/cli/src/cli.ts
- Focused tests: DSH test/capture.test.mjs; Codex hooks/report-collector.test.mjs; Cindy test/report-collector.test.mjs; OpenCode test/conversation-capture.test.mjs.
