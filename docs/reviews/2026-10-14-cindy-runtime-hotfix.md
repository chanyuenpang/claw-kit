# Cindy production-runtime follow-up

The public 0.2.51.2 smoke exposed an actual-host failure: skills installation
returned ENOENT after npm acquisition and plan.show returned
CLAW_SESSION_OPEN_TIMEOUT. Both Windows launch paths used process.execPath.
Cindy's production Electron utility worker exposes the application executable,
and its RunAsNode fuse is disabled. The same assumption also affected report
collector registration.

The shared Node resolver now uses the independent PATH Node in Electron, while
ordinary Node processes retain their own executable. The plugin artifact embeds
that same resolver for npm, Windows CLI invocation and the report collector.
No Host identity, workflow routing or Host code changes are needed. Missing Node
produces an actionable NODE_EXECUTABLE_NOT_FOUND error. Acquisition pins local
and non-dry-run npm mode to preserve the isolated staging contract.

The entry hook is exactly the owner's requested short text:

`[claw]当前是 Cindy Host，本次会话走 claw 流程，先读取 using-claw-kit 技能再开展任务[/claw]`

The existing per-session receipt still prevents reinsertion after restart.

Focused checks cover external Node launch from a path containing spaces, absence
of Node, artifact relocation, complete npm packaging, transactional installation,
existing worker regressions and once-per-session hooks. An isolated-home probe
with an Electron-shaped process successfully downloaded the published 0.2.52
skill content through genuine npm and installed all dependencies; this is a
regression probe, not a claim of actual-host smoke success for the new version.

Read-only investigation found two existing global junctions:
claw-kit--claw-kit-doc points to an old plugin temporary directory, and
feature-architecture points to the user's .codex/skills/feature-architecture.
Neither belongs to the new installer. They require an explicit migration choice;
backup only the junction entries outside discovery and preserve target content.
Do not silently delete or adopt them. Actual-host installation and workflow smoke
must be repeated after publishing and updating the new immutable candidate.
