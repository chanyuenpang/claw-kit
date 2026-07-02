# GitHub Pages Product Deck Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a bilingual GitHub Pages product deck for `claw-kit` under `docs/` that presents the product as a scroll-driven, high-design, low-density web experience.

**Architecture:** Keep the site zero-build and fully static so GitHub Pages can publish directly from `docs/`. Separate concerns into one HTML shell, one CSS file for layout/motion/theme, one content module for bilingual section copy, and one interaction module for rendering, language switching, hover/tap reveal behavior, and scroll-state management.

**Tech Stack:** HTML, CSS, vanilla JavaScript, GitHub Pages static hosting

---

### Task 1: Create the static site shell and bilingual content model

**Files:**
- Create: `docs/index.html`
- Create: `docs/assets/product-deck-content.js`
- Create: `docs/assets/product-deck.js`

- [ ] **Step 1: Create the HTML shell for the deck page**

Use this structure in `docs/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>claw-kit | Product Deck</title>
    <meta
      name="description"
      content="A workflow layer for agentic work. Plan, recall, execute, capture, and close with continuity."
    />
    <link rel="stylesheet" href="./assets/product-deck.css" />
  </head>
  <body>
    <div class="page-shell">
      <header class="topbar">
        <a class="brand" href="../README.md" aria-label="claw-kit repository">
          <span class="brand-mark"></span>
          <span class="brand-text">claw-kit</span>
        </a>
        <button
          class="lang-toggle"
          type="button"
          aria-label="Switch language"
          aria-pressed="false"
        >
          <span class="lang-toggle-en">EN</span>
          <span class="lang-toggle-divider">/</span>
          <span class="lang-toggle-zh">中</span>
        </button>
      </header>

      <main id="deck" class="deck" aria-live="polite"></main>
    </div>

    <script type="module" src="./assets/product-deck.js"></script>
  </body>
</html>
```

- [ ] **Step 2: Define the bilingual section script in a dedicated content module**

Create `docs/assets/product-deck-content.js` with an exported `deckContent` object:

