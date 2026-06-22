# GitNexus Positioning And README Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the GitHub-facing docs so `claw-kit` explains its optional relationship to GitNexus, highlights separate strengths around harness/skill interoperability and long-running plan structure, and removes publish workflow steps from the root README.

**Architecture:** Keep the change doc-only and layer-specific. The root README carries concise product positioning, the CLI README explains practical workflow boundaries, and the `project.json` reference keeps `gitnexus.enabled` framed as an optional integration switch with compact factual wording.

**Tech Stack:** Markdown docs, `claw` planning workflow, repo-relative links

---

### Task 1: Refresh the plan artifacts

**Files:**
- Modify: `docs/superpowers/specs/2026-06-22-gitnexus-positioning-design.md`
- Modify: `.claw/tasks/补充-GitNexus-关系说明并清理-README-发布流程/plan.json`

- [ ] **Step 1: Fold the latest product positioning into the design spec**

Update the spec so it includes all three approved messaging points:

- GitNexus is an optional complement, not a requirement
- working with other harnesses or skills is a separate advantage
- the plan structure is better suited to longer-running tasks

- [ ] **Step 2: Sync the active claw plan with the approved scope**

Make sure the active `.claw` plan captures:

- the three target docs
- the README publish-flow removal
- the three acceptance checks for GitNexus wording, separate advantages, and cleanup scope

- [ ] **Step 3: Move the plan into active execution**

Run:

```bash
claw plan edit --task "补充-GitNexus-关系说明并清理-README-发布流程" --plan-status process.active
```

Expected: `planStatus` reports `process.active` and task `#1` becomes the active next task.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-06-22-gitnexus-positioning-design.md .claw/tasks/补充-GitNexus-关系说明并清理-README-发布流程/plan.json
git commit -m "docs: plan gitnexus positioning updates"
```

### Task 2: Update the root README positioning

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Revise the GitHub-facing product positioning**

Add or refine concise copy that says:

- `claw-kit` owns project-level workflow, planning, knowledge capture, and closeout
- GitNexus can help with deeper code investigation and relationship tracing
- GitNexus is optional

- [ ] **Step 2: Add separate strengths outside the GitNexus paragraph**

Add distinct README bullets or short subsections for:

- working with other harnesses or skills
- the plan structure being better suited to longer-running work

- [ ] **Step 3: Remove publish workflow steps from the README**

Delete the release or publish procedure section from the root README and keep only a short doc pointer if needed, for example to `DISTRIBUTION.md`.

- [ ] **Step 4: Check the README diff for tone and scope**

Run:

```bash
git diff -- README.md
```

Expected: the diff stays positioning-focused, keeps repo-relative links, and no longer includes the publish workflow steps.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: refine README positioning"
```

### Task 3: Update the CLI README and project config guide

**Files:**
- Modify: `packages/cli/README.md`
- Modify: `docs/project-json-reference.md`

- [ ] **Step 1: Clarify the workflow boundary in the CLI README**

Add or refine wording that tells readers:

- use `claw` for project workflow and project recall
- use GitNexus when deeper code investigation is useful
- GitNexus is still optional

- [ ] **Step 2: Surface the long-running-task value in the CLI README**

Add a short workflow-oriented sentence that explains the `.claw` plan structure helps agents carry multi-step or longer-running work more cleanly.

- [ ] **Step 3: Clarify `gitnexus.enabled` in the project config guide**

Keep the config reference compact and factual while making it clear that:

- `gitnexus.enabled` is an optional integration switch
- projects can use `claw-kit` without enabling GitNexus

- [ ] **Step 4: Mention the broader interoperability advantage in the right place**

If it fits naturally, add one concise sentence that `claw-kit` can still work alongside other harnesses, external skills, and adjacent tooling, without turning the config page into marketing copy.

- [ ] **Step 5: Inspect the targeted diff**

Run:

```bash
git diff -- packages/cli/README.md docs/project-json-reference.md
```

Expected: both docs align with the README language, and neither file implies GitNexus is mandatory.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/README.md docs/project-json-reference.md
git commit -m "docs: clarify gitnexus and workflow advantages"
```

### Task 4: Verify, deposit, and close out

**Files:**
- Verify: `README.md`
- Verify: `packages/cli/README.md`
- Verify: `docs/project-json-reference.md`
- Verify: `.claw/tasks/补充-GitNexus-关系说明并清理-README-发布流程/plan.json`

- [ ] **Step 1: Verify the final doc state**

Run:

```bash
rg -n "GitNexus|gitnexus|harness|skill|longer-running|long-running|publish workflow|DISTRIBUTION" README.md packages/cli/README.md docs/project-json-reference.md
```

Expected:

- GitNexus wording appears in all three target docs
- interoperability wording appears as a separate point
- long-running-task wording appears as a separate point
- the root README no longer includes the old publish workflow steps

- [ ] **Step 2: Review the final scope**

Run:

```bash
git diff -- README.md packages/cli/README.md docs/project-json-reference.md docs/superpowers/specs/2026-06-22-gitnexus-positioning-design.md docs/superpowers/plans/2026-06-22-gitnexus-positioning-and-readme-cleanup.md
```

Expected: only the approved positioning/spec/plan artifacts are touched for this round.

- [ ] **Step 3: Update the claw task status**

Run:

```bash
claw plan edit --task "补充-GitNexus-关系说明并清理-README-发布流程" --task-id 1 --task-status done
claw plan edit --task "补充-GitNexus-关系说明并清理-README-发布流程" --task-id 2 --task-status done
claw plan edit --task "补充-GitNexus-关系说明并清理-README-发布流程" --task-id 3 --task-status done
```

Expected: the plan reaches `3/3` and returns closeout guidance.

- [ ] **Step 4: Close out with truth and ADR if required**

Follow returned `workflowGuidance`, including any required `truth-writer` and `adr-writer` delegation, then archive the plan with `claw plan done`.

- [ ] **Step 5: Commit**

```bash
git add README.md packages/cli/README.md docs/project-json-reference.md docs/superpowers/specs/2026-06-22-gitnexus-positioning-design.md docs/superpowers/plans/2026-06-22-gitnexus-positioning-and-readme-cleanup.md .claw
git commit -m "docs: clarify gitnexus positioning"
```
