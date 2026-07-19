# ADR: `verification-before-completion` compact wrapper and runtime-synced template

## Status

Historical. The referenced standalone skill package is no longer present in the current adapter; its named-template commands below describe the historical registry-backed route, not the current loaded-skill entry contract.

## Context

`verification-before-completion` 已完成为 compact linear wrapper + adjacent fallback 的保真转换。这个结果代表一条长期合同：可见入口只承载最短的确认、验证、读取、检查与提交规则，原始 superpowers 的完整说理、警告和示例继续保留在 fallback 中，避免 visible template 变成全文抄写。

与此同时，`packages/codex-adapter` 的 template 只有在插件 bundle / install 把它同步到用户 registry 之后才算运行时可用，所以开发期验证必须以仓库中的 file path 为准，不能把本地安装缓存当成唯一真相。

## Decision

- `packages/codex-adapter/skills/verification-before-completion/SKILL.md` 只负责可见入口和最短路由。
- `packages/codex-adapter/skills/verification-before-completion/SUPERPOWERS-FALLBACK.md` 保留完整原文，作为相邻 fallback。
- `packages/codex-adapter/skills/verification-before-completion/CLAW-KNOWLEDGE.md` 和 `CONTENT-COVERAGE.md` 只保存压缩后的锚点和覆盖映射，长文与反复强调的规则继续留在 fallback。
- `packages/codex-adapter/skills/verification-before-completion/agents/openai.yaml` 以及 copied helper files 仍然属于这个 skill package 的一等运行时资产。
- 该 skill 通过 `packages/codex-adapter/skills/verification-before-completion/TEMPLATE.json` 提供 template，开发仓库里用 `claw template validate --template superpowers-verification-before-completion` 按 file path 验证。
- 只有在 Codex plugin bundle / install 已完成同步、template 在用户 registry 中可解析时，`claw plan create --template superpowers-verification-before-completion` 才应被视为公开可用路由。

## Consequences

- visible skill 保持短小明确，而原始 verification 规则仍可从 fallback 恢复。
- 后续可以独立调整 entry、fallback、knowledge 和 coverage，而不必把完整警告重新塞回 visible template。
- 开发期验证以仓库文件为准，避免依赖过期的安装缓存。
- plugin bundle / install 同步成为这个 skill package 的交付条件之一。

## Related Code

- `packages/codex-adapter/skills/verification-before-completion/SKILL.md`
- `packages/codex-adapter/skills/verification-before-completion/SUPERPOWERS-FALLBACK.md`
- `packages/codex-adapter/skills/verification-before-completion/CLAW-KNOWLEDGE.md`
- `packages/codex-adapter/skills/verification-before-completion/CONTENT-COVERAGE.md`
- `packages/codex-adapter/skills/verification-before-completion/agents/openai.yaml`
- `packages/codex-adapter/skills/verification-before-completion/TEMPLATE.json`
- `scripts/codex-plugin-bundle.mjs`
- `scripts/install-codex-plugin.mjs`

## Search Terms

- `verification-before-completion`
- `SUPERPOWERS-FALLBACK.md`
- `CLAW-KNOWLEDGE.md`
- `CONTENT-COVERAGE.md`
- `claw template validate --template superpowers-verification-before-completion`
- `codex-plugin-bundle`
- `install-codex-plugin`
