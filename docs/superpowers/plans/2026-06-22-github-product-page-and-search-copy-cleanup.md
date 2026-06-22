# GitHub Product Page And Search Copy Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shorten the GitHub-facing `search and recall` copy and tighten the product explanation in the root README and CLI README without changing any plugin-specific materials.

**Architecture:** Keep this round README-only. The root README should act as the product page, while the CLI README should keep only the minimum workflow boundary needed for package readers. Detailed config or adapter-specific backup docs remain untouched.

**Tech Stack:** Markdown docs, repo-relative links, claw planning workflow

---

### Task 1: Correct the plan boundary

**Files:**
- Modify: `docs/superpowers/specs/2026-06-22-config-entrypoints-and-search-copy-design.md`
- Modify: `.claw/tasks/压缩-search-and-recall-文案并把配置知识沉到插件文档/plan.json`

- [ ] **Step 1: Rewrite the design boundary**

Make the design say:

- this round is about GitHub-facing product explanation
- the target files are only `README.md` and `packages/cli/README.md`
- plugin-specific files are out of scope

- [ ] **Step 2: Sync the claw plan**

Make sure the active claw plan says:

- remove the long root `search and recall` section
- keep only a short CLI explanation
- do not touch plugin or adapter directories

- [ ] **Step 3: Move the plan into active execution**

Run:

```bash
claw plan edit --task "压缩-search-and-recall-文案并把配置知识沉到插件文档" --plan-status process.active
```

Expected: `planStatus` reports `process.active`.

### Task 2: Rewrite the GitHub-facing copy

**Files:**
- Modify: `README.md`
- Modify: `packages/cli/README.md`

- [ ] **Step 1: Remove the long root search section**

Delete the current `## Search and recall` section from `README.md`.

- [ ] **Step 2: Keep only the minimum root-level guidance**

Leave concise product-facing wording that:

- keeps the plan/workflow story
- does not expand into a long search tutorial
- keeps configuration mention minimal

- [ ] **Step 3: Compress the CLI README search explanation**

Replace the long CLI `Search and recall` section with a much shorter explanation that says:

- `claw search` is the project recall command
- it is for project docs and retained truth/ADR context, not code search
- GitNexus can help when deeper code investigation is needed

- [ ] **Step 4: Preserve the product page framing**

Make sure both files still emphasize:

- plan before execute
- reusable truth and ADR
- longer-running task support
- optional GitNexus complement

### Task 3: Verify and close out

**Files:**
- Verify: `README.md`
- Verify: `packages/cli/README.md`

- [ ] **Step 1: Verify the public diff**

Run:

```bash
git diff -- README.md packages/cli/README.md
```

Expected: the diff is shorter, more product-oriented, and no longer contains the long root search section.

- [ ] **Step 2: Verify plugin directories stayed untouched**

Run:

```bash
git diff --name-only
```

Expected: no files under `packages/codex-adapter/` or `packages/opencode-adapter/` appear in this round.

- [ ] **Step 3: Update the claw task**

Run:

```bash
claw plan edit --task "压缩-search-and-recall-文案并把配置知识沉到插件文档" --task-id 1 --task-status done
claw plan edit --task "压缩-search-and-recall-文案并把配置知识沉到插件文档" --task-id 2 --task-status done
claw plan edit --task "压缩-search-and-recall-文案并把配置知识沉到插件文档" --task-id 3 --task-status done
```

- [ ] **Step 4: Follow closeout guidance**

Use returned `workflowGuidance` for truth/ADR deposition and `claw plan done`.
