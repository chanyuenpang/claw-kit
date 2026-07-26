export const deckContent = {
  en: {
    pageTitle: "claw-kit | Product Deck",
    sections: [
      {
        id: "hero",
        variant: "hero",
        eyebrow: "claw-kit / workflow layer",
        title: "Claw Kit, a harness for complex projects and long-running tasks",
        summary:
          "A workflow layer for agent work that keeps planning, context, execution, and closeout connected across the life of a project.",
        detail:
          "Project memory, workflow structure, and closeout stay in the work instead of getting reset every time a long-running round crosses chat boundaries."
      },
      {
        id: "continuity",
        variant: "outcomes",
        eyebrow: "continuity",
        title: "Findings stick. Collaboration carries forward.",
        summary:
          "Your findings stay in the project and become task context for the team's next round of development and debugging.",
        detail:
          "Work keeps moving, findings get captured, and decisions can go back to the repo.",
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
        title: "Five steps. One round. Work keeps moving.",
        summary: "Set the scope first, then move forward with context.",
        detail: "",
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
        id: "advanced-features",
        variant: "feature-grid",
        eyebrow: "advanced features",
        title: "Align as a team. Fine-tune as an individual.",
        summary:
          "The team shares one baseline, while each person keeps their own way of working.",
        detail:
          "Config-driven, highly customizable harnesses that fit the way each person works.",
        features: [
          {
            label: "Team config",
            text: "Use .claw/project.json to define the shared workflow baseline, including whether finalized Truth and ADR updates are committed automatically."
          },
          {
            label: "Personal override",
            text: "Use .claw/project-override.json for personal preferences without changing the team baseline."
          },
          {
            label: "Custom templates",
            text: "Turn recurring work into templates; active plans keep the template contract they started with, even after installed templates advance."
          },
          {
            label: "Composable skills",
            text: "Plan skill, writer skill, and custom harnesses all plug in cleanly without getting in each other's way."
          }
        ]
      },
      {
        id: "ecosystem",
        variant: "hosts",
        eyebrow: "multi-host",
        title: "Different hosts. One workflow.",
        summary:
          "Switch hosts without redoing how the team works.",
        detail:
          "Start in the CLI, then continue in Codex, OpenCode, and OpenClaw.",
        tags: ["CLI", "Codex", "OpenCode", "OpenClaw"]
      },
      {
        id: "closing",
        variant: "closing",
        eyebrow: "start here",
        title: "Auto-invoked. Install once. Collaborate seamlessly.",
        summary: "No extra prompts. Seamless across the team.",
        detail: "",
        copyDisplay: "\"Help me install the claw-kit plugin\"",
        copyPrompt:
          "Help me install the claw-kit plugin and CLI, project URL: https://github.com/chanyuenpang/claw-kit",
        copyHint: "Click to copy",
        copyFeedback: "Copied",
        links: [
          {
            label: "Read the docs",
            href: "https://github.com/chanyuenpang/claw-kit#readme"
          },
          {
            label: "Technical principles",
            href: "./technical-principles.html"
          },
          {
            label: "Config guide",
            href: "./config-guide.html"
          }
        ]
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
        title: "Claw Kit，面向复杂项目与长时任务的 harness 方案",
        summary:
          "面向 agent work 的 workflow layer，让计划、上下文、执行和收尾贯穿整个项目周期。",
        detail:
          "项目记忆、流程结构和收尾动作留在工作里，不会因为长时任务跨过几轮对话就重新散掉。"
      },
      {
        id: "continuity",
        variant: "outcomes",
        eyebrow: "连续性",
        title: "调查会沉淀，协作能接力。",
        summary:
          "你的调查结果会留在项目里，成为团队下一轮开发与 debug 的任务上下文。",
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
        detail: "",
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
            text: "用 .claw/project.json 固定团队共用的 workflow 基线，也可决定完成沉淀后是否自动提交 Truth 与 ADR 更新。"
          },
          {
            label: "个人覆盖",
            text: "用 .claw/project-override.json 保留个人偏好，同时不改动团队基线。"
          },
          {
            label: "自定义模板",
            text: "把高频任务沉淀成模板；即使已安装模板继续升级，进行中的计划仍沿用启动时的模板契约。"
          },
          {
            label: "可组合扩展",
            text: "plan skill、writer skill 和自定义 harness 都能灵活接入，彼此不打架。"
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
        id: "closing",
        variant: "closing",
        eyebrow: "从这里开始",
        title: "自动调用，一次安装，无缝协作。",
        summary: "无需额外 prompt，团队内无缝接入。",
        detail: "",
        copyDisplay: "“帮我安装 claw-kit 插件”",
        copyPrompt:
          "帮我安装 claw-kit 插件和 CLI，项目地址：https://github.com/chanyuenpang/claw-kit",
        copyHint: "点击复制",
        copyFeedback: "文本已复制",
        links: [
          {
            label: "查看文档",
            href: "https://github.com/chanyuenpang/claw-kit#readme"
          },
          {
            label: "技术原理",
            href: "./technical-principles.html"
          },
          {
            label: "配置说明",
            href: "./config-guide.html"
          }
        ]
      }
    ]
  }
};