```js
export const deckContent = {
  en: {
    pageTitle: "claw-kit | Product Deck",
    sections: [
      {
        id: "problem",
        eyebrow: "01",
        title: "Agents can act. Projects should remember.",
        summary:
          "Most agent workflows move fast, but the project itself remembers very little.",
        detail:
          "claw-kit starts from a simple idea: execution is not enough. A project also needs continuity, retained decisions, and a clean way to carry work forward."
      },
      {
        id: "definition",
        eyebrow: "02",
        title: "A workflow layer for agentic work.",
        summary:
          "Not just a CLI. Not just a plugin. A project-level working surface.",
        detail:
          "claw-kit gives agentic work a durable shape inside the project: planning, project recall, knowledge capture, and closeout."
      },
      {
        id: "workflow",
        eyebrow: "03",
        title: "Plan -> Recall -> Execute -> Capture -> Close",
        summary: "A simple loop, designed for longer-running work.",
        detail:
          "Plan before action. Recall what the project already knows. Execute with context. Capture what became true. Close the round without losing decisions."
      },
      {
        id: "impact",
        eyebrow: "04",
        title: "Work survives beyond the session.",
        summary: "Progress should not disappear when the chat ends.",
        detail:
          "Tasks can continue across sessions, findings can return to the repo, and closeout becomes part of the workflow instead of an afterthought."
      },
      {
        id: "ecosystem",
        eyebrow: "05",
        title: "One workflow, multiple hosts.",
        summary:
          "Bring the same working model into the environments where agents already operate.",
        detail:
          "claw-kit can start from the CLI and extend into hosts like Codex, OpenCode, and OpenClaw. The host can change. The workflow stays coherent."
      },
      {
        id: "advanced-features",
        eyebrow: "06",
        title: "Shared by the team. Tuned by the individual.",
        summary:
          "A workflow that separates shared project rules from personal runtime preferences.",
        detail:
          "Teams can define shared behavior in .claw/project.json, while individuals keep local preferences in .claw/project-override.json. Projects can also customize templates, planning skills, and writer skills. The workflow stays low-interference, so it can pair cleanly with other skills or a custom harness."
      },
      {
        id: "closing",
        eyebrow: "07",
        title: "Designed for projects that want continuity.",
        summary: "A quieter, more durable way to work with agents.",
        detail:
          "When agents become part of real project work, the project needs more than output. It needs continuity."
      }
    ]
  },
  zh: {
    pageTitle: "claw-kit | 产品介绍",
    sections: [
      {
        id: "problem",
        eyebrow: "01",
        title: "Agent 会行动，项目也应该会记住。",
        summary: "大多数 agent workflow 运转很快，但项目本身记不住多少东西。",
        detail:
          "claw-kit 从一个很简单的判断出发：只会执行还不够。项目还需要连续性、可保留的决策，以及把工作继续带下去的方式。"
      },
      {
        id: "definition",
        eyebrow: "02",
        title: "面向 agentic work 的项目工作流层。",
        summary: "不只是 CLI，也不只是插件，而是项目级的工作表面。",
        detail:
          "claw-kit 让 agentic work 在项目内部拥有持续形态：计划、项目回忆、知识沉淀和收尾闭环。"
      },
      {
        id: "workflow",
        eyebrow: "03",
        title: "计划 -> 回忆 -> 执行 -> 沉淀 -> 收尾",
        summary: "一个简单的循环，为更长程的工作而设计。",
        detail:
          "先计划，再行动。先调用项目已有知识，再继续执行。把新形成的事实写回项目。最后完成收尾，而不丢失决策。"
      },
      {
        id: "impact",
        eyebrow: "04",
        title: "工作不该随着会话结束而消失。",
        summary: "进展不该在聊天结束时一起消失。",
        detail:
          "任务可以跨会话继续，发现可以回到仓库，收尾也成为流程本身的一部分，而不是事后补上的动作。"
      },
      {
        id: "ecosystem",
        eyebrow: "05",
        title: "同一种工作流，进入不同宿主。",
        summary: "把同一种工作模型带进 agent 已经在工作的环境中。",
        detail:
          "claw-kit 可以从 CLI 开始，也可以延伸到 Codex、OpenCode、OpenClaw 这样的宿主环境。宿主可以变化，工作流保持一致。"
      },
      {
        id: "advanced-features",
        eyebrow: "06",
        title: "团队共享，个人可调。",
        summary: "同一套工作流，同时区分团队共享规则和个人运行偏好。",
        detail:
          "团队可以在 .claw/project.json 里定义共享行为，个人可以在 .claw/project-override.json 里保留本地偏好。项目也可以自定义 template、plan skill 和 writer skill。整体干扰很少，也可以和其他 skill 或自定义 harness 很自然地配合。"
      },
      {
        id: "closing",
        eyebrow: "07",
        title: "为需要连续性的项目而设计。",
        summary: "一种更安静、也更持久的 agent 协作方式。",
        detail:
          "当 agent 真正进入项目工作时，项目需要的就不只是输出结果，而是持续性本身。"
      }
    ]
  }
};
```

- [ ] **Step 3: Render the sections from data instead of hardcoding the page twice**

Start `docs/assets/product-deck.js` with:

```js
import { deckContent } from "./product-deck-content.js";

const deck = document.querySelector("#deck");
const langToggle = document.querySelector(".lang-toggle");

let currentLang = "en";
let activeSectionId = null;

function renderDeck(lang) {
  const { pageTitle, sections } = deckContent[lang];
  document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  document.title = pageTitle;

  deck.innerHTML = sections
    .map(
      (section, index) => `
        <section
          class="deck-section"
          data-section-id="${section.id}"
          data-index="${index}"
          tabindex="0"
        >
          <div class="section-frame">
            <p class="section-eyebrow">${section.eyebrow}</p>
            <h2 class="section-title">${section.title}</h2>
            <p class="section-summary">${section.summary}</p>
            <div class="section-detail" aria-hidden="true">
              <p>${section.detail}</p>
            </div>
          </div>
        </section>
      `
    )
    .join("");
}

renderDeck(currentLang);
```

- [ ] **Step 4: Verify the content model is wired before styling**

Run: `rg -n "advanced-features|project-override|custom harness|自定义 harness" docs/index.html docs/assets/product-deck-content.js docs/assets/product-deck.js`

