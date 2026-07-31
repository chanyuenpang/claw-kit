# @veewo/claw-client

Lightweight Node API for opening and using persistent claw sessions.

```ts
import { session } from "@veewo/claw-client";

const claw = await session.open(agentSessionId, workdir);
const plan = await claw.command({
  operation: "plan.show",
  input: { simple: true },
});

const adapterResult = await claw.commandEnvelope({
  operation: "task.done",
  input: { tasks: [{ id: 1 }] },
});
// adapterResult keeps native hostActions, postCommitEffects, and
// knowledgeDispatch alongside adapterResult.output.

await claw.close();
```

`@veewo/claw-client` uses Node built-ins only and talks to the same local,
authenticated JSONL daemon as `claw session open <dir> <session-id>`. The CLI
package must be installed for automatic daemon startup.

The composite session identity is `(canonical workdir, agent session id)`.
Workdir does not mutate after open, and different directories never share
current-plan focus. Requests are serialized per connection and are never
replayed after a disconnect. `SESSION_CONNECTION_LOST` reports an unknown
outcome together with the exact reopen command.

Normal plan and task operations implicitly target the retained `currentPlan`.
`plan.resume` resumes it, `plan.resume` with `planId` selects another resumable
plan, and `plan.leave` enters the resumable terminal state `end.leave`.
Application code normally uses `command()`. Host adapters use
`commandEnvelope()` when they must consume native UI/Goal actions or schedule
post-commit work without losing the canonical command result.
