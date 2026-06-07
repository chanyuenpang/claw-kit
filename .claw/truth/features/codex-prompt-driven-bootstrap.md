# Codex Prompt-Driven Bootstrap

## Status

Accepted working truth for the current Codex adapter.

## Core facts

- 在这台机器上，Codex plugin skill loading 足够可靠，可以作为主要 session startup path。
- Codex command hooks 不再作为 `claw-kit` correctness 的第一依赖；adapter 仍应先通过 prompt-driven skills 进入 harness。
- Codex adapter 应从 `claw-kit:bootstrap` 开始。
- `claw-kit:bootstrap` 应在普通任务工作开始前恢复 `.claw` context。
- Task scope 仍应通过 `claw plan write` 建立。
- Codex hook surface 现在收敛为 4 个 lifecycle hooks：`SessionStart`、`UserPromptSubmit`、`Stop`、`PreCompact`。
- 插件 hook 配置的命令统一为极简 `claw hook <event>`，配置锚点是 `packages/codex-adapter/hooks/hooks.json`。
- `claw hook` 的 CLI 实现在 `packages/cli/src/cli.ts`：它先用当前 `cwd` 解析 `.claw` project context；解析不到 `.claw` 时返回 `skipped: true`，且不写 hook log。
- `.claw` project 内的 hook event 会写入 `%USERPROFILE%\.codex\claw-kit-hook.log` JSONL；记录包含 `projectRoot`、`clawDir`、`projectId`、`projectName` 等项目锚点。
- CLI 测试锚点在 `packages/cli/test/cli.test.ts`，覆盖 project 内 logging 和 outside `.claw` skip。

## Practical implications

- Startup behavior 仍是 prompt-driven rather than hook-driven。
- Hooks 可以作为可选增强层记录 lifecycle signal，但不能替代 `claw-kit:bootstrap`、`claw plan write`、truth/ADR deposition 等显式 workflow。
- Plan、memory、truth、ADR workflows 应显式解析 context，而不是假设 hook 已经运行过。
- Hook command 必须保持 `.claw` scope gated，避免安装了插件但未使用 claw-kit 的 Codex 用户被写入日志或受到副作用影响。