Expected:

- `docs/assets/product-deck-content.js` contains the advanced-features bilingual copy
- `docs/index.html` references `product-deck.css` and `product-deck.js`
- `docs/assets/product-deck.js` renders sections from `deckContent`

- [ ] **Step 5: Commit the shell and copy foundation**

Run: `git add docs/index.html docs/assets/product-deck-content.js docs/assets/product-deck.js`

Run: `git commit -m "feat: scaffold GitHub Pages product deck"`

Expected: a commit that contains only the HTML shell and content-driven rendering scaffold

### Task 2: Build the visual system and scroll-deck layout

**Files:**
- Create: `docs/assets/product-deck.css`
- Modify: `docs/index.html`

- [ ] **Step 1: Define the global design tokens and page background**

Start `docs/assets/product-deck.css` with:

```css
:root {
  --bg: #f3efe7;
  --bg-accent: #e5ddd1;
  --panel: rgba(255, 252, 246, 0.72);
  --text: #181613;
  --muted: #70685e;
  --line: rgba(24, 22, 19, 0.14);
  --accent: #b55233;
  --shadow: 0 24px 80px rgba(24, 22, 19, 0.08);
  --radius: 28px;
  --content-width: min(1120px, calc(100vw - 48px));
  --transition-slow: 520ms cubic-bezier(0.2, 0.8, 0.2, 1);
  --transition-fast: 240ms cubic-bezier(0.2, 0.8, 0.2, 1);
  --title-font: "Segoe UI Variable Display", "Segoe UI", sans-serif;
  --body-font: "Segoe UI Variable Text", "Segoe UI", sans-serif;
}

html {
  scroll-behavior: smooth;
}

body {
  margin: 0;
  min-height: 100vh;
  color: var(--text);
  font-family: var(--body-font);
  background:
    radial-gradient(circle at 20% 18%, rgba(181, 82, 51, 0.08), transparent 30%),
    radial-gradient(circle at 82% 24%, rgba(24, 22, 19, 0.05), transparent 28%),
    linear-gradient(180deg, #f7f2ea 0%, #efe8dd 100%);
}
```

- [ ] **Step 2: Style the fixed topbar and the slide-like section frames**

Add:

```css
.topbar {
  position: fixed;
  inset: 20px 24px auto 24px;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.brand,
.lang-toggle {
  border: 1px solid var(--line);
  background: rgba(255, 252, 246, 0.68);
  backdrop-filter: blur(18px);
  box-shadow: var(--shadow);
}

.deck {
  width: var(--content-width);
  margin: 0 auto;
  padding: 120px 0 64px;
}

.deck-section {
  min-height: 92vh;
  display: grid;
  align-items: center;
}

.section-frame {
  position: relative;
  overflow: hidden;
  padding: clamp(32px, 5vw, 72px);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--panel);
  box-shadow: var(--shadow);
}
```

- [ ] **Step 3: Create a strong typography hierarchy with restrained flat styling**

Add:

```css
.section-eyebrow {
  margin: 0 0 20px;
  font-size: 12px;
  letter-spacing: 0.28em;
  text-transform: uppercase;
  color: var(--muted);
}

.section-title {
  max-width: 10ch;
  margin: 0;
  font-family: var(--title-font);
  font-size: clamp(3rem, 7vw, 7rem);
  line-height: 0.95;
  letter-spacing: -0.05em;
}

.section-summary,
.section-detail {
  max-width: 34rem;
}

.section-summary {
  margin: 28px 0 0;
  font-size: clamp(1rem, 1.4vw, 1.25rem);
  line-height: 1.6;
  color: var(--muted);
}
```

- [ ] **Step 4: Verify the CSS establishes the intended visual direction**

Run: `rg -n ":root|\\.deck-section|\\.section-title|backdrop-filter|radial-gradient" docs/assets/product-deck.css`

Expected:

- root design tokens exist
- the layout uses slide-like sections
- the title scale is large and presentation-led
- the background is layered but still flat and restrained

- [ ] **Step 5: Commit the visual system**

Run: `git add docs/assets/product-deck.css docs/index.html`

