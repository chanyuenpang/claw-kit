# systematic-debugging generated test tree removal

## 状态

这是一个已经收束的生成型测试产物记录，不再代表当前维护中的 shared skill。

## 核心事实

- `systematic-debugging` 曾在 `create-claw-skill` 的验证过程中作为生成型测试 skill 树出现，但它不是 `scripts/sync-shared-skills.mjs` 的默认维护目标。
- 这类测试产物不应作为正式 shared skill/template 保留在仓库里，除非未来被明确重新晋升。
- 如果将来需要重新引入 `systematic-debugging`，应先把它当作正式 shared skill 重新设计其 canonical source、adapter 副本和模板合同，再把它纳入同步列表。

## 影响

- 不应把 `shared/skills/systematic-debugging/`、`packages/codex-adapter/skills/systematic-debugging/` 或 `packages/opencode-adapter/skills/systematic-debugging/` 当作当前维护面来依赖。
- 任何关于系统化排错的新合同都应从新的正式 shared skill 设计开始，而不是沿用这次测试产物的临时结构。

## 证据

- `scripts/sync-shared-skills.mjs`
- `.claw/truth/SUMMARY.md`
- `.claw/truth/adr/shared-planning-skill-source.md`
