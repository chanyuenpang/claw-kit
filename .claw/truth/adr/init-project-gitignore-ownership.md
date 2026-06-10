# ADR: `claw init` owns the claw-kit `.gitignore` block

## Status

Accepted

## Context

`claw-kit` 需要在项目初始化时自动补齐专用 `.gitignore` 规则块，但这类写入只能属于初始化职责。
本次完成的 `gitignore-init-closeout` plan 明确了三条长期边界：

- claw-kit 的 `.gitignore` 规则块归 `initProject()` 所有
- `project-check` / protocol repair 不应扩散成 `.gitignore` 写入入口
- `claw context` 只负责上下文恢复，不负责修改项目根目录 `.gitignore`

这样可以避免多个入口同时维护同一组忽略规则，导致职责漂移、重复追加或难以预测的项目根目录修改。

## Decision

- 仅在 `claw init` / `initProject()` 中检查并追加 claw-kit 专用 `.gitignore` 规则块
- 如果目标规则块已经存在，重复 init 必须保持 `.gitignore` 稳定，不得再次追加同一块
- `project-check`、protocol repair 和 `claw context` 不得写入项目根目录 `.gitignore`

## Consequences

- `.gitignore` 变更的职责边界清晰，初始化流程拥有唯一写入口
- 重复 init 不会污染项目根目录，也不会制造重复规则块
- 后续 protocol/context 修复逻辑可以继续专注于 schema 和上下文恢复，而不需要同步处理 `.gitignore`

## Related Code

- `packages/core/src/init.ts`
- `packages/core/src/project-check.ts`
- `packages/core/src/context.ts`
- `.gitignore`
- `.claw/archive/tasks/gitignore-init-closeout/plan.json`
