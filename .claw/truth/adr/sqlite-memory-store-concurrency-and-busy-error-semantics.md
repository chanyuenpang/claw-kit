# ADR: SQLite memory store 并发与忙碌错误语义

## Status

Accepted

## Context

`.claw/memory.sqlite` 同时承担 `claw search` 与 `claw search index --refresh` 的读写负载。完成的计划确认了两件需要长期保留的行为：

- search 不应被 claw 自己人为串行化
- index refresh 与 search 同时发生时，应尽量通过 SQLite 自身的等待与并发策略降低冲突，而不是把用户体验退化成裸 `database is locked`

这次验证还确认了一个重要边界：`transformers` missing-module 是真实的依赖解析故障；后续出现的 `database is locked` 不是它的根因，但暴露了 memory store 的并发与错误语义缺口，必须单独修复并稳定下来。

## Decision

- `claw search` 之间保持可并行，不在 claw 层引入额外的人工串行化锁。
- memory SQLite 连接统一设置 `busy timeout`，让短暂的真实竞争尽量由 SQLite 自己等待解决。
- `claw search index --refresh` 的写连接启用 `PRAGMA journal_mode = WAL;`，以降低 refresh 与 search 之间的读写互斥面。
- 如果 SQLite 仍然因为同一份 memory store 被占用而返回 busy/locked，claw 不再直接透出裸 SQLite 错误，而是转换为 `MEMORY_STORE_BUSY`。
- `MEMORY_STORE_BUSY` 必须携带可操作的信息：`storePath`、`operation`、原始 cause，以及“稍后重试”的语义，方便调用方区分 transient contention 和真正的逻辑失败。

## Consequences

- search 的并发行为更符合预期，不会因为实现细节被无谓串行化。
- refresh 与 search 的短暂锁冲突会更多地被 SQLite 自身吸收，减少用户看到的偶发失败。
- 当冲突无法被等待策略化解时，错误会以 claw 自己的可读语义呈现，而不是把内部 SQLite 实现细节直接暴露给用户。
- `transformers` 依赖解析故障与 SQLite 并发占用问题被明确拆分，后续排障时可以分别定位，不再互相污染结论。

## Related Code

- `packages/core/src/memory.ts`
- `packages/core/src/errors.ts`
- `packages/core/test/core.test.ts`

## Search Terms

- `busy timeout`
- `WAL`
- `MEMORY_STORE_BUSY`
- `database is locked`
- `memory.sqlite`
- `claw search index --refresh`
- `storePath`
- `operation`
- `transformers missing-module`
