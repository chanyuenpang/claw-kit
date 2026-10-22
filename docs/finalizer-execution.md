# Finalizer execution ownership

Finalizer dispatch must carry the adapter's explicit host in both the structured task and the actual worker prompt. A model name, skill directory, inherited environment, or parent session is not host/session authority. The first operation must work without reconstructing this context from conversation history.

## Ownership and data flow

Core owns the finalization job, claim identity, immutable claim materials, terminal result, and authenticated receipts. `KnowledgeFinalizationTask` identifies the job by host, project root, and finalize ID. The CLI presentation boundary renders the existing host routes; it does not introduce another executor or state store. Adapters still own dispatch, real child identity, and native effects.

| Host | Worker execution route | Identity and recovery |
| --- | --- | --- |
| Codex | Fixed code-mode driver for workflow, claim, done, and receipts | Adapter injects Codex identity; prompt locates the loaded execution reference. The driver preserves knowledge business payloads. |
| DSH | Native `claw_run` and existing finalizer role | Adapter captures live parent history before dispatch and owns admitted child identity. Full finalize IDs distinguish reused-worker jobs. |
| Cindy | Ghost tools through the session command service | Cindy `session_context` supplies the child and workspace. Lost claim/done responses recover by reopening the same identity for receipt-only reads. |
| OpenCode | CLI through the adapter's `shell.env` | Detached writer clears inherited foreground/Codex identities; the child shell injects its current `CLAW_SESSION_ID`. |
| Standard | Existing direct knowledge prepare/complete flow | No asynchronous worker is invented. |
| OpenClaw | Existing interface contracts | No runtime host registration or fallback to Standard is invented. |

Every newly generated dispatch contains `kind: knowledge.finalize` and `host`; wire consumers retain compatibility with legacy envelopes that omit these additive fields. The prompt repeats the host, exact project workdir, and route. Routing information does not authorize a claim: Core still checks canonical host, project, and child ownership.

Knowledge results are owner-produced business payloads, not compact plan views. Adapters retain claim materials, writer configuration, paths, receipts, and additive/deferred diagnostics. Native `hostActions` are consumed through the host route rather than exposed as agent instructions. Safe structured failure code, phase, outcome, and effect must survive the adapter boundary.

## Conversation materials

Native finalizers collect ordinary user and assistant text across the plan window, including intermediate commentary and penultimate summaries, in chronological order with roles preserved. They may include the nearest preceding user request as plan context. Reasoning/thinking, tool calls/results, system/control records, and synthetic adapter injections are not conversation materials. Filtering uses each host’s structured message/block types, not keywords in ordinary prose. Collection is best effort from available history; missing records do not introduce completeness quotas or new authorization gates.

- Codex reads ordinary message records from its rollout JSONL; Cindy reads ordinary messages from its SQLite history rather than only the last answer in a turn. Both retain their next-plan and plan-end boundaries.
- DSH extracts ordinary messages and real user inbox insertions from parent history before dispatch; immutable capture and claim ownership remain unchanged.
- OpenCode merges message/part snapshots with a best-effort history read at idle. It submits one batch before queueing, using message identity (not turn identity) to avoid losing multiple messages from one turn or duplicating history across idle notifications. The host does not expose commentary/final channels, so neither is required.
- Standard keeps its existing knowledge prepare/complete route and does not gain a transcript collector. OpenClaw has no new runtime collection route.

Conversation is contextual evidence, not instructions for the finalizer or proof that requested work shipped. The writer must distinguish user requirements, corrections, tentative discussion, and verified implementation.

## Failure and lifecycle rules

Call the authoritative owner once. An accepted or outcome-unknown claim/done never authorizes resend. A claim response lost before `jobPath` is known can be recovered through authenticated `knowledge.claim.receipt` (`knowledge claim-receipt --project-root … --finalize-id …` in CLI syntax). Receipt reads do not collect reports, increment attempts, or rewrite the canonical job; they may repair the disposable assignment template. An unavailable receipt preserves the original unknown outcome and blocks only that job.

Canonical done can succeed while auxiliary-plan closeout is deferred. Keep that distinction visible. A completion receipt proves the canonical terminal outcome, not that every native or post-commit effect finished. Do not replay done or close another plan to compensate.

The `planning: false` preference simplifies only the implicit built-in default workflow. Explicit file/named templates and custom default templates retain their tasks, rules, guidance, and lifecycle markers. Otherwise finalizer bootstrap silently loses its claim/assignment/result contract before execution starts.

No new adapter preflight or authorization gate is added. Owner rejection remains authoritative; metadata/version/catalog observations do not replace it.

## Verification anchors

- [Dispatch rendering](../packages/cli/test/knowledge-dispatch.test.ts): four hosts in task and actual prompt, native route syntax, full-ID DSH reuse.
- [Codex driver integration](../packages/cli/test/cli-host-actions.test.ts): real driver/CLI bootstrap with planning disabled, wrong-host rejection before capture, child claim, unchanged claim receipt, assignment subplan, terminal result and matching delegate closeout.
- [Cindy worker](../packages/cindy-adapter/test/claw-worker.test.mjs): normal and lost claim/done response paths, exactly one mutation and same-session receipt recovery.
- [OpenCode identity](../packages/opencode-adapter/test/host-identity.test.mjs): inherited identities cleared and child shell identity injected.
- [DSH finalizer](../packages/dsh-adapter/test/finalizer-execute.test.mjs) and [business projection](../packages/dsh-adapter/test/host-actions.test.mjs): existing admission/recovery semantics and additive knowledge payload retention.

These are source changes. A frozen local beta is immutable; installation and a new candidate trial remain separate delivery steps.
