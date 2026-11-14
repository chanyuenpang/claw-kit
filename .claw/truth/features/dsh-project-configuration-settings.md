# DSH project configuration settings

<!-- state: current -->
## Current behavior

- The DSH Settings root exposes a `Claw Kit` section. It lists registered workspaces containing `.claw/project.json`; the user selects a project and one edit scope (personal by default, or team). The page displays one value per setting, not parallel team/personal/effective columns. Personal absence follows the effective team value and is marked as team-inherited; only an existing personal override offers restore.
- Team values are stored only in the selected project’s `.claw/project.json`; personal values are stored only in its `.claw/project-override.json`. The UI does not write DSH global settings or create another configuration source.
- The browser calls only `/claw-project-config` endpoints with `workspaceId`, layer, approved key path, JSON value where applicable, and the layer revision. It never supplies a filesystem path. On initial mount it reads the project list once, and a manual refresh action can recover a transient registry-unavailable response without replaying a write.
- The Host resolves `workspaceId` through the DSH workspace registry (using the DSH 0.2 direct `get()` lookup when available and retaining the older list fallback), requires the resolved directory to contain `.claw/project.json`, rejects unknown fields and non-`team`/`personal` layers, and invokes `claw config get|set|unset` from that resolved directory. RPC failures include the DSH 0.2-required `error.details` object.
- Core owns layer reads, effective merge, approved key-path validation, JSON validation, schema validation, optimistic revision checks, and atomic writes. The CLI only exposes this contract; the DSH adapter remains a narrow workspace-authorizing bridge.
- Each editable layer has its own revision. A stale save or unset fails rather than overwriting a newer layer value; changing an inherited value writes only to the selected edit layer.
- The common settings are grouped under Workflow (4 keys), Knowledge writer (2), and Documents (3). `autoUpdate` and `contextPaths`, which currently have no active DSH behavior, are in a collapsed Advanced section. Each row shows a short Chinese label, its English key, and one direct control; detailed help expands on demand. Brief warnings remain for archive pruning and possible GitNexus installation.
- Switches and effort selectors submit immediately. Text and number values use an explicit Enter/confirm action and Escape cancels; path lists are summarized until edited and save with Ctrl/⌘+Enter or the confirm control. Empty `knowledgeWriter.model` saves explicit `null`, not absence/inheritance. Personal restore unsets only that key; it is shown only when a personal override exists.
- On accepted writes, the UI consumes Core's returned full snapshot to update values and layer revisions without a follow-up read. A stale-revision conflict retains the draft and original revision; it never silently rebases or retries. Drafts are keyed by workspace/layer/key. A response with unknown/committed/partial outcome pauses only that setting until explicit reload, avoiding replay; reload refreshes sibling values because revisions belong to a whole layer. Reads from an obsolete workspace generation are ignored.
- Labels, explanatory text and status are Chinese; English configuration keys remain visible. Responsive layout and dark-mode styling support narrow layouts.
- The DSH bridge treats `runConfig` process success/failure as authoritative. Successful `claw config` output is a direct JSON configuration snapshot, not a workflow `ok` envelope; only malformed JSON is translated to `PROJECT_CONFIG_RESPONSE_INVALID`. Errors retain safe structured code and phase without retrying writes.
- Local Desktop development tarballs use `@veewo/dsh-claw-kit-dev` consistently across `package.json`, the bundle patch module name, and the browser `ModuleLoader` factory ID. The dev exporter rewrites these three identity surfaces together; changing only the manifest or Host row makes DSH reload the unmatched script and fail on duplicate production-factory registration.

## Implementation anchors

- `packages/core/src/project-config.ts`
- `packages/core/src/project-check.ts`
- `packages/cli/src/cli.ts`
- `packages/dsh-adapter/src/index.ts`
- `packages/dsh-adapter/src/project-config-rpc.ts`
- `packages/dsh-adapter/client.js` (settings UI labels, help, status, and inheritance/edit actions)
- `packages/dsh-adapter/lib/client.js` (generated client copy; kept aligned with the source)
- `packages/dsh-adapter/test/project-config-rpc.test.mjs`
- `scripts/export-dsh-dev-plugin.mjs`
- `scripts/dsh-dev-plugin-bundle.test.mjs`

## Verification boundary

The settings client and generated `lib/client.js` copy were reviewed as matching. The latest UI work was checked in a real React 19 browser preview with mocked RPC, including direct edits, inheritance/restore, null, drafts/conflicts, unknown outcomes, and workspace changes; 8 CLI RPC regression cases, syntax/diff checks, 1200px desktop and 390px dark narrow-layout previews were reported passing. These checks do not establish that a newly packaged plugin was installed or that the current DSH profile has applied the source changes.

<!-- state: history -->
## Evolution history

<!-- dated: 2026-11-14 -->
### Simplified the settings surface and direct-edit flow

Earlier DSH settings displayed separate team, personal, and effective values and required entering per-cell edit mode. The current UI instead uses one scope selector and a single visible value per row, with direct controls, progressive help, and an advanced section for inactive compatibility keys. The completed change was not packaged, installed, or published.
