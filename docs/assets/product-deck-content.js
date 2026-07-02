export const deckContent = {
  en: {
    pageTitle: "claw-kit | Product Deck",
    sections: [
      {
        id: "hero",
        variant: "hero",
        eyebrow: "claw-kit / workflow layer",
        title: "Built for agent work that holds up.",
        summary:
          "A project workflow layer for planning, recall, execution, capture, and closeout.",
        detail:
          "Project memory, workflow structure, and closeout stay in the work instead of getting lost across chats."
      },
      {
        id: "problem",
        variant: "split",
        eyebrow: "why it exists",
        title: "Fast agents need memory.",
        summary:
          "Getting output is easy. Holding onto context is harder.",
        detail:
          "claw-kit keeps work going beyond the current prompt.",
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
          "Tasks keep moving, truth stays reusable, and decisions can go back to the repo.",
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
        title: "Five moves that keep work moving.",
        summary: "Five moves. One continuous round.",
        detail:
          "Hover any move to see what is happening in the round.",
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
          "Switch hosts without starting the workflow over.",
        detail:
          "Start in the CLI, then extend into Codex, OpenCode, and OpenClaw.",
        tags: ["CLI", "Codex", "OpenCode", "OpenClaw"]
      },
      {
        id: "advanced-features",
        variant: "feature-grid",
        eyebrow: "advanced features",
        title: "Shared by the team. Tuned by the individual.",
        summary:
          "A shared baseline for the team, with room for each person's way of working.",
        detail:
          "Config-driven, highly customizable harnesses that fit the way each person works.",
        features: [
          {
            label: "Team config",
            text: "Use .claw/project.json to define the workflow baseline your team shares."
          },
          {
            label: "Personal override",
            text: "Use .claw/project-override.json for personal preferences without changing the team baseline."
          },
          {
            label: "Custom templates",
            text: "Turn recurring work into templates instead of rebuilding the same task shape every time."
          },
          {
            label: "Composable skills",
            text: "Plan skill, writer skill, and custom harnesses all plug in cleanly without getting in each other's way."
          }
        ]
      },
      {
        id: "closing",
        variant: "closing",
        eyebrow: "start here",
        title: "Install once. Collaborate seamlessly.",
        summary: "Automated. No extra prompts. Seamless across the team.",
        detail: "",
        copyDisplay: "\"Help me install the claw-kit plugin\"",
        copyPrompt:
          "Help me install the claw-kit plugin and CLI, project URL: https://github.com/chanyuenpang/claw-kit",
        copyHint: "Click to copy",
        copyFeedback: "Copied",
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
        title: "让 agent 协作接得住，也跑得远。",
        summary:
          "把计划、上下文、执行、沉淀和收尾，收进同一条项目工作流。",
        detail:
          "项目记忆、流程结构和收尾动作，不再散落在一轮轮对话之间。"
      },
      {
        id: "problem",
        variant: "split",
        eyebrow: "为什么需要它",
        title: "Agent 可以很快，项目不能总失忆。",
        summary:
          "难的不是把结果做出来，而是把上下文接住。",
        detail:
          "claw-kit 让工作离开 prompt 也能接着走。",
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
        title: "不同平台宿主，同一套工作流。",
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
          "团队有统一基线，个人也能保留自己的工作习惯。",
        detail:
          "配置驱动，高度可定制的 harness，契合每个人的工作习惯。",
        features: [
          {
            label: "团队配置",
            text: "用 .claw/project.json 固定团队共用的 workflow 基线。"
          },
          {
            label: "个人覆盖",
            text: "用 .claw/project-override.json 保留个人偏好，同时不改动团队基线。"
          },
          {
            label: "自定义模板",
            text: "把高频任务沉淀成模板，不用每次都从空白重新搭。"
          },
          {
            label: "可组合扩展",
            text: "plan skill、writer skill 和自定义 harness 都能灵活接入，彼此不打架。"
          }
        ]
      },
      {
        id: "closing",
        variant: "closing",
        eyebrow: "从这里开始",
        title: "一次安装，无缝协作。",
        summary: "自动化，无需额外 prompt，团队内无缝接入。",
        detail: "",
        copyDisplay: "“帮我安装 claw-kit 插件”",
        copyPrompt:
          "帮我安装 claw-kit 插件和 CLI，项目地址：https://github.com/chanyuenpang/claw-kit",
        copyHint: "点击复制",
        copyFeedback: "文本已复制",
        links: ["查看文档", "从 CLI 开始", "探索宿主"]
      }
    ]
  }
};
