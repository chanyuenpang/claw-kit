# ADR: Adapter-owned report collection

## Context

`knowledge claim` 曾在 CLI 中分别解释 Codex transcript、DSH `dsh-capture` 和
Cindy SQLite/stdin handoff，使通用 plan、job、claim 与 canonical report lifecycle
同各 Host 的私有历史格式和发布节奏耦合。协调迁移已经把这条边界收敛为 adapter-owned
collector contract v1；当前实现事实由
`../features/adapter-owned-report-collection.md` 拥有，Host-specific Truth 只保留各自的
历史定位、完整性和 payload 语义。

## Decision

- 每个 Host adapter 拥有其 Host history 的定位、解析、真实 turn final 判定、
  capture-completeness 判断和 report payload 形态，并以已注册、版本化的 collector
  process 提供能力。Core/CLI 不解释 Host message DTO，也不统一排序或 merge payload。
- collector 只向 CLI 指定的 staging report 路径写入 adapter-owned opaque payload；stdout
  不传递采集内容，adapter 不直接写 plan、knowledge job、claim token、Truth 或 ADR。
- Core/CLI 继续拥有 canonical plan/report 路径、固定 staging containment、collector contract
  version、payload byte length/SHA-256 receipt、同目录原子发布、claim token 与最终化 lifecycle。
- collector exit code 是 completeness 的 Host-owned 证明。空 payload 可以成功，但仍必须生成
  相同的 capture receipt；history 不可用必须由 collector 返回失败并保持 job queued。
- 这是一次协调的破坏性迁移：CLI 与 Codex、DSH、Cindy adapters 同步切换到
  collector contract v1。descriptor 和 request 都显式携带 contract version；未升级
  adapter 显式失败，绝不回退。

实施前的设计与验收切片记录在
`docs/feature-architecture/2026-08-22-1319-Host-Adapter自有Report收集接口重整.md`。

## Alternatives

- CLI 静态依赖或动态 import adapter：拒绝，仍会把 Host history schema 与 adapter
  发布节奏耦合到 CLI。
- adapter 经 stdin/stdout 回传 normalized DTO 或统一 event schema：拒绝，仍引入 payload、
  partial stream 和 Host 格式演进边界；report 文件已是稳定交付物。
- adapter 直接写 canonical `plan.report`：拒绝，会复制 Core 的 containment、lock、
  merge 和 lifecycle 语义。
- 仅把 CLI parser 拆文件或只依赖每轮 hook append：拒绝，前者不改变 owner，后者不能
  补偿 hook 的遗漏、延迟或重试。

## Consequences

- CLI 不再知道 Codex transcript records、DSH event/cache 或 Cindy SQLite rows；adapter
  可独立演进其 parser 和 report payload，只需持续符合 process/receipt contract。
- claim 只在 collector 成功退出、CLI 校验 staging 是普通文件、计算 receipt 并原子发布后
  签发 token；失败不回滚已成功的 plan mutation，job 保持 queued。
- 通用测试只断言 contract version、opaque bytes/digest、空 payload、失败保持 queued 与
  atomic publish；Host-specific tests 独立验证多 turn、terminal final 和 owner boundary。
