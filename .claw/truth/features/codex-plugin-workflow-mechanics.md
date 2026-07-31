# Codex plugin workflow mechanics

## Status

Current

## Core facts

- `using-claw-kit` 的可见入口合同是 positive 且 entry-owned：第一句先让不预期产生可复用项目知识的请求跳过该 skill 并直接工作；其余请求进入 `First Action`，默认运行 `claw plan create "<title>"`。只有 template-backed workflow skill 完整承载请求时，才改为跟随该 skill 自己的 entry route，由已加载 skill 解析其目录并通过 `--template-file "<skill-dir>/TEMPLATE.json"` 提供精确模板来源；裸 `--template <id>` 只属于兼容发现面，通用所有权见 `.claw/truth/features/template-guidance-routing.md`。
- Codex 与 OpenCode 的 `First Action` 在创建 plan 后把返回的 `workflowGuidance` 作为唯一 lifecycle contract，并用 stage 与 current task 判断当前工作；`commandHints` 只作为命令查找辅助，不是 required next mutations。入口不重建 recovery、context、search 或完整后续 lifecycle 路由；新 plan 从 `process.discussing` 开始。
- `planning` 仍然是可见的 plan-entry skill，但它是由 `claw plan create` 之后种下的 planning task 调起的，不应该被插件 manifest 或 startup prompt 预读成前置工作流步骤。
- Codex plugin manifest 的 `defaultPrompt` 只保留一条合并后的 session-entry 指令，统一指向 `using-claw-kit`、recovered `workflowGuidance`、project-plan admission 与固定 driver；不得用多条重复的 `Start with` 形成彼此竞争的入口。
- 不预期产生可复用知识的请求在 `using-claw-kit` 入口处直接工作；入口 skill 不为已删除的 route 增加反向提示，也不复制 SessionStart、recall 或具体任务合同。
- `process.discussing` 表示执行暂停并转入用户讨论，可以稳定跨轮次停留，也可以从 `process.active` 重新进入；plan 存在、方案已可执行或返回了 command hints 都不构成自动推进 lifecycle 的理由。
- Default Task 1 先区分 action instruction 与 open-ended discussion，再用 effective planning skill 澄清 requirements 并准备 task list。用户已指定 solution，或既有 workflow / 证据充分确定路线时可以继续；采用另一条 solution 前必须让用户看到 decision-relevant content，并只在它引入 meaningful choice 时等待回应。
- `planning` 负责需求澄清、任务拆分和 plan 质量；`using-claw-kit` 负责 claw runtime 路由、状态切换和 goal mode。知识治理内容与 lifecycle 由 `codex-knowledge-capture-boundary.md` 拥有；`using-claw-kit` 只在 Codex `subagent` policy 的终态 mutation 返回 `knowledgeDispatch` 时启动 fresh executor 并立即让出回合。
- `researcher` 与普通项目 recall 的当前角色边界由 `.claw/truth/features/codex-subagent-reuse.md` 拥有，本文不重复其触发、派发或复用合同。knowledge executor 不是可复用 specialist，也不是用户可调用 skill；主 agent 不读取治理材料、不执行 assignments、不等待 executor。
- `direct` 仍然只是一个隐藏的兼容命令，不应被提升成公开 workflow 概念；不预期产生可复用项目知识的请求由 host 直接工作，而不是先进入 planning / default plan-create。
- 正常线程回复不主动暴露 claw harness mechanics；只有用户询问，或解释 blocker / result 确有必要时才说明这些内部机制。
- When retargeting installed converted skill templates between plugin surfaces, clear competing global templates and duplicate cache copies first so skill-local template resolution sees only one matching source.
- Codex `update` skill 只校验公开插件 surface 与 Core 内部 writer 资源的正确分层：分发包不得出现可发现的 `delegate-writer` / `knowledge-writer` skills，不要求或寻找已移除的公开 `knowledge-writer`。
- published-source Codex 安装先用 `git ls-remote` 把请求 ref（默认 `main`）解析为一个 40 字符 commit SHA，再 fetch 该不可变 commit 并 detached checkout；后续安装不得在同一事务中继续追踪可变 ref。
- bundle/cache 写入拒绝 payload symlink，复制后校验 manifest、hooks 和逐文件 SHA-256。新 payload 先在目标同级 staging directory 完整构建与验证，再以 rename 原子替换；激活中断时恢复旧 cache，并清理 staging/backup 残留。

## Implications

- 未来的 workflow 文案应该继续把 `claw plan create` 作为正式 claw workflow 的唯一正常 task-scope 入口，而不是在 startup surface 上并列多个入口；但同时要保留“不预期产生可复用知识的请求可在入口处不进入该流程”的边界说明。
- SessionStart 与 host hook 独立拥有 prompt 注入和运行时恢复；`using-claw-kit` 的默认 `First Action` 不检查或复制 prompt-injected guidance，创建 plan 后只继续 CLI 实际返回的 `workflowGuidance`。
- 插件入口文案、update skill 和安装器必须共同保持一套自包含 surface：入口不重复，内部 writer 不外露，安装输入固定到一个已解析 commit，且失败不能留下部分激活的 cache。
- specialist 语义应保持稳定：planning 负责把任务想清楚；researcher 的当前边界由 `.claw/truth/features/codex-subagent-reuse.md` 拥有；knowledge finalization 的治理与任务编排保持在内部 delegate workflow，Codex 主线程最多承担结构化 launcher dispatch。
- 当需要解释轻量路径时，应该强调它是 `using-claw-kit` 的入口门禁结果，而不是新的用户可见 workflow 层级；`direct` 只保留为兼容性分支。

## Evidence

- `packages/codex-adapter/skills/using-claw-kit/SKILL.md`
- `packages/opencode-adapter/skills/using-claw-kit/SKILL.md`
- `packages/codex-adapter/.codex-plugin/plugin.json`
- `shared/skills/planning/SKILL.md`
- `packages/core/resources/delegate-writer/TEMPLATE.json`
- `packages/core/resources/knowledge-writer/`
- `packages/codex-adapter/skills/researcher/SKILL.md`
- `packages/opencode-adapter/agents/claw-knowledge-writer.md`
- `packages/opencode-adapter/agents/claw-researcher.md`
- `packages/core/src/templates/plans/default.ts`
- `packages/core/test/core.test.ts`
- `packages/cli/test/cli.test.ts`
- `scripts/codex-plugin-bundle.test.mjs`
- `scripts/install-codex-plugin.ps1`
- `scripts/codex-plugin-bundle.mjs`
- `.claw/truth/adr/using-claw-kit-session-entry.md`
