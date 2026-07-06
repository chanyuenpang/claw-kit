# writing-plans 转换契约

## 状态

Accepted canonical truth for the converted Codex adapter package.

## 核心事实

- `packages/codex-adapter/skills/writing-plans/SKILL.md` 不应该被当成纯线性 wrapper；它需要保持 route-aware，因为源技能本身就包含 subagent-driven 和 inline execution 之间的执行交付分支。
- `packages/codex-adapter/skills/writing-plans/SUPERPOWERS-FALLBACK.md` 与 source `SKILL.md` byte-for-byte 一致；`packages/codex-adapter/skills/writing-plans/agents/openai.yaml` 也是 source package 对应文件的字节级拷贝。
- `packages/codex-adapter/skills/writing-plans/plan-document-reviewer-prompt.md` 作为配套 helper 文件被保留在转换后的 skill package 中，属于这个 skill 的稳定引用面之一。
- 开发仓库里的 package-scoped template 通过 `node .\packages\cli\dist\bin.js template validate --file packages\\codex-adapter\\skills\\writing-plans\\TEMPLATE.json` 成功校验，说明这条转换的模板验证应使用 `--file` 文件路径入口。
- 运行时 template 可用性依赖 Codex plugin bundle / install 链路：`scripts/codex-plugin-bundle.mjs` 和 `installCodexPluginBundle` 会把同包 `TEMPLATE.json` 随 `skills` payload 复制进插件缓存，运行时由 skill-local template loader 解析。
- 这类 skill 的 content coverage 是刻意分层的：入口和模板保持 visible workflow compact，`CLAW-KNOWLEDGE.md` 记录 major section anchors 和 command examples，`SUPERPOWERS-FALLBACK.md` 保留完整的 planning header、task structure、self-review 和 execution handoff prose。

## 维护提示

- 后续如果扩展 visible entry，优先保留 route-aware 路由和执行交付分支，不要把 writing-plans 压成单一路线的摘要壳。
- 如果模板校验或 bundle 机制变动，先回看 `packages/codex-adapter/skills/writing-plans/`、`packages/cli/src/cli.ts` 和 `scripts/codex-plugin-bundle.mjs`。

## 验证记录

- `node .\packages\cli\dist\bin.js template validate --file packages\\codex-adapter\\skills\\writing-plans\\TEMPLATE.json`
- `Get-FileHash` 比对确认 `SUPERPOWERS-FALLBACK.md` 与 source `SKILL.md` 哈希一致，`agents/openai.yaml` 也与 source package 对应文件一致，`plan-document-reviewer-prompt.md` 保留在 converted package 中。
