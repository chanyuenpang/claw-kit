# ADR: `writing-plans` route-aware wrapper and review prompt

## Status

Historical. The referenced standalone skill package is no longer present in the current adapter; its named-template commands below describe the historical registry-backed route, not the current loaded-skill entry contract.

## Context

`writing-plans` 已完成为 route-aware wrapper + adjacent fallback 的保真转换。这个结果不是单纯的模板压缩，而是长期合同：可见入口只保留最短的规划路由、任务分解和收尾门槛，`plan-document-reviewer-prompt.md` 继续作为同包的 companion 资产保存，以便在写完完整 plan 后进行独立 reviewer dispatch。

与此同时，`packages/codex-adapter` 的 template 仍然依赖插件 bundle / install 同步到用户 registry 才算运行时可用，所以开发期验证必须以仓库里的 file path 为准，不能把安装缓存当作唯一真相。

## Decision

- `packages/codex-adapter/skills/writing-plans/SKILL.md` 只负责可见入口和最短路由。
- `packages/codex-adapter/skills/writing-plans/SUPERPOWERS-FALLBACK.md` 保留完整原文，作为相邻 fallback。
- `packages/codex-adapter/skills/writing-plans/CLAW-KNOWLEDGE.md` 和 `CONTENT-COVERAGE.md` 只保存压缩后的锚点与覆盖映射，长文与重复强调的要求继续留在 fallback。
- `packages/codex-adapter/skills/writing-plans/plan-document-reviewer-prompt.md` 作为 companion prompt 继续随包保留，不被折叠进 visible template。
- 该 skill 通过 `packages/codex-adapter/skills/writing-plans/TEMPLATE.json` 提供 template，开发仓库里用 `claw template validate --template superpowers-writing-plans` 按 file path 验证。
- 只有在 Codex plugin bundle / install 已完成同步、template 在用户 registry 中可解析时，`claw plan create --template superpowers-writing-plans` 才应被视为公开可用路由。

## Consequences

- visible skill 保持轻量，同时 reviewer prompt 仍能在写完 plan 后独立复用。
- 后续可以独立调整 entry、fallback、knowledge、coverage 和 reviewer prompt，而不必把 reviewer 指引重新塞回 visible template。
- 开发期验证以仓库文件为准，避免依赖过期的安装缓存。
- plugin bundle / install 同步成为这个 skill package 的交付条件之一。

## Related Code

- `packages/codex-adapter/skills/writing-plans/SKILL.md`
- `packages/codex-adapter/skills/writing-plans/SUPERPOWERS-FALLBACK.md`
- `packages/codex-adapter/skills/writing-plans/CLAW-KNOWLEDGE.md`
- `packages/codex-adapter/skills/writing-plans/CONTENT-COVERAGE.md`
- `packages/codex-adapter/skills/writing-plans/plan-document-reviewer-prompt.md`
- `packages/codex-adapter/skills/writing-plans/agents/openai.yaml`
- `packages/codex-adapter/skills/writing-plans/TEMPLATE.json`
- `scripts/codex-plugin-bundle.mjs`
- `scripts/install-codex-plugin.mjs`

## Search Terms

- `writing-plans`
- `plan-document-reviewer-prompt.md`
- `SUPERPOWERS-FALLBACK.md`
- `CLAW-KNOWLEDGE.md`
- `CONTENT-COVERAGE.md`
- `claw template validate --template superpowers-writing-plans`
- `codex-plugin-bundle`
- `install-codex-plugin`
