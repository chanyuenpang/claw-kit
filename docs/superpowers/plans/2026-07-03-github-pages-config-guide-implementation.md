# GitHub Pages Config Guide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new bilingual GitHub Pages page under `docs/` that introduces every configurable `.claw/project.json` field in a product-page style, then connect the new page from the final navigation link on the existing homepage.

**Architecture:** Keep the GitHub Pages surface zero-build and static. Reuse the current site's visual language and shared product-deck assets where possible, but give the config guide its own HTML entrypoint and content model so the page can be more information-dense than the homepage without collapsing into a reference manual.

**Tech Stack:** HTML, CSS, vanilla JavaScript, GitHub Pages static hosting

---

### Task 1: Define the page shell, navigation entry, and bilingual content model

**Files:**
- Create: `docs/config-guide.html`
- Create: `docs/assets/config-guide-content.js`
- Modify: `docs/assets/product-deck-content.js`
- Modify: `scripts/product-deck.test.mjs`

- [ ] **Step 1: Create a dedicated static entrypoint for the config guide page**

Build `docs/config-guide.html` as a standalone bilingual page with:

- a top bar that links back to `./index.html`
- the same language toggle shape used by the product deck
- one main content mount node for config-guide rendering
- a `<title>` and description focused on `.claw/project.json`

- [ ] **Step 2: Add a dedicated bilingual content module for the new page**

Create `docs/assets/config-guide-content.js` with structured sections for:

- hero positioning
- shared/team config model
- local override model
- memory and recall model
- field cards for every supported `.claw/project.json` field
- short example snippets
- closing links to `docs/project-json-reference.md`

The field-card set must cover:

- `id`
- `name`
- `maxTasksToKeep`
- `planning`
- `goalMode`
- `truthDispatch`
- `defaultPlanTemplate`
- `contextPaths`
- `externalPlanningSkill`
- `externalTruthSkill`
- `externalAdrSkill`
- `memory.externalDocPaths`
- `memory.embedding`
- `gitnexus`

- [ ] **Step 3: Change the homepage final link to point to the new page**

Update the closing section in `docs/assets/product-deck-content.js` so the last link becomes:

- English: `Config guide`
- Chinese: `配置说明`
- href: `./config-guide.html`

Keep the other closing links intact unless the page layout forces a reorder.

- [ ] **Step 4: Extend tests to lock the new navigation contract**

Update `scripts/product-deck.test.mjs` so it asserts that:

- the final homepage closing link points to `./config-guide.html`
- both English and Chinese labels render correctly

### Task 2: Build the config guide layout and field-card presentation

**Files:**
- Create: `docs/assets/config-guide.js`
- Create: `docs/assets/config-guide.css`
- Verify: `docs/config-guide.html`

- [ ] **Step 1: Render the new page from content instead of hardcoding bilingual HTML**

Implement `docs/assets/config-guide.js` to:

- import `configGuideContent`
- manage the same `en` / `zh` toggle pattern as the homepage
- render sections from structured data
- support a denser card grid for field explanations
- keep markup semantic and scan-friendly

- [ ] **Step 2: Reuse the site mood while shifting to a denser reading mode**

Implement `docs/assets/config-guide.css` with:

- the same broad tone as the product deck
- flatter cards and tighter vertical rhythm than `index.html`
- a clear distinction between conceptual sections and per-field cards
- mobile-safe stacking for long field lists

- [ ] **Step 3: Make the page product-led, not reference-led**

The visual hierarchy should feel like:

- large positioning statement first
- model explanation second
- field cards third
- examples and next steps last

Avoid turning the page into a plain markdown document or a giant JSON dump.

### Task 3: Write productized copy for every field and add scenario snippets

**Files:**
- Modify: `docs/assets/config-guide-content.js`
- Verify: `docs/project-json-reference.md`

- [ ] **Step 1: Write short field copy with a consistent structure**

For each field card, explain:

- what the field controls
- what the default or common behavior is
- when a team would change it

Keep each card short enough to skim in the browser.

- [ ] **Step 2: Keep deeper edge cases in the canonical reference doc**

Do not duplicate all of `docs/project-json-reference.md`. Instead:

- summarize collaboration boundaries
- summarize workflow behavior
- summarize memory/embedding intent
- leave full override semantics, null behavior, and advanced examples to the reference doc

- [ ] **Step 3: Add compact scenario snippets**

Include 2-3 small bilingual examples for:

- minimal team baseline
- personal override
- docs recall / memory configuration

### Task 4: Verify static behavior, copy coverage, and diff safety

**Files:**
- Verify: `docs/config-guide.html`
- Verify: `docs/assets/config-guide-content.js`
- Verify: `docs/assets/config-guide.js`
- Verify: `docs/assets/config-guide.css`
- Verify: `docs/assets/product-deck-content.js`
- Verify: `scripts/product-deck.test.mjs`

- [ ] **Step 1: Add a focused test or test expansion for config-guide structure**

Prefer a lightweight script-level test that checks:

- config-guide entrypoint references the new CSS and JS files
- the content model includes every required field key
- homepage navigation now links to the new page

- [ ] **Step 2: Run targeted verification**

Run at least:

- `node --test .\\scripts\\product-deck.test.mjs`

If a new focused test file is added, run it too.

- [ ] **Step 3: Manually preview the page**

Open `docs/config-guide.html` locally and confirm:

- homepage link reaches the new page
- language toggle switches the whole page
- field cards remain readable on desktop and mobile widths
- the page feels like a product explainer with actionable config understanding

- [ ] **Step 4: Review final diff scope**

Confirm the diff stays limited to:

- the new config-guide files
- homepage content/navigation changes
- targeted tests

No package runtime, CLI, adapter, or `.claw/truth` files should be touched as part of this page task.

### Task 5: Close out with repo-facing entrypoints and workflow alignment

**Files:**
- Optional Modify: `README.md`
- Verify: `.claw/tasks/GitHub-Pages-配置说明页/plan.json`

- [ ] **Step 1: Decide whether README needs a second GitHub Pages entrypoint**

Only add a README mention if it helps users discover the new config guide without cluttering the top-level doc.

- [ ] **Step 2: Sync execution state back into the claw task**

Before implementation starts:

- append executable tasks into the `.claw` plan
- move the root plan from `process.discussing` to `process.active`
- start Goal Mode if the returned workflow guidance still requires it

- [ ] **Step 3: Keep closeout ready**

When implementation finishes, the closeout must include:

- targeted verification evidence
- any repo docs that should ship with the page
- truth/ADR deposition only if the work produces reusable workflow knowledge beyond this one page
