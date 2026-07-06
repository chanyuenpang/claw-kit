# Superpowers 批量转化约定

## 状态

Accepted working truth for batch conversion of the 14 Codex superpowers plugin skills.

## 核心事实

- 批量把 14 个 Codex superpowers plugin skills 转成 claw skills 时，目标写入路径是 `packages/codex-adapter/skills/<skill-name>/`；这类转换不应直接编辑用户的 Codex plugin cache。
- 根计划只负责编排：每个 superpowers skill 都应通过自己的 `create-claw-skill` subplan 推进，不能由 root plan 直接批量改写目标技能内容。
- 这轮重做确认，之前批量生成的 conversions 只能算 draft artifacts，不能直接当作满足 `create-claw-skill` 质量门槛的正式结果。
- 这意味着每个 superpowers skill 的 subplan 都必须独立完成 source analysis、template design、fallback preservation、compiled knowledge 和 content coverage，不能依赖共享生成器一次性替代执行期工作。
- 批量生成的 template id 应带稳定前缀，避免与 canonical template id 碰撞，并让生成产物默认保持 non-canonical。
- 生成的 claw skill 应保留 adjacent fallback 文档和同包 helper folders，但不应自动进入 shared canonical sync set；只有显式 promotion 才能进入正式共享同步范围。
- 本轮完整 round 验证确认，14/14 个目标 skill 都是通过各自独立的 `create-claw-skill` subplan 推进完成的，而不是由 root 侧批量生成器一次性收敛。
- 稳定的转换形状已经明确成一条 recurring pattern：wrapper `SKILL.md` 入口 + 同包 `TEMPLATE.json` + `SUPERPOWERS-FALLBACK.md` 的字节级保真 + `CLAW-KNOWLEDGE.md` + `CONTENT-COVERAGE.md` + copied source sidecars。
- 开发时的 template 校验采用 file-path 路径入口 `template validate --file ...`，因为安装前的 project template registry 只会暴露默认模板，不会按 id 暴露这些 plugin-scoped templates。
- 运行时 template 可解析性已经由 Codex plugin bundle / install 链路证明：bundle payload 包含带 `TEMPLATE.json` 的 skill package，安装流程会把这些 skill-local templates 带入插件缓存。
- 最终 batch verification 对 14 个技能都确认了 required generated files 存在、fallback 与 source `SKILL.md` byte-for-byte 匹配、source sidecars 已完整复制、`codex-adapter` 的 check 通过、`codex-adapter` 的 build 通过。
- 这一轮的质量门槛不是单一形状：部分技能保持 compact linear wrapper，而 route-heavy 技能则保留更丰富的 companion docs 和 route semantics。

## 影响

- 批量 conversion orchestration 应把每个 skill 当作独立的 subplan 单元处理。
- 生成型 skill tree 默认保持实验态，不会因为落到 workspace 里就自动晋升为 canonical shared skill。

## 证据

- `shared/skills/create-claw-skill/SKILL.md`
- `packages/codex-adapter/skills/create-claw-skill/SKILL.md`
- `packages/codex-adapter/skills/using-claw-kit/SKILL.md`
- `packages/opencode-adapter/skills/using-claw-kit/SKILL.md`
- `scripts/sync-shared-skills.mjs`
- `.claw/tasks/Rework-Codex-superpowers-claw-skills-through-per-skill-create-claw-skill-subplans/plan.json`
- `.claw/tasks/Rework-Codex-superpowers-claw-skills-through-per-skill-create-claw-skill-subplans/plan.json` 下完成的 14 个 per-skill subplan 报告
