# DSH project configuration settings

<!-- state: current -->
## Current behavior

- The DSH Settings root exposes a `Claw Kit` section. It lists registered workspaces that contain `.claw/project.json`, lets the user select one, and shows separate team, personal, and effective values for approved configuration key paths.
- Team values are stored only in the selected project’s `.claw/project.json`; personal values are stored only in its `.claw/project-override.json`. The UI does not write DSH global settings or create another configuration source.
- The browser calls only `/claw-project-config` endpoints with `workspaceId`, layer, approved key path, JSON value where applicable, and the layer revision. It never supplies a filesystem path.
- The Host resolves `workspaceId` through the registered workspace list, requires the resolved directory to contain `.claw/project.json`, rejects unknown fields and non-`team`/`personal` layers, and invokes `claw config get|set|unset` from that resolved directory.
- Core owns layer reads, effective merge, approved key-path validation, JSON validation, schema validation, optimistic revision checks, and atomic writes. The CLI only exposes this contract; the DSH adapter remains a narrow workspace-authorizing bridge.
- Each editable layer has its own revision. A stale save or unset fails rather than overwriting a newer layer value; effective values are displayed read-only.
- The section groups approved keys under Workflow, Knowledge writer, and Memory. Values are read-only until one team or personal cell enters edit mode; only that cell shows Apply and Cancel, rather than exposing a page-level save or raw project JSON editor.
- A personal cell with no override clearly shows its inherited effective value. Restore inheritance invokes `unset`; explicit `null` is a separately selectable persisted override rather than inherited absence.
- On a revision conflict, the client retains the draft, refreshes the cell revision, and asks the user to review and apply again. It does not silently overwrite the newer value; stale workspace responses are ignored.

## Implementation anchors

- `packages/core/src/project-config.ts`
- `packages/core/src/project-check.ts`
- `packages/cli/src/cli.ts`
- `packages/dsh-adapter/src/index.ts`
- `packages/dsh-adapter/src/project-config-rpc.ts`
- `packages/dsh-adapter/client.js`
- `packages/dsh-adapter/test/project-config-rpc.test.mjs`

## Verification boundary

The completed implementation report records passing focused Core and CLI coverage plus 70 DSH adapter tests, client syntax and registration smoke checks. Those results are historical evidence for that completed revision, not a claim that this governance pass reran them. Runtime GUI confirmation requires the active DSH Host composition to mount the adapter and then restart; a package/profile installation alone is not activation proof.
