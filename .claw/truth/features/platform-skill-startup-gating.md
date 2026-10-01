# Platform skill startup gating

<!-- state: current -->
## Current behavior

- The complete [using-claw-kit package](<../../../.agents/skills/using-claw-kit/SKILL.md>) owns common admission and entry order; [shared-source Truth](<shared-planning-skill-source.md>) owns its artifact distribution. Installing a skill from one host does not select that host at execution time.
- Select the actual active adapter and tools before recovery or mutation. Trust current adapter-owned [claw host] platform text or clawHost.platform, never model/provider, installed skill location, task text, a prior session, or a remote tool's identity overriding the current host. A Codex model in Cindy remains Cindy.
- Codex, DSH and OpenCode declare identity through supported startup/context surfaces; DSH and Codex retain identity when context recovery is unavailable. Cindy declares through native Ghost catalog/results and continuation, with catalog confirmation before mutation when no startup marker exists. Cindy has no verified first-turn prompt hook here. OpenClaw has no implemented workflow startup hook; standard requires explicitly established hostless entry without an active native adapter.
- Resolve identity/tool conflicts visibly; do not switch hosts, forge host/session arguments, or use shell as a native-route fallback. Cindy always uses Ghost, not the Codex driver (which fixes host=codex).
- Recover existing session-bound workflow first. Then respect direct/manual non-workflow requests; choose an owning template before a generic plan. Work expected to deposit reusable project knowledge otherwise creates a plan; ordinary questions/chores run directly. Planning owns plan quality, not this admission gate.
- Follow returned workflow guidance as the lifecycle contract. Common semantics do not transfer transport, Goal projection, dispatch or closeout ownership from the selected adapter.

## Verification boundary and anchors

- [Codex entry](<../../../packages/codex-adapter/scripts/session-start.mjs>), [DSH rendering](<../../../packages/dsh-adapter/src/protocol.ts>), [OpenCode injection](<../../../packages/opencode-adapter/plugin/index.ts>), [Cindy metadata](<../../../packages/cindy-adapter/plugin/ghost.json>) and [result wrapper](<../../../packages/cindy-adapter/plugin/main.js>) are implementation anchors.
- [Host references](<../../../.agents/skills/using-claw-kit/references/hosts/>) describe supported transports and gaps. Read-only source checks and isolated tests do not establish live-host activation or universal first-turn injection.

<!-- state: history -->
## Evolution history

<!-- dated: 2026-10-01 -->
### Replaced adapter-local minimal entry with trusted host selection

The former entry checked reusable knowledge before the default plan-create route in separate adapter-owned skills. Complete portable skills now select a trusted host, recover workflow state, then apply template/admission rules. This avoids mistaking a Cindy-hosted Codex model or another host's installed skill for the current execution platform.
