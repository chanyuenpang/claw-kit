export const deckContent = {
  en: {
    pageTitle: "claw-kit | Product Deck",
    sections: [
      {
        id: "hero",
        variant: "hero",
        eyebrow: "claw-kit / workflow layer",
        title: "Continuity, built for agentic work.",
        summary:
          "A project workflow layer for planning, recall, execution, capture, and closeout.",
        detail:
          "Project memory, workflow structure, and closeout become part of the working surface itself."
      },
      {
        id: "problem",
        variant: "split",
        eyebrow: "why it exists",
        title: "Fast agents need memory.",
        summary:
          "Output is not the hard part. Retaining continuity is.",
        detail:
          "claw-kit keeps work alive beyond the current prompt.",
        bullets: ["Decisions fade", "Context resets", "Momentum breaks"]
      },
      {
        id: "continuity",
        variant: "outcomes",
        eyebrow: "continuity",
        title: "Work survives beyond the session.",
        summary:
          "Progress, findings, and closeout do not disappear when the conversation ends.",
        detail:
          "Tasks can continue, truth can stay reusable, and finished decisions can return to the repo.",
        points: [
          {
            label: "Across sessions",
            text: "Tasks keep a durable workflow state instead of relying on chat memory alone."
          },
          {
            label: "Back into the repo",
            text: "Findings and truth can return to the project as artifacts people can reuse."
          },
          {
            label: "Closed out cleanly",
            text: "The workflow treats closeout as a first-class step instead of an afterthought."
          }
        ]
      },
      {
        id: "workflow",
        variant: "flow",
        eyebrow: "core loop",
        title: "How the loop keeps moving.",
        summary: "Five moves. One continuous round.",
        detail:
          "Hover a move to open the round.",
        steps: [
          {
            label: "Plan",
            text: "Frame the work before execution begins.",
            accent: "Scope"
          },
          {
            label: "Recall",
            text: "Pull in project knowledge before going deeper.",
            accent: "Memory"
          },
          {
            label: "Execute",
            text: "Do the work with context, not from zero.",
            accent: "Action"
          },
          {
            label: "Capture",
            text: "Write back what became true.",
            accent: "Truth"
          },
          {
            label: "Close",
            text: "Finish the round without leaving residue.",
            accent: "Closeout"
          }
        ]
      },
      {
        id: "ecosystem",
        variant: "hosts",
        eyebrow: "multi-host",
        title: "One workflow, multiple hosts.",
        summary:
          "The host can change. The model stays coherent.",
        detail:
          "Start from the CLI, then extend into Codex, OpenCode, and OpenClaw.",
        tags: ["CLI", "Codex", "OpenCode", "OpenClaw"]
      },
      {
        id: "advanced-features",
        variant: "feature-grid",
        eyebrow: "advanced features",
        title: "Shared by the team. Tuned by the individual.",
        summary:
          "Shared rules for the project. Personal control at runtime.",
        detail:
          "Composable by design, with a low-interference shape that can adapt to other skills or harnesses.",
        features: [
          {
            label: "Team config",
            text: "Use .claw/project.json for the canonical workflow your team shares."
          },
          {
            label: "Personal override",
            text: "Use .claw/project-override.json for local runtime preferences without changing the team baseline."
          },
          {
            label: "Custom templates",
            text: "Start recurring work from project-defined templates instead of rebuilding the same task shape each time."
          },
          {
            label: "Composable skills",
            text: "Plug in plan skill, writer skill, or a custom harness while keeping the workflow low-interference."
          }
        ]
      },
      {
        id: "closing",
        variant: "closing",
        eyebrow: "start here",
        title: "Make continuity the default.",
        summary: "A lighter way to work with agents.",
        detail:
          "Start with workflow. Then bring it into the host that fits your team.",
        links: ["View docs", "Start with CLI", "Explore hosts"]
      }
    ]
  },
  zh: {
    pageTitle: "claw-kit | 产品介绍",
    sections: [
      {
        id: "hero",
        variant: "hero",
        eyebrow: "claw-kit / workflow layer",
        title: "让 agent 协作真正连续起来。",
        summary:
          "一层面向项目的 workflow，把计划、回忆、执行、沉淀和收尾串成闭环。",
        detail:
          "项目记忆、流程结构和收尾动作，不再散在一次次对话里。"
      },
      {
        id: "problem",
        variant: "split",
        eyebrow: "为什么需要它",
        title: "Agent 可以很快，项目不能总失忆。",
        summary:
          "难的不是把结果做出来，而是把上下文接住。",
        detail:
          "claw-kit 让工作在 prompt 之外也能接着成立。",
        bullets: ["决策留不住", "上下文总断", "推进容易散"]
      },
      {
        id: "continuity",
        variant: "outcomes",
        eyebrow: "连续性",
        title: "会话结束，工作也不用归零。",
        summary:
          "进展、发现和收尾都能留下来，下一轮可以接着做。",
        detail:
          "任务能延续，结论能沉淀，做完的决定也能回到仓库。",
        points: [
          {
            label: "跨会话延续",
            text: "任务有自己的工作流状态，不用只靠聊天记录硬接上下文。"
          },
          {
            label: "写回仓库",
            text: "发现和结论可以沉淀成项目里的正式产物，后面的人还能继续用。"
          },
          {
            label: "干净收尾",
            text: "收尾不再是最后补一下，而是流程里本来就该完成的一步。"
          }
        ]
      },
      {
        id: "workflow",
        variant: "flow",
        eyebrow: "核心循环",
        title: "五步一轮，工作自然往前走。",
        summary: "先定范围，再带着上下文推进。",
        detail:
          "把鼠标停在任一步上，就能看到这一轮当前在做什么。",
        steps: [
          {
            label: "计划",
            text: "先把这一轮要做什么框清楚。",
            accent: "Scope"
          },
          {
            label: "回忆",
            text: "先把项目已经知道的内容调出来。",
            accent: "Memory"
          },
          {
            label: "执行",
            text: "带着上下文往下做，而不是每次从头来。",
            accent: "Action"
          },
          {
            label: "沉淀",
            text: "把这一轮新形成的结论写回项目。",
            accent: "Truth"
          },
          {
            label: "收尾",
            text: "把这一轮收干净，也把决策轨迹留下来。",
            accent: "Closeout"
          }
        ]
      },
      {
        id: "ecosystem",
        variant: "hosts",
        eyebrow: "多宿主",
        title: "同一套工作流，进不同宿主都成立。",
        summary:
          "宿主可以换，协作方式不用重来。",
        detail:
          "可以先从 CLI 起步，再接到 Codex、OpenCode 和 OpenClaw。",
        tags: ["CLI", "Codex", "OpenCode", "OpenClaw"]
      },
      {
        id: "advanced-features",
        variant: "feature-grid",
        eyebrow: "高级能力",
        title: "团队先对齐，个人再细调。",
        summary:
          "团队有共识，个人也保留自己的运行习惯。",
        detail:
          "模板、skills 和 harness 都能接进来，保持可组合，也尽量低干扰。",
        features: [
          {
            label: "团队配置",
            text: "用 .claw/project.json 保存团队共用的 workflow 基线。"
          },
          {
            label: "个人覆盖",
            text: "用 .claw/project-override.json 保留自己的本地偏好，不动团队基线。"
          },
          {
            label: "自定义模板",
            text: "把高频任务做成项目模板，不用每次都从空白任务重新搭。"
          },
          {
            label: "可组合扩展",
            text: "plan skill、writer skill 或自定义 harness 都能接进来，而且保持低干扰。"
          }
        ]
      },
      {
        id: "closing",
        variant: "closing",
        eyebrow: "从这里开始",
        title: "把连续性变成默认设置。",
        summary: "一种更轻、更稳的 agent 协作方式。",
        detail:
          "先把 workflow 立住，再把它放进适合你团队的宿主。",
        links: ["查看文档", "从 CLI 开始", "探索宿主"]
      }
    ]
  }
};
