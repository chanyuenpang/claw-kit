export const configGuideContent = {
  en: {
    pageTitle: "claw-kit | Config guide",
    hero: {
      eyebrow: "shared workflow baseline",
      title: "Configure the project once. Let the workflow stay coherent.",
      summary:
        ".claw/project.json is where a team defines how claw-kit should behave inside a repo, without forcing every personal preference into the shared file.",
      detail:
        "This page introduces every supported config field in product terms first: what it shapes, what usually stays at the default, and when a team would actually tune it."
    },
    modelCards: [
      {
        id: "team-baseline",
        label: "Team baseline",
        text: "Use .claw/project.json for the shared workflow contract the repository owns."
      },
      {
        id: "local-override",
        label: "Local override",
        text: "Use .claw/project-override.json for personal runtime preferences that should not rewrite the team baseline."
      },
      {
        id: "recall-layer",
        label: "Recall and memory",
        text: "Use the memory block to decide which docs claw search can recall and how embedding-backed indexing runs."
      }
    ],
    fieldCards: [
      {
        id: "version",
        group: "Protocol",
        title: "Project protocol version",
        summary: "Declares which claw-kit CLI version this project expects.",
        detail: "If the project version is lower than the current CLI, `claw context` aligns the file upward. If it is higher, `claw context` tries to update the CLI and returns CLI lagging information when that update cannot be completed.",
        example: `"version": "0.1.54"`
      },
      {
        id: "maxTasksToKeep",
        group: "Retention",
        title: "How much active task history stays nearby",
        summary: "Controls how many recent tasks claw-kit keeps before older work gets archived.",
        detail: "Teams raise or lower this when they want more or less visible short-term history in the working set.",
        example: `"maxTasksToKeep": 20`
      },
      {
        id: "planning",
        group: "Workflow",
        title: "Whether work starts with an explicit planning step",
        summary: "Controls whether claw-kit runs the planning skill to split the request into executable tasks.",
        detail: "When false, the original request is kept as one task item and executed directly instead of being split first.",
        example: `"planning": true`
      },
      {
        id: "goalMode",
        group: "Workflow",
        title: "Whether workflow guidance enters Goal Mode",
        summary: "Controls whether goal-oriented execution guidance appears when the host supports it.",
        detail: "Teams usually keep this enabled unless they want a simpler host interaction contract.",
        example: `"goalMode": true`
      },
      {
        id: "truthDispatch",
        group: "Workflow",
        title: "When truth capture should be prompted",
        summary: 'Allowed values: `per_task` and `final_only`.',
        detail: '`per_task` is the default and allows truth guidance during a task. `final_only` suppresses mid-task truth guidance but still keeps closeout truth and ADR deposition.',
        example: `"truthDispatch": "per_task"`
      },
      {
        id: "defaultPlanTemplate",
        group: "Templates",
        title: "Shared default plan template",
        summary: "Lets a project choose its preferred seed-plan shape without repeating --template every time.",
        detail: "Teams set this when they have a recurring workflow format they want to become the default.",
        example: `"defaultPlanTemplate": "team-default"`
      },
      {
        id: "contextPaths",
        group: "Context",
        title: "OpenClaw startup context paths",
        summary: "OpenClaw-only field used to load startup context files such as agents.md.",
        detail: "Use this when the OpenClaw adapter should load specific project context files during startup.",
        example: `"contextPaths": ["agents.md"]`
      },
      {
        id: "externalPlanningSkill",
        group: "Extension",
        title: "Project-selected planning skill",
        summary: "Swaps the default planning skill name for a project-owned planning surface.",
        detail: "Teams change this when planning itself is specialized enough to justify its own skill contract.",
        example: `"externalPlanningSkill": "team-planner"`
      },
      {
        id: "externalTruthSkill",
        group: "Extension",
        title: "Project-selected truth writer",
        summary: "Overrides the built-in truth writer when the project has its own capture surface.",
        detail: "Keep it null for the default behavior; change it only when the team maintains a real alternative writer workflow.",
        example: `"externalTruthSkill": "external-truth-writer"`
      },
      {
        id: "externalAdrSkill",
        group: "Extension",
        title: "Project-selected ADR writer",
        summary: "Overrides the built-in ADR writer when architecture decisions should flow through a custom surface.",
        detail: "This is most useful for teams that already maintain a project-specific ADR process.",
        example: `"externalAdrSkill": "external-adr-writer"`
      },
      {
        id: "memory.enabled",
        group: "Memory",
        title: "Master switch for memory and claw search",
        summary: "Turns the whole project memory surface on or off.",
        detail: "When false, project memory, task memory, embedding refresh, and claw search recall are all disabled together.",
        example: `"memory": { "enabled": false }`
      },
      {
        id: "memory.externalDocPaths",
        group: "Memory",
        title: "Docs that recall should search",
        summary: "Lists the directories or files claw search should index as project recall material.",
        detail: "Teams use this to make architecture notes, docs folders, or playbooks available to project recall.",
        example: `"externalDocPaths": ["docs/", "architecture/"]`
      },
      {
        id: "memory.embedding",
        group: "Memory",
        title: "How embedding-backed recall is configured",
        summary: "Defines the embedding provider and model used when memory indexing is enabled.",
        detail: "Most projects stay on the local default unless they need a different provider, model, or runtime device setup.",
        example: `"memory": { "embedding": { "provider": "local", "model": "Snowflake/snowflake-arctic-embed-m-v2.0" } }`
      },
      {
        id: "gitnexus",
        group: "Integration",
        title: "Optional GitNexus integration switch",
        summary: "Turns on GitNexus-related integration behavior without making GitNexus mandatory.",
        detail: "Enable it when the project actually wants that companion integration; otherwise claw-kit still works on its own.",
        example: `"gitnexus": true`
      }
    ]
  },
  zh: {
    pageTitle: "claw-kit | 配置说明",
    hero: {
      eyebrow: "共享工作流基线",
      title: ".claw/project.json 配置说明",
      summary:
        "配置写在 .claw/project.json 里，用来定义仓库共享的 claw-kit 行为。",
      detail:
        ".claw/project-override.json 使用同一套字段格式，可以覆盖团队配置。"
    },
    modelCards: [
      {
        id: "team-baseline",
        label: "团队基线",
        text: "团队共享配置写在 .claw/project.json。"
      },
      {
        id: "local-override",
        label: "个人覆盖",
        text: "个人配置写在 .claw/project-override.json，字段格式与 project.json 相同。"
      }
    ],
    fieldCards: [
      {
        id: "version",
        group: "协议",
        title: "项目协议版本",
        summary: "声明这个项目希望和哪一版 claw-kit CLI 对齐。",
        detail: "如果项目版本低于当前 CLI，`claw context` 会把 project.json 自动对齐到当前 CLI 版本；如果项目版本更高，`claw context` 会尝试更新 CLI，更新失败时会返回 CLI 版本落后信息。",
        example: `"version": "0.1.54"`
      },
      {
        id: "maxTasksToKeep",
        group: "保留",
        title: "附近保留多少活跃任务历史",
        summary: "控制 claw-kit 在更早任务归档前，先保留多少最近任务。",
        detail: "团队会在想保留更多或更少短期历史时调整这个值。",
        example: `"maxTasksToKeep": 20`
      },
      {
        id: "planning",
        group: "工作流",
        title: "是否先走显式计划步骤",
        summary: "控制是否执行 planning skill 来拆分任务。",
        detail: "如果设为 false，原始请求会直接作为一个任务项执行，不再先拆分。",
        example: `"planning": true`
      },
      {
        id: "goalMode",
        group: "工作流",
        title: "是否在流程引导中进入 Goal Mode",
        summary: "控制支持该能力的宿主是否收到目标导向的执行引导。",
        detail: "大多数团队会保留开启，除非想把宿主侧的交互约束压得更简单。",
        example: `"goalMode": true`
      },
      {
        id: "truthDispatch",
        group: "工作流",
        title: "什么时候提示 truth 捕获",
        summary: "可选值只有 `per_task` 和 `final_only`。",
        detail: "`per_task` 是默认值，允许任务进行中出现 truth 沉淀引导；`final_only` 会关闭中途 truth 引导，但保留收尾阶段的 truth 和 ADR 写回。",
        example: `"truthDispatch": "per_task"`
      },
      {
        id: "defaultPlanTemplate",
        group: "模板",
        title: "共享默认 plan 模板",
        summary: "让项目直接使用默认的 seed-plan 形状，而不必每次都手写 --template。",
        detail: "当团队有稳定重复的计划格式时，这个字段很值得设。",
        example: `"defaultPlanTemplate": "team-default"`
      },
      {
        id: "contextPaths",
        group: "上下文",
        title: "OpenClaw 启动上下文路径",
        summary: "这是 OpenClaw 专用字段，用来在启动时加载 agents.md 之类的上下文文件。",
        detail: "只有在 OpenClaw 适配层需要启动时读取这些项目文件时，才需要配置这个字段。",
        example: `"contextPaths": ["agents.md"]`
      },
      {
        id: "externalPlanningSkill",
        group: "扩展",
        title: "项目指定的 planning skill",
        summary: "把默认 planning skill 名称切换成项目自己的计划技能入口。",
        detail: "只有当计划阶段已经足够专业，值得单独维护技能约束时才需要改它。",
        example: `"externalPlanningSkill": "team-planner"`
      },
      {
        id: "externalTruthSkill",
        group: "扩展",
        title: "项目指定的 truth writer",
        summary: "当项目有自己的 truth 写回流程时，用它覆盖内建 truth writer。",
        detail: "如果没有明确替代流程，就保持 null 继续使用默认行为。",
        example: `"externalTruthSkill": "external-truth-writer"`
      },
      {
        id: "externalAdrSkill",
        group: "扩展",
        title: "项目指定的 ADR writer",
        summary: "当架构决策要走自定义写回流程时，用它覆盖内建 ADR writer。",
        detail: "这通常只对已经有项目级 ADR 流程的团队有意义。",
        example: `"externalAdrSkill": "external-adr-writer"`
      },
      {
        id: "memory.enabled",
        group: "记忆",
        title: "memory 和 claw search 的总开关",
        summary: "控制这个项目是否启用整套 memory 能力。",
        detail: "如果设为 false，项目级 memory、任务级 memory、embedding 刷新和 claw search recall 都会一起关闭。",
        example: `"memory": { "enabled": false }`
      },
      {
        id: "memory.externalDocPaths",
        group: "记忆",
        title: "让 recall 搜哪些文档",
        summary: "列出 claw search 要索引为项目回忆材料的目录或文件。",
        detail: "团队会用它把架构说明、docs 目录或操作手册纳入项目回忆范围。",
        example: `"memory": { "externalDocPaths": ["docs/", "architecture/"] }`
      },
      {
        id: "memory.embedding",
        group: "记忆",
        title: "embedding 配置怎么写",
        summary: "定义 memory 开启时使用的 embedding provider 和 model。",
        detail: "大多数项目保持本地默认即可，只有在 provider、model 或运行设备确实要调整时才需要改。",
        example: `"memory": { "embedding": { "provider": "local", "model": "Snowflake/snowflake-arctic-embed-m-v2.0" } }`
      },
      {
        id: "gitnexus",
        group: "集成",
        title: "可选的 GitNexus 集成开关",
        summary: "打开 GitNexus 相关的集成行为，但不把 GitNexus 变成前提条件。",
        detail: "只有项目明确需要这层集成时才开启；不开也不影响 claw-kit 单独工作。",
        example: `"gitnexus": true`
      }
    ],
    examples: [
      {
        title: "最小共享配置",
        body: `{
  "version": "0.1.54",
  "planning": true,
  "goalMode": true,
  "truthDispatch": "per_task",
  "gitnexus": false
}`
      },
      {
        title: "个人覆盖配置",
        body: `{
  "goalMode": false,
  "truthDispatch": "final_only",
  "defaultPlanTemplate": "my-personal-template"
}`
      },
      {
        title: "启用文档回忆",
        body: `{
  "memory": {
    "enabled": true,
    "externalDocPaths": ["docs/", "architecture/"],
    "embedding": {
      "provider": "local",
      "model": "Snowflake/snowflake-arctic-embed-m-v2.0"
    }
  }
}`
      }
    ]
  }
};
