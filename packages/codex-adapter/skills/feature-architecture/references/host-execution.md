# Feature architecture host execution

Use this note only for the active host. The main agent requests a bounded
design; on DSH the adapter owns dispatch mechanics. An assigned architect only
investigates and writes the explicitly
authorized report, never parent plan state. Current tool schemas and session
permissions override examples. Before every new or reused assignment disclose
the role and task to the user in one sentence.

## DSH

Use run_code and the adapter's semantic role interface, not raw CLI or backend handles:

- Main: tools.claw_run({operation: "delegate.start", args: {role: "feature-architect", brief: "<full user request, constraints and relevant targets>", output: "auto"}}).
- Obtain the assignment using tools.claw_run({operation: "delegate.result", args: {assignment_id: "<returned id>"}}) before adopting the design. Waiting is bounded; pending or unknown is not permission to submit the same work again.
- The adapter derives taskDir/reportDir from actual activeWorkflow, grants one report path when a task exists, and validates/records the report reference against the original parent plan. Without activeWorkflow it requests an inline design and forbids report files. The main agent does not create directories, choose Team/native, manage member IDs or replay plan.edit for this assignment. Claim reference registration only from returned adapter evidence; changed parent focus remains explicit, not silently switched.
- Assigned architects read the provided skill and sources, write only the granted report (if any), and submit the supplied delegate.complete contract with design status/result and document_path when applicable. Never delegate again or modify parent lifecycle.
- Context: tools.claw_run({operation: "context", args: {}}). Recall: tools.claw_run({operation: "search", args: {query: topic}}). Source inspection uses read/glob/grep, not shell equivalents.
- The adapter owns progress and goal synchronization as well as delegation mechanics. Host permissions and the report-only boundary remain authoritative.

These semantic operations require the matching adapter version. An unsupported interface is a capability gap, not permission to rebuild Team/native orchestration in the model or switch to hostless.

## Codex

Use the active adapter fixed code-mode driver for context and mutations:
`argv: ["context"]`, then main-agent
`argv: ["plan", "edit", "--reference", documentPath, "--why",
"Feature architecture design for the active task."]`. Do not execute these
through a shell or attach `--host` manually. Read-only recall instead uses
`claw search --query "<topic>"` through the permitted Codex shell tool, without
forged host/session arguments. The driver accepts context and plan/task/subplan
commands, not search. This is not a fallback for a failed mutation.

The established native agent sequence is `list_agents`, suitable same-thread
feature-architect reuse via `followup_task`, otherwise `spawn_agent` with
`fork_turns: "none"`, then `wait_agent`. Discover current tools with
`tool_search` when available, and use their actual schemas. Preserve narrow
context, report-only write permission, and result-before-dependent-work; do not
assume an obsolete tool name creates permission.

## Cindy

Use the actual Cindy host route even when the model/provider is Codex or this
skill was installed by another platform. Load the current using-claw-kit Cindy
route: consume its trusted session-start recovery snapshot, rather than inventing
a Ghost context operation or scanning other tasks. For Ghost search and plan.edit,
discover current operation schemas with list_tools and execute through call_tool;
never forge session_context or translate a failed Ghost call into shell. Never use the Codex driver from Cindy: its invocation fixes host=codex regardless
of the model running this Cindy session.

Dispatch design through Cindy's current Orca tools only when their schema and
permissions support a document-author assignment. Supply the feature-architect
role contract, canonical skillPath/hostRoute, and reportDir-only write scope.
Do not repurpose a readonly researcher or knowledge-finalizer; do not invent a
role, tool field or Worker permission. Follow the advertised Worker identity,
delivery and turn-ending contract (not DSH job tools or Codex agent IDs). Disclose
the assignment before dispatch. Missing recovery or document-author capability
is an explicit boundary to resolve, not permission to guess another host.

After the design arrives, only the main agent adds the report reference through
that same Cindy route; without a recovered active task, there are no report writes.

## OpenCode

Use the active adapter injected command route for context, search and plan edit;
preserve its host/session injection instead of switching to standard hostless
or manually appending a host flag. Dispatch through its current task/subagent
surface, supplying the document-author contract and reportDir write boundary.
Do not use a researcher worker whose policy denies the required report write.
Reuse when supported and wait for the design before registering its reference.

## Standard hostless

Only when no native adapter is active, export the stable conversation
`CLAW_SESSION_ID`, then use `claw context`, `claw search --query "<topic>"` and
main-agent `claw plan edit --reference <documentPath> --why "Feature architecture design for the active task."`.
Never add `--host` or set `CLAW_HOST`. Use available native delegation with the
same narrow contract; disclose a genuine missing capability rather than
pretending a child ran. No task means no report writes or reference mutation.
