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
