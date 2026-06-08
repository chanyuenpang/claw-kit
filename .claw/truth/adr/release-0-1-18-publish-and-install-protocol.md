# ADR: Release 0.1.18 publish and install protocol

## Status

Accepted

## Context

`release-0-1-18` 这个完成计划把一次正式发布收口成了可重复的发布协议。它要求先同步远端 `main`，再把版本提升到 `0.1.18`，然后完成本地验证和发布，最后清理本机临时的 `npm token` 配置。计划同时保留了 Windows 本地安装脚本的分发路径，避免把日常本地使用绑定到真实 `npm publish`。

## Decision

采用以下发布与安装顺序：

- 先同步远端 `main`，确认发布基线正确，再执行版本 bump
- 发布前必须完成 `npm test`、`npm run check`，以及本地安装脚本验证
- 双包发布保持固定顺序：先发 `@veewo/claw-core`，再发 `@veewo/claw`
- Windows 本地安装继续通过 `scripts/install-cli.ps1`，并保持 `npm install -g @veewo/claw` 作为本地 CLI 安装路径
- 发布完成后删除本机临时 `npm token` 配置

## Consequences

- 发布链路变成先验证、后发布，降低把未验证状态直接推向 npm 的风险
- `@veewo/claw-core` 与 `@veewo/claw` 的先后顺序被固定，避免依赖链倒置
- Windows 本地安装路径保持可重复执行，不需要依赖真实发布来完成日常使用
- 发布后清理 token 让本机环境回到更安全的状态

## Related code

- `DISTRIBUTION.md`
- `docs/2026-06-08-closeout-workflow.md`
- `scripts/install-cli.ps1`
- `packages/core/package.json`
- `packages/cli/package.json`
- `.claw/archive/tasks/release-0-1-18/plan.json`

## Search Terms

- `release-0-1-18`
- `@veewo/claw-core`
- `@veewo/claw`
- `scripts/install-cli.ps1`
- `npm install -g @veewo/claw`
- `npm token`
