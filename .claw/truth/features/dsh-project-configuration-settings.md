# DSH project configuration settings

<!-- state: current -->
## Current behavior

- The DSH Settings root exposes a `Claw Kit` section. It lists registered workspaces that contain `.claw/project.json`, lets the user select one, and shows separate team, personal, and effective values for approved configuration key paths.
- Team values are stored only in the selected project’s `.claw/project.json`; personal values are stored only in its `.claw/project-override.json`. The UI does not write DSH global settings or create another configuration source.
- The browser calls only `/claw-project-config` endpoints with `workspaceId`, layer, approved key path, JSON value where applicable, and the layer revision. It never supplies a filesystem path. On initial mount it retries the project-list request across the DSH startup window, and it exposes a manual refresh action instead of leaving a transient registry-unavailable response stuck for the lifetime of the settings page.
- The Host resolves `workspaceId` through the DSH workspace registry (using the DSH 0.2 direct `get()` lookup when available and retaining the older list fallback), requires the resolved directory to contain `.claw/project.json`, rejects unknown fields and non-`team`/`personal` layers, and invokes `claw config get|set|unset` from that resolved directory. RPC failures include the DSH 0.2-required `error.details` object.
- Core owns layer reads, effective merge, approved key-path validation, JSON validation, schema validation, optimistic revision checks, and atomic writes. The CLI only exposes this contract; the DSH adapter remains a narrow workspace-authorizing bridge.
- Each editable layer has its own revision. A stale save or unset fails rather than overwriting a newer layer value; effective values are displayed read-only.
- The section groups approved keys under Workflow, Knowledge writer, and Memory. Values are read-only until one team or personal cell enters edit mode; only that cell shows Apply and Cancel, rather than exposing a page-level save or raw project JSON editor.
- A personal cell with no override clearly shows its inherited effective value. Restore inheritance invokes `unset`; explicit `null` is a separately selectable persisted override rather than inherited absence.
- On a revision conflict, the client retains the draft, refreshes the cell revision, and asks the user to review and apply again. It does not silently overwrite the newer value; stale workspace responses are ignored.
- Local Desktop development tarballs use `@veewo/dsh-claw-kit-dev` consistently across `package.json`, the bundle patch module name, and the browser `ModuleLoader` factory ID. The dev exporter rewrites these three identity surfaces together; changing only the manifest or Host row makes DSH reload the unmatched script and fail on duplicate production-factory registration.

## Implementation anchors

- `packages/core/src/project-config.ts`
- `packages/core/src/project-check.ts`
- `packages/cli/src/cli.ts`
- `packages/dsh-adapter/src/index.ts`
- `packages/dsh-adapter/src/project-config-rpc.ts`
- `packages/dsh-adapter/client.js`
- `packages/dsh-adapter/test/project-config-rpc.test.mjs`
- `scripts/export-dsh-dev-plugin.mjs`
- `scripts/dsh-dev-plugin-bundle.test.mjs`

## Verification boundary

The DSH 0.2 compatibility revision passed all 91 DSH adapter tests, the adapter TypeScript check/build, the browser-client syntax check, and the dev-bundle identity regression test. The corrected `0.2.41-dev.2` bundle was applied to the Desktop profile and the live `settings.section` tree reported an active `claw-kit` occupant.
