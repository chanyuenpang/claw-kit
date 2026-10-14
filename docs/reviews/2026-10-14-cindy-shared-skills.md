# Cindy shared skills separation: implementation proposal

Status: the owner selected an independent npm package. Implementation uses `@veewo/claw-skills`, with a fixed version and complete content contract in the composed Cindy plugin. No publication or real-profile installation is authorized.

## Evidence from the local source checkouts

- Cindy `packages/plugin-protocol/src/manifest.ts` defines `GHOST_SKILL_MAX_ITEMS = 4` and enforces it on `skill.items`. This is a host manifest limit, not merely claw-kit's current registration count. This evidence concerns the local Cindy checkout, not proof of the running application's revision.
- Cindy `apps/desktop/src/main/maker-host/shared-global-skills.ts` defines `~/.agents/skills` as the shared root and maintains Claude compatibility projections. Cross-agent imports are separately opt-in; installing a shared skill must not change that preference.
- `codex-global-skills.ts` projects the shared root through `codexHome/skills/xdt-agents`. This Cindy host integration is separate from claw-kit's Codex plugin distribution, which remains unchanged.
- Cindy `cindy-brain/skillSlot.ts` reconciles plugin skill links against approved snapshots on plugin lifecycle changes. Legacy entries use `<ghost-id>--<skill-name>`. The host owns their removal; the new installer must not take ownership of those links or approval snapshots.
- Global discovery, compatibility projection, and an active runtime's loaded roster are distinct. In particular, `packages/maker-core/src/maker.ts` keeps Pi managed skills pinned to their launch snapshot. Installation alone cannot certify current-session activation. Verify new-session loading on each supported Cindy engine.
- `scripts/skill-artifacts.mjs` already owns canonical skill resolution and copies complete directories without content transformation. Reuse it; do not create another editable skill tree.
- Cindy currently declares six packages in `packages/cindy-adapter/skill-inputs.json`; the plugin manifest registers four. The artifact builder currently assembles all six under `plugin/skills` and tests the four-entry registration set.
- The standard exporter provides a complete seven-skill artifact, but its adapter is private and does not establish an independent online shared-package distribution contract. The CLI npm package currently includes `dist` and its README, not an exported public skill bundle.
- No direct bundled-skill filesystem reads were found in Cindy's plugin runtime. However, Core workflow guidance and plan defaults reference `claw-kit:planning`; canonical skills also contain adjacent host references and resources. Preserve complete package adjacency and resolve the Cindy-facing entry name without changing shared nextsteps semantics or other platforms.
- The native claw-kit Ghost returned `GHOST_ASLEEP`. No workflow recovery or mutations were performed through an alternate host route.

## Proposed change boundary

1. Assemble a separately versioned shared artifact from existing canonical packages, retaining references, templates, and other companion files. Explicitly declare the shared public set and include cross-package dependencies.
2. Give the Cindy plugin a fixed compatible shared-package version and content identity. No unconditional `latest` and no network checks in conversation hooks. The selected distribution is an independent npm artifact fetched from registry.npmjs.org only on explicit installation.
3. Add reusable installation logic plus explicit Cindy install/update operations. The plugin installation flow can call the same operation. Keep the Node worker, session context, hooks, workflow tools, and host identity routing.
4. Stage and validate the whole package before activation. Persist ownership and file hashes; preserve unowned files and user edits. Use recoverable activation/rollback, serialise competing installs, and make same-input retries idempotent. Keep old/staging trees outside skill discovery to avoid duplicate entries.
5. Remove Cindy public skill registrations and bundled skill assembly only with the shared installation path ready. Let Cindy's existing reconciler remove old registrations. Report remaining duplicate or shadowing entries for repair instead of deleting arbitrary matching names.
6. Run a local, advisory skill check at session startup. Report missing/incompatible installations with an explicit repair action; checks must not block workflow calls. Return installed status independently from loaded-session status.

## Focused verification

Use isolated home, artifact, and state directories. Cover complete resource discovery, same-package repeat installation, upgrades, staged failure and interrupted activation recovery, user-edited/unowned files, symlink/path escape, and old registration coexistence. Verify plugin exports contain no public skills while workflow and host identity tests remain intact. Do not modify the real global skill root.

Host follow-up: install an authorized candidate in Cindy, verify its actual version, update-time old-link reconciliation, startup repair visibility, and fresh-session discovery in Codex and a non-Codex engine. Local source inspection and simulated tests cannot replace those observations.

## Collaboration boundary

Do not edit or commit the concurrent claw init AGENTS.md / CLAUDE.md work. Initial dirty files were `.claw/truth/adr/hostless-init-agent-instructions.md`, `.claw/truth/features/local-claw-cli.md`, `packages/cli/src/agent-instructions.ts`, `packages/cli/src/cli.ts`, `packages/cli/test/agent-instructions.test.ts`, and `packages/standard-adapter/docs/entry-contract.md`.

## Implementation and verification record

- The owner chose an independent npm package. `packages/shared-skills` owns the reusable installer and package metadata; the existing standard input declaration selects the complete seven canonical packages. The source package is private, while the composed output is publishable. No release was performed.
- Cindy's composed runtime contains only the installer and fixed version/content contract, not public skill files. The old skill declaration and manifest registrations are removed. Native metadata explains original-name resolution without rewriting shared workflow nextsteps.
- The plugin uses manifest v3 with the same workflow capabilities plus `notify`, and declares minimum Cindy version 0.1.61. The local Cindy protocol's authoritative `validateGhostManifest` accepted the manifest with notification and session-context capabilities intact. This is source validation, not installed-host activation evidence.
- Isolated tests passed for full resource installation, same-input no-op, upgrades, stage/activation/receipt failure rollback, an actual child-process crash and dead-lock recovery, npm pack/offline extraction, user edits/unowned state protection, duplicate legacy entries, and path containment. Startup tests verify no install call and continued workflow owner calls despite missing skills.
- The 28 existing Cindy worker regressions passed. The test-manager suite has an unrelated existing CLI-count assertion (`148` expected, `151` found); its assertion and CLI test files were not modified.
- Pending authorized Host checks: marketplace migration, Host cleanup of old skill projections, notification visibility, and fresh-session discovery with Codex and a non-Codex engine. The npm package has not been published, so online installation cannot be claimed verified. Backups remain outside discovery; existing active sessions are never reported as refreshed.
