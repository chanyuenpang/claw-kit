# GitHub Positioning And Project Config Docs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reframe `claw-kit`'s public GitHub and package-facing documentation so visitors immediately understand the product positioning, the `.claw` workflow model, and how to configure `project.json`.

**Architecture:** Use the root `README.md` as the top-level product and workflow entrypoint, then align package READMEs and package metadata so each package reinforces the same story from its own surface. Expand the existing Codex adapter config reference into the canonical `project.json` explanation and link to it from the homepage so the docs hierarchy stays consistent instead of duplicating field-level guidance everywhere.

**Tech Stack:** Markdown, npm package metadata, `.claw` task workflow

---

### Task 1: Map documentation responsibilities

**Files:**
- Modify: `README.md`
- Modify: `packages/cli/README.md`
- Modify: `packages/core/README.md`
- Modify: `packages/codex-adapter/references/project-config-reference.md`
- Modify: `packages/cli/package.json`
- Modify: `packages/core/package.json`
- Modify: `packages/codex-adapter/package.json`
- Modify: `packages/openclaw-adapter/package.json`

- [ ] **Step 1: Confirm each surface's job**

Map the documentation responsibilities before editing:

- `README.md`: product positioning, capability overview, `.claw` workflow sketch, quick-start branching, package map, and links onward
- `packages/cli/README.md`: CLI-user entrypoint with install, setup, and why the CLI exists in the workflow
- `packages/core/README.md`: library role inside the workflow stack
- `packages/codex-adapter/references/project-config-reference.md`: canonical operator guide for `.claw/project.json`
- `package.json` files: short searchable descriptions plus keywords and repository metadata

- [ ] **Step 2: Keep scope bounded**

Do not change implementation files or reshape the live workflow contract in this round. Only adjust docs and metadata so they describe the current schema and workflow accurately.

### Task 2: Rewrite the root GitHub entrypoint

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace the opening with product-first positioning**

Write the opening so it leads with these ideas:

```md
# claw-kit

`claw-kit` is an agent-facing, project-level workflow and knowledge capture toolkit.

It turns `.claw` into a practical working surface for planning work, recalling prior project knowledge, depositing truth and ADR notes, and closing tasks out cleanly.
```

- [ ] **Step 2: Add a compact capability overview**

Include short bullets covering:

```md
- Project-scoped planning and task lifecycle around `.claw`
- Truth and ADR deposition so project knowledge survives across sessions
- Recall-oriented search over project docs before deeper investigation
- Closeout workflows that keep task state, notes, and follow-up decisions aligned
```

- [ ] **Step 3: Add a concise “how it works” workflow section**

Describe the workflow in a short, readable sequence:

```md
## How `.claw` workflow lands in practice

In a typical round, `claw-kit` helps an agent move from task framing to closeout through a repeatable loop:

`plan` -> `search and recall` -> `execute` -> `deposit truth / ADR` -> `close out`
```

Clarify that planning, truth/ADR, search, and closeout are the concrete mechanisms behind the higher-level positioning.

- [ ] **Step 4: Add reader branching**

Provide two entry paths:

```md
## Where to start

- Want to use the CLI in a project? Start with the install and setup section below.
- Want to understand adapters and integration surfaces? Jump to the package map.
- Want to configure project behavior? Read the `project.json` config guide.
```

### Task 3: Align package READMEs with the new story

**Files:**
- Modify: `packages/cli/README.md`
- Modify: `packages/core/README.md`

- [ ] **Step 1: Reframe the CLI README for users**

Make the CLI README open with why the CLI exists:

```md
# @veewo/claw

`@veewo/claw` is the CLI entrypoint for running the `.claw` workflow in a project: planning work, recalling project knowledge, depositing truth, and closing rounds out cleanly.
```

- [ ] **Step 2: Keep setup concise but accurate**

Preserve the install and `claw context` / `claw search index --refresh` guidance, but move it below the positioning and workflow explanation.

- [ ] **Step 3: Reframe the core README**

Make the core README describe `@veewo/claw-core` as the workflow engine and shared primitives layer instead of a generic library blurb.

### Task 4: Align package metadata and config reference

**Files:**
- Modify: `packages/cli/package.json`
- Modify: `packages/core/package.json`
- Modify: `packages/codex-adapter/package.json`
- Modify: `packages/openclaw-adapter/package.json`
- Modify: `packages/codex-adapter/references/project-config-reference.md`

- [ ] **Step 1: Expand searchable metadata**

Add or refine package metadata so it includes:

```json
{
  "description": "..."
}
```

and, where missing, fields such as:

```json
{
  "homepage": "https://github.com/chanyuenpang/claw-kit",
  "repository": {
    "type": "git",
    "url": "https://github.com/chanyuenpang/claw-kit.git",
    "directory": "packages/..."
  },
  "keywords": ["claw", ".claw", "agent-workflow", "knowledge-capture"]
}
```

- [ ] **Step 2: Turn the config reference into a discoverable guide**

Update the config reference to clearly cover:

```md
- what `.claw/project.json` is for
- how `.claw/project-override.json` changes runtime behavior
- the key fields users are likely to edit first
- copyable examples for local embeddings, external docs, workflow toggles, and writer overrides
```

- [ ] **Step 3: Link the config guide from the root README**

Ensure the homepage points readers to the config guide instead of duplicating every field explanation inline.

### Task 5: Verify consistency

**Files:**
- Modify: `README.md`
- Modify: `packages/cli/README.md`
- Modify: `packages/core/README.md`
- Modify: `packages/codex-adapter/references/project-config-reference.md`
- Modify: `packages/cli/package.json`
- Modify: `packages/core/package.json`
- Modify: `packages/codex-adapter/package.json`
- Modify: `packages/openclaw-adapter/package.json`

- [ ] **Step 1: Re-read the docs as a first-time visitor**

Check that the order answers these questions in sequence:

1. What is `claw-kit`?
2. How does it work through `.claw`?
3. Where do I start?
4. Where do I configure it?

- [ ] **Step 2: Validate metadata and links**

Run:

```powershell
npm pkg get description keywords homepage repository -w @veewo/claw
npm pkg get description keywords homepage repository -w @veewo/claw-core
```

Expected:

- JSON output contains the new descriptions and keywords
- repository directories still point at the correct package folders

- [ ] **Step 3: Commit only the relevant doc and metadata files**

Stage only the documentation and package metadata changes from this round. Do not mix in unrelated existing workspace edits.