Run: `git commit -m "feat: add product deck visual system"`

Expected: a commit that introduces the layout, typography, and base visual styling

### Task 3: Implement hover reveal, tap fallback, and language switching

**Files:**
- Modify: `docs/assets/product-deck.js`
- Modify: `docs/assets/product-deck.css`

- [ ] **Step 1: Add a single-active-section interaction model**

Extend `docs/assets/product-deck.js` with:

```js
function setActiveSection(sectionId) {
  activeSectionId = sectionId;

  document.querySelectorAll(".deck-section").forEach((section) => {
    const isActive = section.dataset.sectionId === sectionId;
    section.classList.toggle("is-active", isActive);
    section.querySelector(".section-detail")?.setAttribute("aria-hidden", String(!isActive));
  });
}

function wireSectionInteractions() {
  const sections = document.querySelectorAll(".deck-section");

  sections.forEach((section) => {
    const id = section.dataset.sectionId;

    section.addEventListener("mouseenter", () => setActiveSection(id));
    section.addEventListener("focusin", () => setActiveSection(id));
    section.addEventListener("click", () => {
      if (window.matchMedia("(hover: none)").matches) {
        setActiveSection(activeSectionId === id ? null : id);
      }
    });
  });
}
```

- [ ] **Step 2: Add language toggle state and rerender logic**

Add:

```js
function updateLangToggle() {
  const isZh = currentLang === "zh";
  langToggle.setAttribute("aria-pressed", String(isZh));
  langToggle.dataset.lang = currentLang;
}

langToggle.addEventListener("click", () => {
  currentLang = currentLang === "en" ? "zh" : "en";
  const previouslyActive = activeSectionId;
  renderDeck(currentLang);
  wireSectionInteractions();
  updateLangToggle();
  if (previouslyActive) {
    setActiveSection(previouslyActive);
  }
});

wireSectionInteractions();
updateLangToggle();
```

- [ ] **Step 3: Animate the reveal layer so it feels fluid instead of abrupt**

Add this to `docs/assets/product-deck.css`:

```css
.section-detail {
  margin-top: 18px;
  max-height: 0;
  opacity: 0;
  overflow: hidden;
  transform: translateY(14px);
  transition:
    max-height var(--transition-slow),
    opacity var(--transition-fast),
    transform var(--transition-fast);
}

.deck-section.is-active .section-detail,
.deck-section:focus-within .section-detail {
  max-height: 240px;
  opacity: 1;
  transform: translateY(0);
}

.deck-section .section-frame {
  transition:
    transform var(--transition-fast),
    border-color var(--transition-fast),
    background-color var(--transition-fast);
}

.deck-section.is-active .section-frame,
.deck-section:hover .section-frame,
.deck-section:focus-within .section-frame {
  transform: translateY(-4px);
  border-color: rgba(181, 82, 51, 0.36);
}
```

- [ ] **Step 4: Add mobile-safe fallback behavior in CSS**

Add:

```css
@media (hover: none) {
  .deck-section {
    min-height: auto;
    padding: 18px 0;
  }

  .deck-section.is-active .section-detail {
    max-height: 320px;
  }
}
```

- [ ] **Step 5: Verify interaction wiring without a browser build system**

Run: `rg -n "setActiveSection|wireSectionInteractions|langToggle|is-active|@media \\(hover: none\\)" docs/assets/product-deck.js docs/assets/product-deck.css`

Expected:

- JavaScript has a single active-section state path
- the language toggle rerenders and restores the active section
- CSS includes animated reveal states and a mobile fallback

- [ ] **Step 6: Commit the interaction layer**

Run: `git add docs/assets/product-deck.js docs/assets/product-deck.css`

Run: `git commit -m "feat: add deck interactions and bilingual toggle"`

Expected: a commit that introduces hover/tap reveal plus full-language switching

### Task 4: Add scroll-state motion and polish the presentation feel

**Files:**
- Modify: `docs/assets/product-deck.js`
- Modify: `docs/assets/product-deck.css`

- [ ] **Step 1: Add scroll-based activation using IntersectionObserver**

Extend `docs/assets/product-deck.js` with:

