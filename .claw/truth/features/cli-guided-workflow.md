# CLI-guided workflow

## 结论

- planning 现在直接拥有 requirements 到 process 的质量门；`plan-review` 不再是必须单独经过的 workflow gate。
- `claw-kit` 主线是 CLI-driven `.claw` harness，而不是 Apps SDK / app / widget / chat-rendering surface。
- `claw plan write`、`claw plan edit`、`claw plan done` 的默认返回值是 compact contract：`ok`、`planStatus`、`workflowGuidance`、`planSummary`，以及可选 `completionRefresh`。
- plan 命令不再返回 render blocks，不再提供 `claw plan app` / `claw plan render`。
- 当所有当前任务完成时，CLI 仍先把可复用知识交给 `truth-writer`，再走 retrospective 与 `claw plan done`；计划完成后再把 `plan.json` 交给 `adr-writer`。

## 真实代码锚点

- 计划生命周期与结果裁剪：`packages/core/src/plan.ts`
- workflow guidance 生成：`packages/core/src/workflow-guidance.ts`
- CLI 紧凑输出与 completion refresh：`packages/cli/src/cli.ts`
- 结果类型：`packages/core/src/types.ts`

## 验证基线

- `npm run build -w @claw-kit/core`
- `npm run build -w @claw-kit/cli`
- `npm run test -w @claw-kit/core`
- `npm run test -w @claw-kit/cli`
- `npm run check -w @claw-kit/codex-adapter`
