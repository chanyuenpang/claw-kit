# ADR: Adapter-owned report collection

## Context

`knowledge claim` 曾在 CLI 中分别解释 Codex transcript、DSH `dsh-capture` 和
Cindy SQLite/stdin handoff，使通用 plan、job、claim 与 canonical report lifecycle
同各 Host 的私有历史格式和发布节奏耦合。协调迁移已经把这条边界收敛为 adapter-owned
collector contract v1；当前实现事实由
`../features/adapter-owned-report-collection.md` 拥有，Host-specific Truth 只保留各自的
历史定位、完整性和 payload 语义。

## Decision

- 每个 Host adapter 拥有其 Host history 的定位、解析、真实 turn final 判定和 report payload 形态。Codex/Cindy 保留版本化 collector process；DSH Desktop 在父会话终态或 queued 恢复入口使用当前 Host 的受信 `sessionQuery` 自动采集，通过私有 CLI stdin 提交规范 final 事件，不持久保存可执行 collector descriptor。Core/CLI 不解释 Host message DTO；DSH CLI 仅对已规范化的报告行去重并保留既有 task conclusions。
- Codex/Cindy collector 仅向 CLI 指定的 staging report 路径写 opaque payload。DSH live adapter 经私有 stdin 向当前 CLI 进程提交已证明的 final 事件，由 CLI 在 plan.report 同目录完成暂存和原子发布。stdout、daemon JSON 与诊断不传递采集内容；adapter 不直接写 canonical report、knowledge job、claim token、Truth 或 ADR。
- Core/CLI 继续拥有 canonical plan/report 路径、固定 staging containment、collector contract
  version、payload byte length/SHA-256 receipt、同目录原子发布、claim token 与最终化 lifecycle。
- Codex/Cindy collector exit code 是 completeness 的 Host-owned 证明。DSH 的父会话历史读取成功但无可信 `assistant/final` 时，空 payload 仍发布真实 capture receipt；Host 历史不可读、规范化失败或 CLI 发布失败则保持 job queued、无 token 并报告原因，绝不伪造 final_answer。
- Codex/Cindy 的 collector contract v1 与描述符不变。DSH Desktop 改用当前插件宿主的受信父会话采集和版本化 CLI 回执；既有项目级 `dsh.json` 即使指向旧 web 包也不执行、不隐式回退。没有 live capture receipt 时禁止 DSH writer claim。

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

- CLI 不再知道 Codex transcript records、DSH event/cache 或 Cindy SQLite rows；adapter 可独立演进其 Host history parser。DSH 的规范 final 事件只通过私有 stdin 交付，CLI 不持久化 adapter 安装路径。
- DSH writer 的 token 仅在父端已发布可信 capture receipt 后由 Core 原子 claim 签发；Codex/Cindy 沿用 collector 成功与 staging 校验。任一采集失败不回滚已成功的 plan mutation，DSH job 保持 queued，不能靠模型重试。
- DSH 的可恢复采集与派发错误只把有界 phase/code/correlation/count 存于 Core job，父会话即时回执和后续 context 展示安全摘要；异步子代理结束但无规范终态时只报警、不替模型写失败或重排队。报告、token、原始异常及绝对路径不进入告警。
- 通用测试覆盖可信父会话、report 行去重和摘要、空 final、失败保持 queued、原子发布、告警去重与未知 claim 同子代理回执；Host-specific tests 验证多 turn 与真实终态来源。
