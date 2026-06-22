# Codex Plugin Distribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a formal export and install path for the Codex plugin so users can install it from this repository without relying on maintainer-local cache copy steps.

**Architecture:** Keep `packages/codex-adapter` as the single source of truth. Add a small Node module that knows how to enumerate, export, and install the plugin payload, then call it from thin scripts and document the supported entrypoints.

**Tech Stack:** Node.js, PowerShell, npm workspaces, node:test

---

### Task 1: Add codex plugin distribution tests

**Files:**
- Create: `scripts/codex-plugin-bundle.test.mjs`

- [ ] Write failing tests for payload listing, export, and install.
- [ ] Run `node --test scripts/codex-plugin-bundle.test.mjs` and confirm the module is missing.

### Task 2: Implement codex plugin bundle helpers

**Files:**
- Create: `scripts/codex-plugin-bundle.mjs`

- [ ] Implement helpers that read the adapter manifest, copy the expected payload, and install a versioned cache directory.
- [ ] Re-run `node --test scripts/codex-plugin-bundle.test.mjs` until the tests pass.

### Task 3: Expose supported entrypoints

**Files:**
- Modify: `package.json`
- Create: `scripts/export-codex-plugin.mjs`
- Create: `scripts/install-codex-plugin.ps1`

- [ ] Add npm scripts for export and install.
- [ ] Add thin entry scripts that call the tested helper module.
- [ ] Run the targeted tests again after wiring the entrypoints.

### Task 4: Document the new distribution path

**Files:**
- Modify: `README.md`
- Modify: `DISTRIBUTION.md`

- [ ] Document the difference between CLI install and Codex plugin install.
- [ ] Add the new export/install commands and expected output locations.
- [ ] Run targeted verification commands for tests plus real export/install smoke checks.
