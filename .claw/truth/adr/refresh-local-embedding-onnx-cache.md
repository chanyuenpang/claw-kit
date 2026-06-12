# ADR: Refresh local embedding ONNX cache

## Status

Accepted

## Context

`Refresh-local-embedding-ONNX-cache` 这次完成计划验证了一个长期有效的本地恢复模式：当 `.claw/models` 里的 `Snowflake/snowflake-arctic-embed-m-v2.0` ONNX 缓存被删掉或失效时，可以通过真实的 `claw search --query` 路径重新拉起同一份本地模型资产，而不需要改动项目的 embedding 配置。计划也暴露出一个更细的运行时约束：新鲜重建出来的 ONNX 缓存在被并发 `search` 与 `search index --refresh` 同时触发时，可能先撞到 `system error number 13`，而串行的 `claw search index --refresh` 再配合 `CLAW_EMBEDDING_LOCAL_DEVICE=cpu` 则能稳定恢复。

## Decision

采用以下本地模型缓存恢复约束：

- `.claw/models/Snowflake/snowflake-arctic-embed-m-v2.0` 可以视为可重建缓存，删掉后允许通过真实 `claw search --query` 路径重新下载并重建
- 仅凭时间戳变化不能判断模型资产已经改变，必须以实际可用性和后续检索/刷新成功为准
- 在同一次缓存重建后的立即验证阶段，不要并发运行 `claw search --query` 和 `claw search index --refresh`
- 如果并发路径在新 ONNX 上触发 `system error number 13`，稳定恢复路径是串行重跑 `claw search index --refresh`，并显式使用 `CLAW_EMBEDDING_LOCAL_DEVICE=cpu`

## Consequences

- 本地 ONNX 缓存从“静态文件”变成可恢复的运行时资产，删除后不必手工修复项目配置
- 并发检索与刷新不再被视为安全的默认验证方式，避免把刚重建的模型文件提前打进竞争态
- CPU rescue path 不只是 DirectML 失败时的兜底，也成为 cache rehydration 后的稳定验证通路
- `system error number 13` 被明确归类为这条并发恢复路径上的已知故障信号，而不是模型配置漂移

## Related code

- `.claw/project.json`
- `.claw/models/Snowflake/snowflake-arctic-embed-m-v2.0`
- `packages/core/src/embedding-worker.ts`
- `packages/core/src/embedding-local.ts`
- `packages/core/src/memory.ts`
- `.claw/archive/tasks/Refresh-local-embedding-ONNX-cache/plan.json`

## Search Terms

- `Refresh-local-embedding-ONNX-cache`
- `Snowflake/snowflake-arctic-embed-m-v2.0`
- `.claw/models`
- `system error number 13`
- `CLAW_EMBEDDING_LOCAL_DEVICE=cpu`
- `claw search --query`
- `claw search index --refresh`
