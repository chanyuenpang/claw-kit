# Local claw CLI

## Status

Accepted working truth for local development on this machine.

## Core facts

- `claw init` now exists and bootstraps a minimal `.claw` project.
- `packages/core/src/init.ts` 的 `initProject()` 现在还会在初始化完成后检查项目根目录 `.gitignore`，当缺少 claw-kit 专用规则块时只追加一次：
  `# claw-kit`
  `.claw/*`
  `!.claw/project.json`
  `!.claw/truth/`
  `!.claw/truth/**`
- 这条 `.gitignore` 变更被明确限制在 `initProject()`；`project-check` / protocol repair 与 `claw context` 不负责修改 `.gitignore`。
- 重复执行 `claw init` 不会重复追加同一规则块；已有 `.gitignore` 只会在缺块时补一次。
- The local CLI command surface includes:
  - `claw init`
  - `claw context`
  - `claw search`
  - `claw search index --refresh`
  - `claw plan write`
  - `claw plan edit`
  - `claw switch-task`
  - `claw memory index/search/get` for legacy/debug and low-level index management
  - `claw truth ingest`
- Codex-facing recall should use `claw search --query "<topic>"` as project-scoped document recall for project memory, truth, ADR, and external docs; it is not code search.
- `claw search index --refresh` is the explicit project index refresh entrypoint and returns `search.index.refresh`.
- `claw search index --refresh` 现在会对当前项目的 markdown recall index 做增量同步，而不是每次都全量重建 sqlite store。
- 未变更文档会复用既有 sqlite rows 与 embeddings；变更文档只替换自身 `docs` / `docs_fts` / `doc_embeddings` 记录并重算 embeddings；删除文档会被清理。
- 对于已经存在 `docs` 记录但缺少 `doc_embeddings` 的旧数据，`packages/core/src/memory.ts` 里的 `syncProjectMemoryIndex` 会在 `insertDocs` 后再用 `listDocsMissingEmbeddings(db)` + `indexDocEmbeddings` 补齐向量，避免 refresh 只看见 docs 行就误报完成。
- `memory.embedding` 配置变更时，`claw search index --refresh` 会重建全部向量，保证 project search metadata 一致。
- 即使 `memory.embedding` 配置变化触发向量重建，`packages/core/src/memory.ts` 的 `syncProjectMemoryIndex()` 仍然保持单次 bounded batching：默认每轮最多处理 100 个文件，不会因为 reset 路径而绕过限流整库重建。
- 这意味着 embedding 配置变化后的重建过程中，单次 refresh 可能暂时只保留当前批次写入的 docs/vector 状态；后续 refresh 会继续补完剩余文件，而不是在一次模型切换后直接处理整个项目。
- `claw search index --refresh` now builds project-scoped vector data from `memory.embedding` and records `vectorIndex` metadata in the project index.
- When `memory.embedding.provider` is `local`, the CLI follows the GitNexus-style embedding setup with default model `Snowflake/snowflake-arctic-embed-m-v2.0`, model-derived default dimensions, and Windows DirectML-to-CPU fallback.
- 默认 local 维度现在按模型决定：`Snowflake/snowflake-arctic-embed-m-v2.0` 默认 `768`，显式旧模型 `Snowflake/snowflake-arctic-embed-xs` 继续默认 `384`；显式 `memory.embedding.outputDimensionality` 仍然优先覆盖默认值。
- 本地 embedding 的救援路径现在有两个显式控制面：`.claw/project.json` 的 `memory.embedding.local.device` 和 shell 覆盖 `CLAW_EMBEDDING_LOCAL_DEVICE`，前者适合稳定的 per-project 配置，后者适合一次性 CPU rescue refresh。
- 真实验证表明，`CLAW_EMBEDDING_LOCAL_DEVICE=cpu; claw search index --refresh` 可以完成 local rescue refresh，并产出 project-scoped vector metadata；默认模型路径的 `dimensions` 现在是 `768`，而显式旧模型 `Snowflake/snowflake-arctic-embed-xs` 仍然保持 `384`。
- `packages/core/test/core.test.ts` 锁定了默认 refresh 的文件批次节流：每次 refresh 最多处理 100 个新增或变更文件，后续重复 refresh 会自动继续消化剩余 backlog，而不会卡在单次调用边界。
- `packages/core/test/core.test.ts` 现在额外覆盖 embedding 配置变化后的 batching 契约：完成一次 103 文件索引后切换 embedding model，reset 后第一轮 refresh 仍只处理 100 个文件，第二轮再补完剩余 3 个。
- `packages/core/test/core.test.ts` 现在覆盖了 `.gitignore` 注入的三条 init 语义：新项目生成规则块、已有 `.gitignore` 只追加一次、重复 init 不重复追加。
- `packages/core/test/embedding-local.test.ts` 锁定了 worker 侧推理 batching：大文本集合会被拆进多次 extractor 调用，但输出顺序保持稳定。
- `packages/core/src/embedding-local.ts` 现在在单个 worker/model session 内按固定批次推进本地推理，而不是把完整文本集一次性塞给单个 ONNX 调用；这个默认 batch size 由 `DEFAULT_LOCAL_EMBEDDING_BATCH_SIZE` 控制，属于内部实现细节，不暴露成用户配置面，而 `packages/core/src/memory.ts` 的 `DEFAULT_PROJECT_REFRESH_FILE_LIMIT = 100` 仍然是单独的 per-refresh 文件上限。
- `packages/core/src/embedding-worker.ts` 改为把 embedding 结果写入临时文件，只通过 stdout 返回轻量元数据，从而避开巨型 JSON IPC；`packages/core/src/memory.ts` 负责读取该临时文件并清理它。
- `packages/core/src/memory.ts` 的 project refresh 现在走单事务路径：先同步 docs，再插入本轮限流后的文档，随后执行 `indexDocEmbeddings(...)`，最后才 `COMMIT`；只要 embedding 失败，整次 refresh 就会 `ROLLBACK`，不会留下半写状态。
- `indexDocEmbeddings(...)` 会先用 `chunkMarkdownContent(content)` 把文档拆成段落 chunk，再把每个 chunk 原文送进 embedding worker；当前路径没有额外的 token-length cap。
- `packages/core/src/embedding-local.ts` 只负责每 4 条文本一批地喂给 extractor，不会在调用前额外做 truncation 或 `max_length` 截断。
- `packages/core/src/embedding-worker.ts` 现在在执行 embedding batch 前先通过 `resolveLocalTokenizerMaxLength(...)` 把 tokenizer 的 `max_length` clamp 到模型真实 positional limit；对 `Snowflake/snowflake-arctic-embed-m-v2.0`，即使 tokenizer 暴露 `model_max_length = 32768`，安全运行上限也应视为 `8192`。
- 这次可复现的 refresh 停滞根因是 local ONNX embedding failure，而不是缺源或 refresh no-op；失败复现批次里 `.claw/truth/SUMMARY.md` 的 chunk 3 被分词到 `19339` tokens，并在 `Snowflake` local model 里触发了 `SkipLayerNormalization`。
- 修复生效后，之前失败的复现路径已经恢复成功；在 `tiny-world` 的真实 `search index --refresh` 中，索引从 `100` docs 前进到 `200` docs，`pendingFileCount` 降到 `217`。
- Windows 下的 `claw plan done` 现在会先把 JSON 结果返回给调用方，再通过外部 launcher 异步启动 `internal-completion-refresh`；不再直接在同一个主 CLI 进程里用 `detached + unref` 后台化 refresh。
- `packages/cli/src/cli.ts` 里的 completion refresh status file 现在会显式经历 `queued` / `running` / `finished` 生命周期；如果 refresh 失败，失败 payload 仍写回同一个 status file。
- `packages/core/src/memory.ts` 现在给 `embedding-worker.js` 加了默认 30 分钟硬超时，并把 `timedOut` / `timeoutMs` 写进失败细节，避免异步 refresh 因 embedding 子进程无限挂起而长期占住 sqlite lock。
- 在 NeonSpark 的真实重测里，最初失败点先从 DirectML gating 收敛到过大的 embedding 输入张量（`33737 x 512`，请求分配约 `26.5 GB`），随后又暴露出 stdout 巨型 vector JSON；最终通过临时文件回传结果把这条链路打通。
- 该重测最后确认 `claw search index --refresh` 可以在大项目上成功完成，并产出 `indexedCount: 698` 与 `vectorIndex.chunkCount: 33737`。
- 用户面文档现在把默认的 `100` 文件分片推进和 `cpu` rescue path 讲清楚了，但没有暴露新的 CLI 参数。
- `packages/core/test/core.test.ts` 新增了中文排序回归：`project search prioritizes exact Chinese document hits over weaker project-memory matches`。
- 使用 `CLAW_EMBEDDING_MOCK` 的 project-search / memory-refresh 测试现在显式标记为 `{ concurrency: false }`，避免 Node test 并发下共享环境变量污染造成假红。
- Project-level `claw search --query` now generates a real query embedding and uses a trimmed hybrid recall that fuses vector and FTS results.
- Project-level `claw search --query` now fails with `MEMORY_VECTOR_INDEX_REQUIRED` when the refreshed vector index is missing, instead of silently degrading to non-vector search.
- Task-scope memory search still keeps the previous FTS and task-memory behavior.
- Before writing a new plan, agents may run `claw search --query "<topic>"` to recover relevant project context.
- `claw memory ...` remains available, but it is not the recommended Codex workflow concept.
- Local installation is currently done through `npm link .\\packages\\cli`.
- On this machine, the global wrappers are created under `C:\\nvm4w\\nodejs`.
- 远程 Windows 机器应该优先使用 `scripts/install-cli.ps1`：脚本会执行 `npm install`、`npm run build`，移除旧的全局链接，然后用 `npm link --force .\\packages\\cli` 重新链接 CLI。
- 根目录 `README.md` 已把远程用户导向这个安装脚本，而不是要求他们手工拼装安装步骤。

## Practical implications

- `claw` can now be used as a normal shell command during local development.
- 在 Windows 上，`claw plan done` 的 stdout JSON 契约和异步 completion refresh 现在可以同时成立；调用方不需要在“及时拿到 JSON”和“后台继续索引”之间二选一。
- New projects do not need manual `.claw` scaffolding before they can enter the harness flow.
- Workflow docs and skills should say `claw search`, not OpenClaw-style "memory search", when explaining recall to Codex agents.
- Code investigation should still go through `researcher` plus GitNexus, not `claw search`.
- The hybrid project search contract is influenced by `openclaw-dev`, but only the smallest subset needed for `claw-kit` was brought over.
- incremental refresh 的 sync 语义同样参考 `openclaw-dev`，但这里只保留了适合 `claw-kit` 的裁剪式 sqlite 增量行为。
- README、`packages/cli/README.md` 与 `packages/core/test/core.test.ts` 已说明并覆盖这套 refresh 合同。