```js
function wireScrollObserver() {
  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

      if (!visible || document.activeElement?.closest(".deck-section")) {
        return;
      }

      setActiveSection(visible.target.dataset.sectionId);
    },
    {
      threshold: [0.35, 0.6, 0.8]
    }
  );

  document.querySelectorAll(".deck-section").forEach((section) => observer.observe(section));
}

wireScrollObserver();
```

- [ ] **Step 2: Add entrance motion so sections feel alive on scroll**

Add:

```css
.deck-section {
  opacity: 0.42;
  transform: translateY(28px);
  transition:
    opacity var(--transition-slow),
    transform var(--transition-slow);
}

.deck-section.is-active,
.deck-section:hover,
.deck-section:focus-within {
  opacity: 1;
  transform: translateY(0);
}

.section-title,
.section-summary,
.section-detail {
  will-change: transform, opacity;
}
```

- [ ] **Step 3: Add subtle structure accents without leaving the flat style**

Add:

```css
.section-frame::before,
.section-frame::after {
  content: "";
  position: absolute;
  pointer-events: none;
}

.section-frame::before {
  inset: 20px 20px auto auto;
  width: 88px;
  height: 88px;
  border-top: 1px solid var(--line);
  border-right: 1px solid var(--line);
}

.section-frame::after {
  inset: auto auto 20px 20px;
  width: 120px;
  height: 1px;
  background: linear-gradient(90deg, rgba(181, 82, 51, 0.3), transparent);
}
```

- [ ] **Step 4: Verify the presentation still stays low-density**

Run: `rg -n "IntersectionObserver|section-frame::before|opacity: 0.42|transform: translateY\\(28px\\)" docs/assets/product-deck.js docs/assets/product-deck.css`

Expected:

- JavaScript adds scroll-state activation
- CSS includes lightweight entrance motion
- accents remain line-based rather than dense decorative components

- [ ] **Step 5: Commit the motion polish**

Run: `git add docs/assets/product-deck.js docs/assets/product-deck.css`

Run: `git commit -m "feat: polish product deck motion"`

Expected: a commit that makes the page feel like a smooth interactive presentation

### Task 5: Verify the final page and connect it cleanly to the repo

**Files:**
- Modify: `README.md`
- Verify: `docs/index.html`
- Verify: `docs/assets/product-deck.css`
- Verify: `docs/assets/product-deck-content.js`
- Verify: `docs/assets/product-deck.js`

- [ ] **Step 1: Add a lightweight README entrypoint to the GitHub Pages page**

Add this near the top-level orientation area in `README.md`:

```md
## Product page

The GitHub Pages product deck lives in [`docs/index.html`](docs/index.html) and is designed as a bilingual, scroll-driven introduction to `claw-kit`.
```

- [ ] **Step 2: Run a static sanity sweep over the final file set**

Run: `rg -n "lang-toggle|product-deck-content|project-override|writer skill|custom harness|docs/index.html" README.md docs/index.html docs/assets/product-deck.css docs/assets/product-deck-content.js docs/assets/product-deck.js`

Expected:

- README points to the page
- the page includes the bilingual toggle
- the advanced-features section includes project override, templates, planning skills, writer skills, and custom harness compatibility

- [ ] **Step 3: Open the page locally and manually verify the core interactions**

Open `docs/index.html` in the browser or local preview and verify:

- desktop hover reveals section details without clicking
- mobile emulation still allows tap-to-reveal
- only one language is visible at a time
- language switching updates all sections
- the advanced-features panel reads naturally in both languages
- the page feels like a vertical product deck rather than a documentation page

- [ ] **Step 4: Review the final diff scope**

Run: `git diff -- README.md docs/index.html docs/assets/product-deck.css docs/assets/product-deck-content.js docs/assets/product-deck.js`

Expected:

- only the page entrypoint and the new static site files changed
- no package runtime or adapter implementation files were touched

- [ ] **Step 5: Commit the completed GitHub Pages page**

Run: `git add README.md docs/index.html docs/assets/product-deck.css docs/assets/product-deck-content.js docs/assets/product-deck.js`

Run: `git commit -m "feat: add GitHub Pages product deck"`

Expected: a final commit containing the bilingual GitHub Pages experience and README entrypoint
