# Codex Session Entry Hardening

## Status

Accepted working truth for the current Codex adapter startup path.

## Core facts

- `@claw-kit` 的主入口是 `claw-kit:using-claw-kit`。
- `SessionStart` hook 只负责 session-entry bootstrap enhancement，不负责 canonical harness correctness。
- 当前启动脚本是 `packages/codex-adapter/hooks/session-start-bootstrap.mjs`。
- 启动时先根据 `cwd` 判断是否位于 `.claw` 项目内。
- 命中 `.claw` 项目时，脚本执行 `claw context`，把紧凑 project context 和 “应使用 [@claw-kit](plugin://claw-kit@claw-kit-local) 推进任务” 的提示写入 `additionalContext`。
- 不在 `.claw` 项目时，hook 应静默退出，不污染普通 session。

## Workflow implications

- startup hook 负责把 session 引到正确入口，但不会替代 `claw plan write`、`claw plan edit`、`claw plan done` 这些 canonical CLI 行为。
- 主 agent 仍需读取 `.claw` context，并消费 `workflowGuidance` 推进后续流程。
- 即使 hook 可用，prompt-driven startup 仍然是主路径。

## Related files

- `packages/codex-adapter/hooks/session-start-bootstrap.mjs`
- `packages/codex-adapter/hooks/hooks.json`
- `packages/codex-adapter/.codex-plugin/plugin.json`
- `packages/codex-adapter/hooks/session-start-bootstrap.test.mjs`
- `packages/codex-adapter/skills/using-claw-kit/SKILL.md`

## Boundaries

- hook 只能注入 developer-visible startup context，不能可靠接管 goal、subagent、truth、ADR 等 thread orchestration 行为。
- canonical harness correctness 仍绑定在 prompt-driven workflow 和 local claw CLI 上。
