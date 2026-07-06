# using-superpowers 转换契约

## 状态

Accepted canonical truth for the converted Codex adapter package.

## 核心事实

- `packages/codex-adapter/skills/using-superpowers/SKILL.md` 是转换后的可见入口，职责是轻量 wrapper：它保留入口路由和 fallback 连接点，不再把原始 superpowers 长文直接内联进 visible surface。
- `packages/codex-adapter/skills/using-superpowers/SUPERPOWERS-FALLBACK.md` 保存了原始技能正文，当前转换把需要保真的源内容放在邻接 fallback 文档里，而不是压缩成摘要后丢失原始措辞。
- `packages/codex-adapter/skills/using-superpowers/agents/openai.yaml` 以及 `references/codex-tools.md`、`references/copilot-tools.md`、`references/gemini-tools.md` 都作为同包复制资产保留，用于维持 helper/reference 语义与源包一致。
- `packages/codex-adapter/skills/using-superpowers/TEMPLATE.json` 是该转换对应的模板主体；在开发仓库里，这类 package-scoped template 用 `node .\packages\cli\dist\bin.js template validate --file <path>` 校验，而不是依赖 `--template <id>`，因为安装前的活动 template registry 只暴露 `default`。
- 运行时模板可用性由插件打包链路提供：`scripts/codex-plugin-bundle.mjs` 把同包 `TEMPLATE.json` 随 `skills` payload 复制进插件缓存，运行时由 skill-local template loader 解析。

## 维护提示

- 这类转换的稳定目标是“可见入口轻量化 + 邻接 fallback 保真 + helper/reference 资产原样保留”，不要把 visible skill 变成 dense template prose。
- 以后如果模板校验或 bundle 行为变动，优先复核 `packages/cli/src/cli.ts`、`scripts/codex-plugin-bundle.mjs` 和 `packages/codex-adapter/skills/using-superpowers/` 这三个锚点。

## 验证记录

- `npm run check --workspace @claw-kit/codex-adapter`
- `npm run build --workspace @claw-kit/codex-adapter`
- `node .\packages\cli\dist\bin.js template validate --file packages/codex-adapter/skills/using-superpowers/TEMPLATE.json`
- 仅剩的失败包测试与 `hooks/subagent-contract.test.mjs` 的 researcher contract 覆盖有关，和这次 `using-superpowers` 转换本身无关。
