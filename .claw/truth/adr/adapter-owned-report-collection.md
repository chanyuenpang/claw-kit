# ADR: Adapter-owned report collection

## Context

`knowledge claim` 目前在 CLI 中分别解释 Codex transcript、DSH
`dsh-capture` 和 Cindy SQLite/stdin handoff。这让通用 plan、job、claim 与
canonical report lifecycle 同各 Host 的私有历史格式和发布节奏耦合。现有
`.claw/truth/features/codex-knowledge-capture-boundary.md` 与
`.claw/truth/features/dsh-knowledge-dispatch-and-finalization.md` 仍准确描述
已交付的当前路径；本 ADR 不把此处的目标架构表述为当前实现。

## Decision

- 每个 Host adapter 拥有其 Host history 的定位、解析、真实 turn final 判定和
  capture-completeness 判断，并以已注册、版本化的 collector process 提供能力。
- collector 只向 CLI 指定的 staging report 路径写入统一 JSONL contract；stdout
  不传递采集内容，adapter 不直接写 plan、knowledge job、claim token、Truth 或 ADR。
- Core/CLI 继续拥有 canonical plan/report 路径、staging validation、containment、
  lock、event-id merge、原子发布、capture receipt、claim token 与最终化 lifecycle。
- conversational final 按 `(occurredAt, hostSequence, eventId)` 稳定排序。空 capture
  仅在 manifest 证明 capture window 已关闭且 eventCount 为零时成功；history 不可用
  必须保持可观察、可重试失败。
- 这是一次协调的破坏性迁移：CLI 与 Codex、DSH、Cindy adapters 同步切换到
  collector contract v1，删除 CLI host parsers、Cindy stdin handoff、legacy
  `task_conclusion` 新生产路径和 null-host 推测；未升级 adapter 显式失败，绝不回退。

实施前的设计与验收切片记录在
`docs/feature-architecture/2026-08-22-1319-Host-Adapter自有Report收集接口重整.md`。

## Alternatives

- CLI 静态依赖或动态 import adapter：拒绝，仍会把 Host history schema 与 adapter
  发布节奏耦合到 CLI。
- adapter 经 stdin/stdout 回传 normalized DTO：拒绝，仍引入 payload、partial stream
  和 Host 格式演进边界；report 文件已是稳定交付物。
- adapter 直接写 canonical `plan.report`：拒绝，会复制 Core 的 containment、lock、
  merge 和 lifecycle 语义。
- 仅把 CLI parser 拆文件或只依赖每轮 hook append：拒绝，前者不改变 owner，后者不能
  补偿 hook 的遗漏、延迟或重试。

## Consequences

- CLI 不再知道 Codex transcript records、DSH event/cache 或 Cindy SQLite rows；adapter
  可独立演进其 parser，只需持续符合 report contract。
- claim 只在 collector 发布完整 snapshot、Core 持久化 receipt 后签发 token；失败不回滚
  已成功的 plan mutation，也不伪造空 report。
- 迁移完成前，现有 Truth 继续拥有实际运行行为。本 ADR 是 accepted architecture，
  不是实现完成或真实 Host E2E 的证明。
- 实施需要通用 contract fixtures，以及每个 Host 对多 turn、terminal final、owner
  boundary、重试、不可用 history 和幂等 collector 的真实验证。
