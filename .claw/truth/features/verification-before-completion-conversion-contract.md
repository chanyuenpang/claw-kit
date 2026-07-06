# verification-before-completion 转换契约

## 状态

Accepted canonical truth for the converted Codex adapter package.

## 核心事实

- `packages/codex-adapter/skills/verification-before-completion/SKILL.md` 维持为 compact linear wrapper entry，负责触发与路由；五步 gate 被收敛到 template tasks 和 `CLAW-KNOWLEDGE.md`，而不是把完整 enforcement prose 内联到 visible surface。
- `packages/codex-adapter/skills/verification-before-completion/SUPERPOWERS-FALLBACK.md` 与 source `SKILL.md` byte-for-byte 一致；`packages/codex-adapter/skills/verification-before-completion/agents/openai.yaml` 也与 source package 对应文件 byte-for-byte 一致。
- 开发仓库里的 package-scoped template 通过 `node .\packages\cli\dist\bin.js template validate --file packages\\codex-adapter\\skills\\verification-before-completion\\TEMPLATE.json` 成功校验，证明这条转换的文件路径校验应走 `--file` 入口。
- 运行时 template 可用性依赖 Codex plugin bundle / install 链路：`scripts/codex-plugin-bundle.mjs` 和 `installCodexPluginBundle` 会把同包 `TEMPLATE.json` 随 `skills` payload 复制进插件缓存，运行时由 skill-local template loader 解析。
- 这类 skill 的 content coverage 是刻意轻量化的：trigger / routing 放在入口和 fallback，按序的五步 gate 收敛到 template tasks 与 `CLAW-KNOWLEDGE.md`，hard verification guardrails 和示例保留在 fallback。

## 维护提示

- 后续如果需要改 visible entry，优先保留线性路由和轻量 wrapper 形状，不要把 verification skill 展开成 dense instructions surface。
- 如果模板校验或 bundle 机制变动，先回看 `packages/codex-adapter/skills/verification-before-completion/`、`packages/cli/src/cli.ts` 和 `scripts/codex-plugin-bundle.mjs`。

## 验证记录

- `node .\packages\cli\dist\bin.js template validate --file packages\\codex-adapter\\skills\\verification-before-completion\\TEMPLATE.json`
- `Get-FileHash` 比对确认 `SUPERPOWERS-FALLBACK.md` 与 source `SKILL.md` 哈希一致，`agents/openai.yaml` 也与 source package 对应文件一致。
