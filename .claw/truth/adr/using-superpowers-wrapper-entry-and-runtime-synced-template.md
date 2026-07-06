# ADR: `using-superpowers` wrapper entry and runtime-synced template

## Status

Accepted

## Context

`using-superpowers` 已完成为轻量 wrapper + adjacent fallback 的保真转换。这个结果不是单纯的实现细节，而是长期合同：可见入口只负责最短路由，原始 superpowers 正文、长篇分支、helper assets 和压缩后的知识锚点分别落在各自的文件里，避免 visible template 继续膨胀成 summary-only surface。

同时，`packages/codex-adapter` 的模板不是只存在于开发仓库内。它在运行时要通过 Codex plugin bundle / install 同步到用户 registry，所以验证和引用必须以开发仓库里的 file path 为准，而不能假设安装缓存总是最新。

## Decision

- `packages/codex-adapter/skills/using-superpowers/SKILL.md` 只承担可见入口和最短路由。
- `packages/codex-adapter/skills/using-superpowers/SUPERPOWERS-FALLBACK.md` 保留原始 skill 正文，作为相邻 fallback。
- `packages/codex-adapter/skills/using-superpowers/CLAW-KNOWLEDGE.md` 和 `CONTENT-COVERAGE.md` 只保存压缩后的锚点与覆盖映射，长文和分支细节继续留在 fallback。
- `packages/codex-adapter/skills/using-superpowers/agents/openai.yaml` 以及 `references/` 下的 copied helper files 继续作为这个 skill package 的一等运行时资产。
- 该 skill 通过 `packages/codex-adapter/skills/using-superpowers/TEMPLATE.json` 提供 template，开发仓库里用 `claw template validate --template superpowers-using-superpowers` 按 file path 验证。
- 在 Codex 插件实际安装后，template 是否可用取决于 bundle/install 同步到用户 registry；因此 `claw plan create --template superpowers-using-superpowers` 只有在该 template 已可解析时才应作为公开路由。

## Consequences

- visible skill 保持轻量，原始 superpowers 语义仍可从 fallback 和 copied assets 中恢复。
- 以后可以独立调整 entry、fallback、knowledge 和 coverage，而不必把长文重新塞回 visible template。
- template 验证以开发仓库为准，避免依赖过期的安装缓存。
- plugin bundle / install 同步成为这个 skill package 的交付条件之一。

## Related Code

- `packages/codex-adapter/skills/using-superpowers/SKILL.md`
- `packages/codex-adapter/skills/using-superpowers/SUPERPOWERS-FALLBACK.md`
- `packages/codex-adapter/skills/using-superpowers/CLAW-KNOWLEDGE.md`
- `packages/codex-adapter/skills/using-superpowers/CONTENT-COVERAGE.md`
- `packages/codex-adapter/skills/using-superpowers/agents/openai.yaml`
- `packages/codex-adapter/skills/using-superpowers/references/codex-tools.md`
- `packages/codex-adapter/skills/using-superpowers/references/copilot-tools.md`
- `packages/codex-adapter/skills/using-superpowers/references/gemini-tools.md`
- `packages/codex-adapter/skills/using-superpowers/TEMPLATE.json`
- `scripts/codex-plugin-bundle.mjs`
- `scripts/install-codex-plugin.mjs`

## Search Terms

- `using-superpowers`
- `SUPERPOWERS-FALLBACK.md`
- `CLAW-KNOWLEDGE.md`
- `CONTENT-COVERAGE.md`
- `claw template validate --template superpowers-using-superpowers`
- `codex-plugin-bundle`
- `install-codex-plugin`
