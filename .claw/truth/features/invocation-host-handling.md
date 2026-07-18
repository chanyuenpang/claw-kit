# Invocation host handling

## 结论

`--host` 与 `CLAW_HOST` 是单次 CLI invocation 的输入，而不是 session binding 或 knowledge registry 的持久化身份。它们只接受 `codex` 与 `opencode`：无效值或两个来源冲突时，必须以 `PROJECT_CONFIG_INVALID` 在任何项目写入前失败。

CLI 入口将两个输入一次性解析为 `effectiveHost`，并将该值显式传给 context、plan、task、subplan、direct、hook 和结果投影路径。本次 invocation 后续不得重新读取或修改 `process.env.CLAW_HOST` 来改变路由。

## 长期行为 / 规则

- `resolveInvocationHost()` 是唯一的 invocation host 解析边界；`--host` 与 `CLAW_HOST` 同时存在且值不同即为确定性配置错误。
- `hostActions` 仅在 `effectiveHost === "codex"` 时构建及输出。OpenCode 直接消费适用于其 host 的 guidance，不应依赖输出过滤来移除 Codex action。
- session binding 仍只保存 `sessionKey -> planPath`，knowledge session registry 也不保存或刷新 host；两者不能被用作后续 invocation 的 host 来源。
- Stop hook 的原生 host 是 finalization 的权威来源。它将 host 快照写入 `KnowledgeFinalizationJob.host`，detached writer 以 `job.host` 选择 Codex 或 OpenCode runner。
- 启动 knowledge finalization 或 completion refresh 的 detached worker 必须使用移除了 `CLAW_HOST` 的环境。worker 不得继承前台环境中的 host，再据此覆盖 job 快照的路由。

## 真实调用链路

1. CLI 入口调用 `resolveInvocationHost(explicitHost, process.env.CLAW_HOST)`，取得一次性的 `effectiveHost`。
2. 命令路径和 compact result 使用该 `effectiveHost`；仅 Codex 输出 `hostActions`。
3. Stop hook 将其原生 host 传给 `tryCaptureKnowledgeStop(...)`，由 sidecar 写入 `KnowledgeFinalizationJob.host`。
4. finalization worker 读取 job 的 host 选择 writer；它的启动环境已经由 `withoutInvocationHost()` 清除 `CLAW_HOST`。

## 关联代码

- 解析、支持值与 worker 环境隔离：`packages/cli/src/invocation-host.ts`
- CLI 入口、host 专属结果投影、Stop hook 及 detached worker 启动：`packages/cli/src/cli.ts`
- host-free knowledge registry 与 `KnowledgeFinalizationJob.host`：`packages/core/src/knowledge-sidecar.ts`
- session binding 的 host-free `sessionKey -> planPath` 模型：`packages/core/src/session-bindings.ts`
- OpenCode 注入其 invocation host 并直接消费 guidance：`packages/opencode-adapter/plugin/index.ts`

## 已知陷阱

- 不要将 `CLAW_HOST` 当作可在深层命令处理或后台 worker 中重新解释的全局状态；它只能在 CLI 边界参与解析。
- 不要把 host 写入 session binding 或 knowledge registry，以免过期会话身份污染新 invocation。
- 不要在 OpenCode 路径构建后再剥离 `hostActions`；正确边界是在 Codex 专属投影处根本不为其他 host 创建它。
- 对旧 finalization job，`host` 可缺失；兼容回退不能改变新 job 必须由 Stop hook 快照 host 的规则。

## 验证标准

- 覆盖缺失、无效与冲突的 `--host` / `CLAW_HOST` 输入，以及错误发生在项目写入之前。
- 覆盖单一 `effectiveHost` 在各 CLI 路径和输出投影中的传递，确认仅 Codex 结果携带 `hostActions`。
- 覆盖 session binding 与 knowledge registry 不含 host，Stop job 写入原生 host，且 worker 不能从前台 `CLAW_HOST` 泄漏取得路由。
- 同时验证 Codex 与 OpenCode 的官方 hook、CLI 和 bundle 路径，防止 host 专属合同漂移。

## 关键检索词

`resolveInvocationHost`、`effectiveHost`、`--host`、`CLAW_HOST`、`PROJECT_CONFIG_INVALID`、`hostActions`、`KnowledgeFinalizationJob.host`、`withoutInvocationHost`、`tryCaptureKnowledgeStop`
