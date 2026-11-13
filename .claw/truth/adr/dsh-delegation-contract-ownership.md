# ADR: DSH delegation mechanics are adapter-owned

## Context

Earlier mapping placed native job/continuable/Team distinctions in role skill references. The owner subsequently required automatic capability-based routing and moving all safely automatable coordination into the adapter. Reusing a role must not reuse a previous assignment, claim, material set or result.

## Decision

- Shared researcher/feature-architecture packages retain role semantics and narrow output contracts. DSH exposes delegate.start/result/complete; the model does not choose a backend, enumerate members or implement queue/recovery rules.
- DSH 0.2.2-rc.2 removed teammate creation, messaging and the member roster from `agentTeams`; the service now owns shared task boards only. All roles therefore run on the `subagents` family. The adapter sends a flattened activation request (top-level `parent`, `prompt`, `agentOptions`, `childId`, `name`) with explicit `delivery: "caller"` and `signal`, and delivers follow-up work through `sendMessage(sender, targetId, content, { signal })`. Host `subagents` business methods own real authorization and parameter rejection; exact tool/provider schemas, task closure, model metadata and UI/plugin inventory are not adapter shadow permissions. Exact Lead/child identity remains mandatory.
- DSH owns children and transport; adapter owns role orchestration; Core owns canonical plan/job/claim facts. Team tasks are not a mirror of the claw plan. No cross-Team/project-global role pool is introduced.
- Foreground invocation receipts are adapter-private operational data. They use the host user runtime directory, not unsupported DSH Session event types, package/source copies, or a new roster database. Unknown delivery stays pinned; API acceptance and inactive membership do not prove work completion. Role identity is based on stable parent/workspace/role/carrier facts, not Team description or soft model observations. Unique existing roles may be reused with an explicit `reuse-existing/unknown` selection receipt, and reuse requires the exact durable child id, label and `mode: "continuable"` in the parent catalog. The published `0.2.72-rc.2` adapter still carried the rc.1 Team assumptions and could not admit role work on rc.2.
- Automatic finalizer role creation/reuse, delivery and wakeup remain adapter-owned. Stable labels identify roles, but the Host mints durable child session IDs; the adapter must not derive and reuse an ID after catalog release. New work selects the first compatible role in Host catalog order only after canonical joint-terminal reconciliation; duplicate legacy labels are recovered without deleting or creating members. Existing reservations retain their exact child ID, and a missing pinned child never authorizes replacement. Each job has a full unique delegate identity and exact claim association; both job and delegate must end before release. Proven release is retained across delegate-file cleanup. Service views and catalogs support route choice/recovery but do not authorize delivery. The adapter acquires the current business method before the durable attempted marker, then performs exactly one send with no intervening fresh/catalog/model gate; only a real send/ack failure becomes unknown. Structured Host rejection codes and operation phase are retained through bounded diagnostics; sensitive text is redacted, but actionable errors are not collapsed to a generic catch-all.
- Report registration is guarded against the original parent plan inside the serialized CLI command. A changed focus defers registration; no automatic focus switch or unguarded replay is allowed.

## Alternatives

Keeping backend choreography in model-facing skills is superseded for DSH. Retaining role semantics in shared packages is not superseded. Reusing arbitrary labels, a global role database, or worker inactivity as completion is rejected. A tiny invocation receipt store is necessary because the installed Host rejects unregistered required Session events; writing custom chat records would corrupt persistence compatibility.

## Consequences

门禁按事实影响分层：权限/canonical owner/claim-delivery identity/发送后 unknown 属于硬失败；Service、roster、catalog、history 的只读瞬态错误只允许同 operation 内一次立即重读，随后 deferred；description、非目标 diagnostic、展示字段、软偏好和未知扩展 metadata 降级继续。禁止 sleep、无限重试、跨 route 重发或第二套状态机。

模型与 reasoning effort 是按角色解释的尽力偏好，而非 admission 资格门禁：feature-architect 倾向高能力/high，researcher 直接继承 caller，background finalizer 倾向低成本；目录、options 或精确 effort 不可用时使用受支持的 inherit/default/替代 recipe，并诚实记录 requested/applied/resolved-or-unknown。rc.2 起所有角色统一走 `subagents` 家族（前台与新 finalizer 一致）；不再有 Team 成员授权分支。权限、capture、claim、身份和投递保护仍是硬合同。已 admitted 或投递未知的执行不因偏好变化迁移或重发；旧 one-shot/Team 记录保留原身份，Team 记录不被改写为其他身份恢复。Source/integration tests 不是运行 profile 已加载新 artifact 的证据。

## Owners and evidence

- [DSH delegation behavior](<../features/dsh-subagent-delegation-contract.md>) owns the operational contract.
- [Shared source ownership](<../features/shared-planning-skill-source.md>) owns distribution and canonical skill location.
- [Adapter entry](<../../../packages/dsh-adapter/src/index.ts>), [carrier admission](<../../../packages/dsh-adapter/src/team-capability.ts>), [activation adapter](<../../../packages/dsh-adapter/src/native-start.ts>), [foreground façade](<../../../packages/dsh-adapter/src/delegation.ts>) and [receipt storage](<../../../packages/dsh-adapter/src/delegation-receipts.ts>).
- [Canonical execution association](<../../../packages/core/src/knowledge-sidecar.ts>) and [guarded command service](<../../../packages/cli/src/command-service.ts>).

<!-- state: history -->
## Decision evolution

<!-- dated: 2026-11-13 -->
### rc.2 removes Team as a role carrier

DSH 0.2.2-rc.2 deleted `spawnTeammate`/`listMembers`/`tryMembership`/`sendMessage` from `agentTeams` and flattened `startActivation` with required `delivery`/`signal`. The adapter's Team branch and its `tryMembership` parent resolution are removed; role receipts that recorded `backend: "team"` are rejected rather than re-identified under another carrier. Evidence: published `@deepseek-ai/dsh-*@0.2.2-rc.2` sources (`dsh-agent-team/src/index.ts`, `dsh-subagent/src/types.ts`, `dsh-tool-agent-team/src/index.ts`).

<!-- dated: 2026-10-02 -->
### Move mechanics, not role meaning, into the adapter

The new source path replaces skill-level backend selection with semantic operations. It does not imply a published release or live activation. Private receipts, full job identities and parent-focus guards protect recovery without creating a second business truth.

<!-- dated: 2026-10-01 -->
### Correct fixed continuable assumptions

The earlier unification removed adapter-local skill copies and corrected native job versus continuable versus Team handles. Its source-ownership and narrow-context rationale remains valid; its decision to leave DSH mechanical dispatch in role references has now been superseded.
