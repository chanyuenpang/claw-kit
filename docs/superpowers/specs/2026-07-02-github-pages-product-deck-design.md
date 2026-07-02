# GitHub Pages Product Deck Design

## Goal

Create a GitHub Pages product introduction for `claw-kit` that feels like a vertically scrolling presentation deck: minimal, flat, motion-led, and product-first.

The page should help a first-time visitor immediately understand what `claw-kit` is, why it exists, and how it fits into agentic work, without exposing too much detail by default.

## Primary Objective

The page is primarily for product understanding, not installation conversion.

It should answer:

- what `claw-kit` is
- why it matters
- how its workflow works at a high level
- what changes for a team using it
- how it fits across different hosts

## Audience

- first-time GitHub visitors who need a quick product mental model
- developers already using agentic tools who want a more durable workflow
- teams that care about continuity, retained project knowledge, and clean closeout

## Experience Direction

The page should feel like a narrative product deck on the web.

### Desired qualities

- minimal
- flat
- high-design
- calm but alive
- scroll-driven
- detail-on-demand

### Avoid

- documentation-homepage density
- large default text blocks
- heavy skeuomorphic styling
- feature-grid overload
- noisy animation

## Core Interaction Model

The page is a vertically scrolling sequence of full-height or near-full-height sections.

Each section has two layers:

1. Default layer
   - one large title
   - one short supporting statement
   - one subtle affordance that suggests more depth is available
2. Reveal layer
   - appears on hover for desktop
   - appears on tap for mobile
   - contains short supporting detail, not full documentation

### Interaction rules

- default state should stay visually clean and low-density
- reveal content is part of the core presentation, not a footnote
- reveal content should be readable in 2 to 4 seconds
- only one section should feel visually active at a time
- transitions should be fluid and lightweight

## Language Model

The page includes a global language toggle for English and Chinese.

### Language rules

- only one language is shown at a time
- toggling language swaps the full page copy
- titles, supporting lines, and reveal details all switch together
- avoid mixed-language body copy outside product names and fixed terms

## Information Architecture

The page should follow this sequence:

1. Problem
2. Definition
3. Workflow
4. Impact
5. Ecosystem
6. Advanced Features
7. Closing

## Section Script

### 1. Problem

#### Default

English:
`Agents can act. Projects should remember.`

Chinese:
`Agent 会行动，项目也应该会记住。`

Supporting line:

- EN: `Most agent workflows move fast, but the project itself remembers very little.`
- ZH: `大多数 agent workflow 运转很快，但项目本身记不住多少东西。`

#### Reveal

- EN: `claw-kit` starts from a simple idea: execution is not enough. A project also needs continuity, retained decisions, and a clean way to carry work forward.
- ZH: `claw-kit` 从一个很简单的判断出发：只会执行还不够。项目还需要连续性、可保留的决策，以及把工作继续带下去的方式。

### 2. Definition

#### Default

English:
`A workflow layer for agentic work.`

Chinese:
`面向 agentic work 的项目工作流层。`

Supporting line:

- EN: `Not just a CLI. Not just a plugin. A project-level working surface.`
- ZH: `不只是 CLI，也不只是插件，而是项目级的工作表面。`

#### Reveal

- EN: `claw-kit` gives agentic work a durable shape inside the project: planning, project recall, knowledge capture, and closeout.
- ZH: `claw-kit` 让 agentic work 在项目内部拥有持续形态：计划、项目回忆、知识沉淀和收尾闭环。

### 3. Workflow

#### Default

English:
`Plan -> Recall -> Execute -> Capture -> Close`

Chinese:
`计划 -> 回忆 -> 执行 -> 沉淀 -> 收尾`

Supporting line:

- EN: `A simple loop, designed for longer-running work.`
- ZH: `一个简单的循环，为更长程的工作而设计。`

#### Reveal

- EN: `Plan before action. Recall what the project already knows. Execute with context. Capture what became true. Close the round without losing decisions.`
- ZH: `先计划，再行动。先调用项目已有知识，再继续执行。把新形成的事实写回项目。最后完成收尾，而不丢失决策。`

### 4. Impact

#### Default

English:
`Work survives beyond the session.`

Chinese:
`工作不该随着会话结束而消失。`

Supporting line:

- EN: `Progress should not disappear when the chat ends.`
- ZH: `进展不该在聊天结束时一起消失。`

#### Reveal

- EN: `Tasks can continue across sessions, findings can return to the repo, and closeout becomes part of the workflow instead of an afterthought.`
- ZH: `任务可以跨会话继续，发现可以回到仓库，收尾也成为流程本身的一部分，而不是事后补上的动作。`

### 5. Ecosystem

#### Default

English:
`One workflow, multiple hosts.`

Chinese:
`同一种工作流，进入不同宿主。`

Supporting line:

- EN: `Bring the same working model into the environments where agents already operate.`
- ZH: `把同一种工作模型带进 agent 已经在工作的环境中。`

#### Reveal

- EN: `claw-kit` can start from the CLI and extend into hosts like Codex, OpenCode, and OpenClaw. The host can change. The workflow stays coherent.
- ZH: `claw-kit` 可以从 CLI 开始，也可以延伸到 Codex、OpenCode、OpenClaw 这样的宿主环境。宿主可以变化，工作流保持一致。`

### 6. Advanced Features

#### Default

English:
`Shared by the team. Tuned by the individual.`

Chinese:
`团队共享，个人可调。`

Supporting line:

- EN: `A workflow that separates shared project rules from personal runtime preferences.`
- ZH: `同一套工作流，同时区分团队共享规则和个人运行偏好。`

#### Reveal

- EN: `Teams can define shared behavior in .claw/project.json, while individuals keep local preferences in .claw/project-override.json. Projects can also customize templates, planning skills, and writer skills. The workflow stays low-interference, so it can pair cleanly with other skills or a custom harness.`
- ZH: `团队可以在 .claw/project.json 里定义共享行为，个人可以在 .claw/project-override.json 里保留本地偏好。项目也可以自定义 template、plan skill 和 writer skill。整体干扰很少，也可以和其他 skill 或自定义 harness 很自然地配合。`

### 7. Closing

#### Default

English:
`Designed for projects that want continuity.`

Chinese:
`为需要连续性的项目而设计。`

Supporting line:

- EN: `A quieter, more durable way to work with agents.`
- ZH: `一种更安静、也更持久的 agent 协作方式。`

#### Reveal

- EN: `When agents become part of real project work, the project needs more than output. It needs continuity.`
- ZH: `当 agent 真正进入项目工作时，项目需要的就不只是输出结果，而是持续性本身。`

## Visual Direction

### Layout

- each section should feel like a presentation slide
- large title area with strong vertical rhythm
- generous whitespace
- detail content revealed within the same visual frame
- avoid dashboard-style card grids as the main structure

### Style

- flat visual language
- restrained color palette
- precise typography
- thin dividers, panels, and geometry accents
- modern but not decorative

### Motion

- staggered text entrance on scroll
- smooth reveal transitions on hover
- subtle panel expansion, line growth, or opacity layering
- motion should feel elastic and responsive, not flashy

## Content Boundaries

The page should not expose these by default:

- installation commands
- long config examples
- adapter implementation details
- detailed workflow documentation

Those belong in secondary docs or later navigation paths.

## Success Criteria

- a first-time visitor can understand the product in under 30 seconds
- the page feels more like a product presentation than a README
- the default view stays sparse and elegant
- reveal interactions carry meaningful detail without overwhelming the layout
- the advanced features section communicates configurability without becoming documentation-heavy
- English and Chinese both read naturally within the same layout system
