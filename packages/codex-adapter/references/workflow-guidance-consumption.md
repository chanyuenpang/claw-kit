# Codex workflowGuidance consumption

Use this note when Codex drives `claw` commands that return `workflowGuidance`.

## Core rule

Treat returned `workflowGuidance` as the primary next-step contract. Codex plan mutations run only through the fixed code-mode driver in `skills/using-claw-kit/SKILL.md`; the driver validates and consumes `hostActions` in the same call and returns a stage-minimal result.

## Fields to honor

### `delegateSubagents`

Delegation remains available for bounded research, review, and other explicitly returned specialists. Read `dispatch`, `waitForCompletion`, `fork_context`, input/output contracts, and close policy field-by-field. Do not use this surface for truth or ADR deposition on Codex: the Stop hook and SDK `knowledge-writer` own that work.

The main agent does not need to read specialist skill files inline before dispatch. For a research delegate, the host must wait when the task is research.

### `askUser`

Use the supplied choices and ordering when the workflow needs a route decision.

### `recommendedCommands`

Use these commands as the authoritative next mutations unless current canonical state makes one invalid. Keep command execution inside the fixed code-mode driver.

### stage-minimal results and `hostActions`

The CLI projects only actionable stage data, exact commands, next task, permitted delegation, user input, create-time plan/review data, and closeout state. The driver consumes each validated host action at most once. Goal actions come only from committed plan status; the agent must not reconstruct `goalTool`, split host calls, or compensate by mutating plan state again.

Host-action failure does not roll back canonical CLI state. The failed action remains retryable through the driver contract.

Code-mode consumption is the adapter execution method. The bundled `code-mode-host-action-consumer.mjs` enforces an explicit stage-aware allowlist, accepts schema v1 native `create_goal` or `update_goal`, and executes each action exactly once. It does not inspect current Goal state, parse host error wording, or invent compensation. The CLI routes Codex Goal actions from the committed plan status: ordinary active progress emits no Goal action, while a later resume can therefore create the next active Goal in its normal single code-mode call. Unknown schemas fail closed. Codex has no separate host-call fallback, and Codex compact results do not return `goalMode` or `goalTool`.

## Lifecycle interpretation

- `process.discussing`: analyze the request through the seeded planning task and configured planning skill; do not implement yet. A recommended `claw search` command is optional recall, not a required next step.
- `process.active`: execute one task at a time and keep plan status current.
- `process.wait`: stop execution until the user or dependency resumes it.
- task completion with an open plan: continue; Stop automatically appends the final assistant message to the current plan's report.
- all tasks done: clear host progress, write retrospective and key decisions, then run `claw plan done`.
- subplan done: canonical completion immediately restores the parent binding. The same turn's Stop still belongs only to the completed subplan report; the next turn belongs to the parent.
- root plan done: canonical completion immediately unbinds the session. The same turn's Stop captures the root completion report and queues SDK closeout.

## Independent knowledge sidecar

Plan create/subplan create register a report owner outside session binding. Plan completion writes a pending completion owner only as best-effort sidecar state. Stop reads the current transcript, extracts the current final assistant message, and appends exactly one idempotent JSONL report entry. Pending completion ownership wins over the already-resumed parent, which prevents transition turns from being dual-written.

After the completion turn is captured, Stop queues an isolated Codex SDK worker with only the completed plan, adjacent report, and finalization id. The worker uses `knowledge-writer` to judge truth and ADR together and requests project recall indexing after success. Hook, report, launcher, SDK, or writer failures never block or alter plan completion and parent resume.

## Anti-patterns

- Do not dispatch `truth-writer`, `adr-writer`, or `knowledge-writer` from the main agent.
- Do not make plan completion conditional on hook, report, SDK, or indexing success.
- Do not write both parent and subplan reports on a transition turn.
- Do not claim deposition completed from queueing alone; inspect the finalization job when completion evidence matters.
