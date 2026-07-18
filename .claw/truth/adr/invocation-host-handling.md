# ADR: Invocation host handling is scoped to the invocation and finalization job

## Status

Accepted

## Context

Codex 与 OpenCode 都需要把宿主语义传入 CLI，但把 `CLAW_HOST` 当作可在任意层重新读取的进程全局状态，会使一次 invocation 的路由依赖环境污染。将 host 写入 session binding 或 knowledge registry 同样会让旧会话身份影响之后的 invocation。

后台 knowledge finalization 又跨越前台 CLI 进程边界。若 detached worker 继承前台 `CLAW_HOST`，它可能覆盖 Stop hook 对该次终结的原生 host 判断。因此 invocation 输入、持久化 job 和 worker 启动必须有明确且单向的 host 边界。

这项决定不改变现有 ADR 中的相邻职责：Codex 的固定 code-mode consumer 仍只消费 Codex `hostActions`，OpenCode adapter 仍只负责 host wiring，session binding 仍只拥有 `sessionKey -> planPath`。

## Decision

- `--host` 与 `CLAW_HOST` 仅是单次 invocation 输入，并且只接受 `codex` 或 `opencode`。无效值或两个来源冲突必须以 `PROJECT_CONFIG_INVALID` 在任何项目写入前失败。
- CLI 入口通过 `resolveInvocationHost()` 一次性解析不可变的 `effectiveHost`，并将它显式传给命令、guidance、hook 和结果投影；后续路径不得重新读取或修改 `process.env.CLAW_HOST` 来改变本次路由。
- 只有 `effectiveHost === "codex"` 时构建和输出 `hostActions`。OpenCode 直接消费适用的 guidance，不通过先构建再过滤 Codex action 的方式实现隔离。
- host 不写入 session binding 或 knowledge registry。Stop hook 的原生 host 是 finalization 的权威来源，必须快照到 `KnowledgeFinalizationJob.host`。
- detached finalization 与 completion worker 在移除了 `CLAW_HOST` 的环境中启动，并只按 `job.host` 选择 Codex 或 OpenCode writer。旧 job 可兼容缺失 host，但不得放宽新 job 的快照要求。

## Alternatives Considered

- 在深层 CLI 路径或 worker 中继续读取 `CLAW_HOST`：拒绝，因为前台环境可以泄漏到后台并改变已确定的路由。
- 在 session binding 或 knowledge registry 保存 host：拒绝，因为持久会话状态不能代表下一次 invocation 的 adapter 身份。
- 为所有 host 先生成 `hostActions`，再由 OpenCode 路径删除：拒绝，因为 host 专属合同应在 Codex 投影边界形成，而不是依赖事后过滤。

## Consequences

- host 身份在 CLI 前台保持 invocation-scoped，在后台只通过 finalization job 的显式快照传递；session 与 registry 不再成为 host 的第二份所有权。
- 输入验证、Codex-only action 投影、Stop hook 捕获和 worker 环境隔离成为同一条可回归的路由链。
- adapter 继续可以通过 `--host` 或 `CLAW_HOST` bootstrap，但任何新增命令、hook 或 worker 都必须接收已解析的 host 或 `job.host`，而不能自行解释环境变量。

## Related Code

- `packages/cli/src/invocation-host.ts`
- `packages/cli/src/cli.ts`
- `packages/core/src/knowledge-sidecar.ts`
- `packages/core/src/session-bindings.ts`
- `packages/opencode-adapter/plugin/index.ts`
- `.claw/tasks/Harden-invocation-host-handling/plan.json`

## Search Terms

- `resolveInvocationHost`
- `effectiveHost`
- `--host`
- `CLAW_HOST`
- `PROJECT_CONFIG_INVALID`
- `hostActions`
- `KnowledgeFinalizationJob.host`
- `withoutInvocationHost`
- `tryCaptureKnowledgeStop`
- `worker isolation`
