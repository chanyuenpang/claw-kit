# Codex execution route

## Recovery and entry

Use the Codex adapter only in an actual Codex plugin session, not merely because
the model is GPT/Codex. Consume SessionStart recovery before creating any plan.
When a session-bound plan is recovered, first record any explicit user goal
change/replacement/cancellation, then follow its current guidance. Do not run a
ceremonial `plan sync`; the fixed driver consumes real Host effects on the
business operation that produces them.
If the startup snapshot is unavailable, invoke the bridge below with
`argv: ["context"]` and consume its recovery result before continuing. Never
create a second root plan to probe for existing work.

For a genuinely new generic plan, pass `argv: ["plan", "create", "<title>"]`
through the bridge below; a template-owning skill supplies its template instead.

## Codex mutation bridge
For context recovery and every claw workflow or knowledge operation, call the function below in
code mode and change only `argv`, `workdir`, and `timeout_ms`; supply `pluginRoot` from the actual loaded plugin directory (the ancestor containing `.codex-plugin/plugin.json`). `argv` is exactly
`["context"]` for recovery, or starts with `plan`, `task`, or `subplan` for
workflow operations, or `knowledge` with `claim`, `claim-receipt`, `done` or
`done-receipt`. It excludes the `claw` executable and `--host`, and
keeps every user value as a separate array item. The cached CLI driver validates
results, consumes native host actions exactly once, and returns only
stage-relevant plan fields and the complete knowledge business result.

Read-only `claw search --query "<topic>"` and standalone static authoring
utilities use the host's supported shell tool, not this mutation bridge. Do not
pass `search` or template-validation commands as bridge argv; the driver does
not accept them. This does not permit a shell fallback for plan mutations.

```javascript
async function runClawPlanMutation({ argv, workdir, pluginRoot, timeout_ms = 30000 }) {
  const cacheKey = "claw-kit:codex-driver:v27:s1";
  const pluginVersion = "0.2.49.1";
  const fetchEnvelope = async () => {
    const raw = typeof tools.shell_command === "function" ? await tools.shell_command({ command: "claw codex driver", workdir, timeout_ms })
      : typeof tools.exec_command === "function" ? await tools.exec_command({ cmd: "claw codex driver", workdir, yield_time_ms: timeout_ms })
      : (() => { throw new Error("Codex host has no supported command-execution tool"); })();
    const output = typeof raw === "string" ? raw : (raw.output ?? raw.stdout ?? raw.text ?? "");
    const start = output.indexOf("{");
    const end = output.lastIndexOf("}") + 1;
    if (start < 0 || end <= start) throw new Error("claw returned no driver envelope");
    return JSON.parse(output.slice(start, end));
  };
  let envelope = load(cacheKey);
  if (!envelope || typeof envelope.source !== "string") {
    envelope = await fetchEnvelope();
    if (typeof envelope?.source !== "string") throw new Error("claw Codex driver source is unavailable");
    store(cacheKey, envelope);
  }
  const runner = (0, eval)(`(${envelope.source})`);
  if (typeof runner !== "function") throw new Error("invalid claw Codex driver source");
  return runner({ argv, workdir, pluginVersion, pluginRoot, timeout_ms }, { tools, text });
}
```

## Knowledge subagent dispatch
- **Terminal dispatch gate (Codex):** A valid `knowledgeDispatch` is the highest-priority closeout obligation in the claw-kit workflow. Complete this handoff through the designated knowledge finalizer before the final reply, other work, or plan closeout. Do not skip the handoff because it was easy to miss, the work appears to contain no knowledge, a collaboration tool is not visible, or you believe you lack permission. The finalizer decides whether the job produces a knowledge update.
- When a terminal plan mutation returns a valid `knowledgeDispatch` for Codex, launch one isolated worker for that exact `finalizeId`. Do not reuse a worker that may still hold an earlier claim: call `spawn_agent` with the complete unchanged prompt, `fork_turns: "none"`, task name `knowledge_finalizer_<first 12 chars of finalizeId>`, and any supplied `model` and `reasoningEffort` mapped to native fields; never load a user-facing delegate skill. A failed, expired, or unavailable claim is terminal for that worker and must not be sent to another job.
- The dispatched job already exists. Do not wait for the new writer; immediately end the main turn after the accepted handoff. On Codex, `knowledge claim` collects the existing parent-turn report. The bridge cannot call collaboration tools.
## Hard boundaries
- Run every supported workflow and knowledge operation through the code-mode bridge without splitting host calls, reconstructing `hostActions` or `goalTool`, or repeating canonical transitions as compensation. Goal/effect failures remain visible but never authorize replaying the canonical mutation. After an unknown claim/done response, use the matching claim-receipt/done-receipt through this same bridge; never resend the mutation.
- Codex has no direct-call fallback: every supported plan mutation goes through the bundled code-mode consumer.
- Goal-state inspection belongs only to the fixed driver or bundled consumer program; the agent must never call `get_goal` separately.
- Edit canonical plan state only through claw commands supplied or permitted by returned guidance.
- If code mode, the driver, or a required host tool is unavailable, skip the claw workflow and continue the user's task directly; do not substitute an unsupported plan mutation.
- Keep claw harness mechanics out of normal thread replies unless the user asks about them or they are necessary to explain a blocker or result.
- Keep claw-generated metadata and host prompts in English while preserving user-supplied project content in its original language.

Knowledge finalization uses only the native isolated worker. Claim captures the parent report through the adapter-owned collector. Do not claim asynchronous knowledge deposition completed merely because the foreground plan closed.
