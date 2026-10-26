# claw-kit OpenClaw 适配器安装流程

本文档说明如何在 OpenClaw 中安装 claw-kit 插件并跑通 `.claw` 项目工作流。

> **注意区分命名**：GitHub 仓库叫 `chanyuenpang/claw-kit`，npm 上的 CLI 包叫 **`@veewo/claw`**（不存在名为 `claw-kit` 的 npm 包）。

## 0. 前置要求

- **OpenClaw** 已安装并正常运行（`openclaw --version`）
- **Node.js ≥ 22.13** 在 `PATH` 上
- 已安装 claw-kit 命令行 CLI：

```bash
npm install -g @veewo/claw
claw --version   # 应显示 0.2.61 或更高
```

## 1. 安装插件

插件以本地路径或打包形式安装：

```bash
openclaw plugins install ./dist/openclaw-plugin
# 或从任意构建目录
openclaw plugins install /path/to/claw-kit/dist/openclaw-plugin
```

安装完成后，重启网关以加载插件钩子：

```bash
# 按 OpenClaw 规范重启（本项目环境使用 supervisor 方式）
python3 -m supervisor.supervisorctl restart openclaw-gateway
```

重启后验证：

```bash
openclaw plugins list | grep claw-kit      # 应显示 loaded
openclaw skills list | grep -E "claw|planning|researcher"   # 7 个 skill 应全部 ready
```

该插件会提供 7 个标准 skill：

`planning` · `config` · `create-claw-skill` · `feature-architecture` · `researcher` · `using-claw-kit` · `claw-kit-doc`

## 2. 初始化项目

进入你的项目目录，初始化 `.claw` 工作流：

```bash
cd /path/to/your-project
claw init
```

`claw init` 会在项目根生成 `AGENTS.md` / `CLAUDE.md` bootstrap 和 `.claw/` 目录（plan / task / truth / ADR 等）。

## 3. 在 AGENTS.md 里补充启动指引（重要）

**请在项目根目录的 `AGENTS.md`（若宿主读取的是 `CLAUDE.md` 则加在 `CLAUDE.md`）中补充以下内容**，确保执行复杂任务时自动加载 claw-kit 工作流：

```markdown
<!-- claw-kit 启动指引：请保留在 AGENTS.md / CLAUDE.md 顶部 -->

## 任务启动规则

执行任务（尤其是复杂、多步骤、或需要沉淀知识的任务）前，
必须先阅读并遵循 `using-claw-kit` 这个技能。

- 开始一个新任务时，**主动加载 `using-claw-kit`**，按其指引用
  `claw context` 恢复当前工作流，再决定是否需要创建计划。
- 涉及多步骤实现、调研或跨会话工作时，优先考虑建立 `claw plan`。
- 不要为每一个简单问题都创建计划，避免过度规划。
```

> 说明：插件注册的 `before_prompt_build` 钩子会自动探测当前工作目录是否为
> `.claw` 项目，并在是的情况下向 agent 注入"加载 `using-claw-kit`"的提醒。
> AGENTS.md 中的静态指引是**双保险**，在钩子未生效（如尚未重启网关）时仍然有效。

## 4. （可选）关闭项目向量记忆

如需关闭 recall / embedding（避免下载大型 embedding 模型），可在项目内：

```bash
claw config get  --layer team --key memory.enabled   # 记录返回的 revision
claw config set  --layer team --key memory.enabled --value false --revision <revision>
```

## 5. 常见问题

- **`Install failed: package.json missing openclaw.extensions`**：说明插件没有合法入口。
  请确保 `packages/openclaw-adapter/package.json` 包含：
  ```json
  "openclaw": { "extensions": ["./dist/index.js"] }
  ```
- **Skill 未显示**：安装后需重启网关。
- **钩子未生效**：确认已重启网关，且目标工作目录是 `.claw` 项目（有 `.claw/project.json`）。
