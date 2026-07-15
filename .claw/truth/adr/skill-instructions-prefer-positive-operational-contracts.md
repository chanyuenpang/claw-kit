# ADR: Skill instructions 优先使用正向操作合同

## Status

Accepted

## Context

Skill 正文如果反复描述错误路径，容易把无关概念植入 agent 上下文并增加心智负担；但安全、授权、数据破坏、职责分工和协议歧义仍需要明确边界。Codex、shared 与 OpenCode 的对应 skill 还必须保持相同行为合同，避免只优化单一 host 的措辞而引入漂移。

## Decision

`claw-kit` 的 skill instructions 采用正向操作合同作为默认写法：

- 先明确角色、输入、执行顺序、选择条件和完成标准，让正确路径成为正文主体。
- 反向限制只保留确有安全、数据保护、授权、职责或协议价值的短边界，不用长篇错误路径清单承担主要指导职责。
- 修改既有 skill 时优先做小幅定点修正，保留原有章节、术语、触发条件与行为合同；先处理高频入口和 writer，再按实际问题扩展范围。
- host-neutral skill 的规范源与 Codex/OpenCode 物化副本必须同步更新并接受现有 bundle、contract、frontmatter 和格式检查。

## Alternatives Considered

- 全量重写所有 skills：拒绝，因为会扩大 review 面并增加无关行为漂移风险。
- 删除所有限制性措辞：拒绝，因为必要的安全、授权和协议边界仍是可执行合同的一部分。

## Consequences

- 高频 skill 更直接地建立 agent 应执行的路径，减少由反复错误示例带来的概念干扰。
- 必要硬边界继续保留，但必须简短、具体并服务于真实风险或合同歧义。
- 后续 wording review 应以定点修正和跨 adapter 一致性为完成边界，不以大规模结构重构作为默认手段。
- 纯措辞优化不得改变 skill 的触发语义、职责所有权或 workflow 行为。

## Related Code

- `packages/codex-adapter/skills/`
- `shared/skills/`
- `packages/opencode-adapter/skills/`
- `.claw/tasks/按正向指令原则-review-claw-kit-插件-skills/plan.json`

## Search Terms

- `positive instructions`
- `positive operational contract`
- `skill wording`
- `角色 输入 顺序 选择条件 完成标准`
- `negative instruction boundary`
- `cross-adapter skill consistency`
