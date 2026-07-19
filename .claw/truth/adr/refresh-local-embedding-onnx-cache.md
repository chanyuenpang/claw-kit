# ADR: Refresh local embedding ONNX cache

## Status

Accepted

## Context

`Refresh-local-embedding-ONNX-cache` 的历史验证确认，本地 ONNX 缓存被删掉或失效时，可以通过真实 search / index refresh 路径重新拉起同一份模型资产，而不需要改动项目 embedding 配置；并发 `search` 与 `search index --refresh` 在 cache rehydration 期间曾触发 `system error number 13`。后续 `jinaai/jina-embeddings-v2-base-zh` 的隔离首次下载进一步收窄了原因：CLI 在 `641,212,851` 字节 ONNX 文件只写入约 `250 MB` 时就尝试创建 session，返回错误后 daemon 仍继续写入；文件完整后同一 FP32 Transformers.js pipeline 立即可以加载并输出 `768` 维向量。由此可知，根因边界是 incomplete-download/load readiness race；并发会放大风险，但不是唯一触发条件。默认切换 closeout 随后通过 terminal request-timeout 语义与更长等待窗口关闭了 rollout readiness gate。

## Decision

采用以下本地模型缓存恢复约束：

- 模型目录是可重建缓存；当前有效 cache 位置和 global/project-local 解析顺序只由 `local-embedding-shared-model-cache.md` 拥有，本 ADR 不再把 `.claw/models` 描述为当前默认位置。
- 目录存在、时间戳变化或目标 ONNX 文件仍在增长都不能判定模型 ready；至少要等下载完成，并以同一 runtime 能成功创建 session 和后续真实检索或刷新成功为准。
- cache rehydration 或首次下载期间不要并发启动多个 search / refresh load；单路首次下载也必须防止 downloader 尚未完成时提前创建 ONNX session。
- 如果未完成或仍在增长的 ONNX 触发 `system error number 13`，不要据此判定模型不兼容或配置漂移。当前稳定恢复路径是让下载完成，再串行运行 `claw search index --refresh`；Windows 恢复可显式使用 `CLAW_EMBEDDING_LOCAL_DEVICE=cpu` 排除设备初始化干扰。
- persistent daemon request timeout 必须作为 terminal model error 向上返回，因为 daemon work 可能仍在继续；不得在 timeout 后并发启动 one-shot fallback 去加载同一份可能尚未完成的 cache。
- daemon request 与外层 embedding worker 的默认 timeout 均为两小时，分别允许 `CLAW_EMBEDDING_DAEMON_REQUEST_TIMEOUT_MS` 与 `CLAW_EMBEDDING_WORKER_TIMEOUT_MS` 显式覆盖；长默认值用于覆盖活动中的首次模型下载，不是无限等待合同。

## Consequences

- 本地 ONNX 缓存是可恢复的运行时资产，删除后不必手工改写项目配置；恢复位置仍服从 shared-cache ADR。
- 下载完成和模型可加载成为两个必须显式区分的状态；仅看目录或部分文件不能形成 readiness 结论。
- CPU rescue path 不只是 DirectML 失败时的兜底，也可在 cache rehydration 后隔离设备因素，但它不能修复未完成文件被提前加载的问题。
- `system error number 13` 在不完整 payload 场景中是 download/load 竞态信号，不是模型不兼容的充分证据；若完整文件仍失败，才需要进入独立的模型或 runtime 诊断。
- timeout 后不再触发 one-shot 竞争加载；调用方会得到带 timeout 时长且说明后台工作可能仍在继续的 terminal error。该约束使 Jina 可以成为 shipped default，同时保留显式 timeout 覆盖和串行恢复路径。

## Related code

- `.claw/project.json`
- `packages/core/src/embedding-defaults.ts`
- `packages/core/src/embedding-daemon-protocol.ts`
- `packages/core/src/embedding-local-runtime.ts`
- `packages/core/src/embedding-worker.ts`
- `packages/core/src/embedding-local.ts`
- `packages/core/src/memory.ts`
- `.claw/archive/tasks/Refresh-local-embedding-ONNX-cache/plan.json`
- `benchmarks/search/0.1.85-model-comparison-jina-v2-base-zh-windows.json`
- `docs/search-model-comparison-results.md`

## Search Terms

- `Refresh-local-embedding-ONNX-cache`
- `Snowflake/snowflake-arctic-embed-m-v2.0`
- `jinaai/jina-embeddings-v2-base-zh`
- `incomplete-download/load readiness race`
- `PersistentEmbeddingRequestTimeoutError`
- `CLAW_EMBEDDING_DAEMON_REQUEST_TIMEOUT_MS`
- `CLAW_EMBEDDING_WORKER_TIMEOUT_MS`
- `system error number 13`
- `CLAW_EMBEDDING_LOCAL_DEVICE=cpu`
- `claw search --query`
- `claw search index --refresh`
