# Brainstorming Skill Template Contract

## 状态

这是 `packages/codex-adapter/skills/brainstorming/` 在通过真实 `create-claw-skill` 流程重做后的稳定事实，适合作为后续同类设计型 skill 转换的约束锚点。

## 结论

- `packages/codex-adapter/skills/brainstorming/SKILL.md` 里的可见模板必须承载真实控制流门槛，不能把绝大多数流程隐藏进 fallback prose。
- 对 `brainstorming` 来说，`decomposition choice`、`design approval`、`written-spec review` 和 `writing-plans` handoff 都需要在模板里显式成型，而不是只靠自然语言暗示。
- `visual-companion.md`、`spec-document-reviewer-prompt.md`、`CLAW-KNOWLEDGE.md`、`CONTENT-COVERAGE.md` 和 `SUPERPOWERS-FALLBACK.md` 都应继续作为 package-local 的一等引用保留，而不是当作可丢弃的 incidental copies。
- `scripts/frame-template.html`、`scripts/helper.js`、`scripts/server.cjs`、`scripts/start-server.sh`、`scripts/stop-server.sh` 和 `agents/openai.yaml` 这类运行时资产同样属于 skill package 的正式组成部分，不能被当成可随手复制或半文档化的附属物。
- `visual-companion` 分支如果只留下半成品说明而没有完整 task 结构，就会持续成为 residual-risk area；它要么被完整 task-encoded，要么就不该以模糊文案形式保留在模板里。

## 长期行为 / 规则

- `brainstorming` 的职责不是“先聊一会儿再说”，而是先把设计门槛、审阅门槛和实施交接门槛固化到模板结构里。
- 任何后续改动都应保持 one-question-at-a-time 的节奏，以及 `visual-companion.md` 里定义的终端 / 浏览器分流。
- helper assets 的位置和角色应该在 skill package 内保持稳定，不能被降级成只在 fallback 里顺带提到的附属材料。

## 关联代码

- `packages/codex-adapter/skills/brainstorming/SKILL.md`
- `packages/codex-adapter/skills/brainstorming/visual-companion.md`
- `packages/codex-adapter/skills/brainstorming/spec-document-reviewer-prompt.md`
- `packages/codex-adapter/skills/brainstorming/CLAW-KNOWLEDGE.md`
- `packages/codex-adapter/skills/brainstorming/CONTENT-COVERAGE.md`
- `packages/codex-adapter/skills/brainstorming/SUPERPOWERS-FALLBACK.md`
- `packages/codex-adapter/skills/brainstorming/scripts/frame-template.html`
- `packages/codex-adapter/skills/brainstorming/scripts/helper.js`
- `packages/codex-adapter/skills/brainstorming/scripts/server.cjs`
- `packages/codex-adapter/skills/brainstorming/scripts/start-server.sh`
- `packages/codex-adapter/skills/brainstorming/scripts/stop-server.sh`
- `packages/codex-adapter/skills/brainstorming/agents/openai.yaml`
- `packages/codex-adapter/skills/brainstorming/TEMPLATE.json`
- `superpowers/skills/brainstorming/SKILL.md`
- `superpowers/skills/brainstorming/visual-companion.md`
- `superpowers/skills/brainstorming/spec-document-reviewer-prompt.md`

## 关键检索词

- `brainstorming`
- `create-claw-skill`
- `visual-companion`
- `spec-document-reviewer-prompt`
- `writing-plans`
- `task-encoded`
