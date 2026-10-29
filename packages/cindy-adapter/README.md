# Cindy adapter

This package is the Cindy-specific landing surface for the `claw-kit` workflow.

The Cindy plugin is a workflow command gateway with Skills plus declared runtime hooks.
The `claw` CLI remains a separate user-installed dependency; it is not bundled
into the plugin.

## Scope

- The plugin distribution surface contains Skills, `subscribe` hooks, a typed
  Agent Tool gateway, trusted `session-context`, and narrowly declared
  `node` and background `agent` capabilities.
- The `claw` CLI remains a separate installation and upgrade surface.
- Source is maintained in the main claw-kit repository. The existing
  `https://github.com/chanyuenpang/claw-kit-cindy-adapter.git` address remains
  the artifact-only Git marketplace, with `claw-kit-cindy` pointing to the
  assembled `plugin/`. Do not publish this incomplete source subtree directly.
- Cindy Desktop Host provides the lifecycle dispatcher for plugin-declared
  Ghost hooks. User-facing Orca Lead sessions remain eligible for ordinary
  Ghost lifecycle hooks while Workers are excluded; that Host fix is independent
  of the Orca Worker knowledge path, which does not require a Stop hook.
- `plan.create` creates the Ghost progress card; `plan.resume`, `plan.done`,
  and all later task and plan mutations update the current session card from canonical
  plan data: title, goal, completed/total tasks, and the next task. This is a
  one-way presentation projection, not a second workflow store.
- Cindy's native progress/Todo UI remains presentation-only. Goal-mode
  continuation is implemented inside the Ghost Hook: `.claw` stays canonical,
  and an active plan may queue one background `agent.run` continuation after
  each completed assistant turn.

## Updating in Cindy

Cindy does not expose an `update` Skill for claw-kit. Follow the Cindy section
in the canonical [claw-kit update reference](../../.agents/skills/claw-kit-doc/references/update.md)
for the plugin-page and installed-market refresh sequence.

## Current design baseline

See [Cindy adapter design](references/cindy-adapter-design.md) for the confirmed
workflow, failure policy, permission boundary, and acceptance scenarios.

The Ghost runtime source is under [plugin](plugin). Build the installable tree
with `npm run export:cindy-plugin -- --output-root <fresh-output-directory>`
from the main repository: it combines runtime assets with an exact shared-skill
package contract, without bundling or registering public skills. The plugin uses
manifest v3 (Cindy >= 0.1.61) to retain its existing capabilities and declare the
startup repair notification. `skills_status` checks only local files;
`install_skills` explicitly installs the pinned `@veewo/claw-skills` npm version.
See [shared installation and migration](../shared-skills/README.md).
The separate skill artifact must be built and published under explicit release
authorization before the online installation can succeed. Cindy normalizes either
configured knowledge execution policy to the compatibility value `subagent`; the active
Lead pre-dispatches one persistent, sidebar-visible Orca `knowledge_finalizer` Worker after the terminal
mutation returns its source-plan handoff. The Worker calls Ghost `knowledge.materials`
with the source session key and full plan path, reads the complete plan and ordinary
conversation, and executes the returned non-capturing auxiliary plan and knowledge
subplan. Ordinary plan completion is the outcome; there is no new claimable job,
claim token, receipt, or separate done registration. Cindy does not use an errand
or a Stop hook for finalization, and does not automatically scan or resume old jobs.
The Ghost Node worker owns a separate persistent CLI session transport per workdir/session ID. A successful `plan.done` releases that CLI after sending its response (including any knowledge-dispatch envelope), unless a newer request already began; quiescent unfinished-plan transports expire after 10 minutes without queued or running commands. The same session ID then reopens against retained CLI state. This does not stop the independent Orca finalizer Worker. `claw/session-transports` is a read-only worker RPC reporting workspace/session ID, direct child PID, active/idle/reclaiming state, pending count and close reason; `session-transport-*` events in the worker log record opens, exits and reclamation. `CLAW_CINDY_SESSION_IDLE_MS` may set a positive integer of at least 1000 ms for controlled tests or deployment tuning.
Cindy's `whenToUse` identifies every session start as an entry scenario and names
the public `using-claw-kit` skill. The `will-user-message` hook appends the Cindy
Host identity and asks the agent to read that skill's `SKILL.md` at the path in
its available skill list, then its Cindy route before beginning the task. This
instruction is appended once per session through the supported `event-verdict`
rewrite. The skill remains in the shared global pool, not in the plugin.
The user text is preserved; when appending would exceed
the Host's 16,000-character limit, the hook allows it unchanged and catalog
identity remains the fallback. It performs no network or workflow calls and
never blocks a message. A session receipt under `~/.agents/.claw-kit-cindy-hooks`
prevents repeat insertion after plugin restart. Reservation precedes the verdict;
if delivery is unknown, the adapter keeps the native catalog fallback instead of
resending the introduction. Cindy does not inject `additionalContext`. The plugin starts
session-state refresh, cleanup, and embedding warmup asynchronously from
`did-session-created`. It provides structured Agent Tool calls that execute workflow commands with
Cindy-owned host and session identity, and maintains a live workflow card
updated by those Tool calls. It does not recover a plan during session creation
or poll `claw context` at turn end. The Ghost Hook consumes the latest
typed plan projection to emulate Goal Mode without requiring a native Cindy
Goal API; paused, discussing, completed, and closed plans stop continuation.
The continuation guard keys retries by the current task id, resets when that
id advances, and pauses the plan after two unsuccessful attempts on one task.
