# Project Memory Refresh Fallback

## 结论

- `packages/core/src/memory.ts` 里的 project memory refresh 现在会在 embedding 生成失败时退化为 text-only indexing，而不是让整个 refresh 失败。
- 这次真实故障里出现过 `Memory embedding generation failed` 和 `fetch failed`，触发条件是本地 embedding setup 不可用或 vectors 还没准备好。
- 这个降级只影响 refresh；project-level `claw search --query <topic>` 仍然要求 refreshed vector index，缺失时继续返回 `MEMORY_VECTOR_INDEX_REQUIRED`。

## 长期行为

- 先刷新索引、再查项目记忆的流程中，refresh 负责把文本索引推进到可用状态；如果 embeddings 失败，至少保住 text-only recall 面。
- query 侧不接受 silent fallback 到纯 FTS；search 依然保持 vector-required contract。
- 当 lockfile pull 后本地依赖不同步时，先补 `npm install` 再判定 refresh/search 回归是否真实存在；这次曾因为 `@huggingface/transformers` 未安装而先失败。

## 相关代码

- 主实现入口：`packages/core/src/memory.ts`
- query 契约仍由 `packages/core/src/memory.ts` 和 `packages/cli/src/cli.ts` 共同暴露为 `MEMORY_VECTOR_INDEX_REQUIRED`

## 验证锚点

- `npm test` 通过。
- `npm run check` 通过。
- `claw plan done` 的 completion refresh 重新可用。
- 未刷新 vector index 时，`claw search --query` 仍然返回 `MEMORY_VECTOR_INDEX_REQUIRED`。