# Skill distribution and installation audit

<!-- state: current -->
## Current behavior

The repository assembles skill content from canonical sources, while each host owns its delivery and runtime loading contract. Do not infer a common install location or a shared CLI version lock from shared skill content. Distinguish source declarations, built artifacts, installed files, and host-selected/loaded skills; installation alone is not activation evidence.

| Host | Current delivery and dependency boundary |
| --- | --- |
| Codex | Skills are included in the plugin artifact and loaded through the plugin; CLI is separately installed. |
| Cindy | The plugin's resident startup entry uses existing Node RPC to run a private shared-skills preparer; preparation is best-effort and does not gate sessions/workflows. It acquires the pinned minimum `@veewo/claw-skills` package with npm scripts disabled, validates its published schema/hash, and replaces official skill directories without backup or downgrade. The dependency floor is private adapter metadata (`packages/cindy-adapter/package.json`), not a Host API or CLI version. This is source behavior, not proof of publication or actual Cindy session loading. |
| DSH | Skills are bundled in the adapter artifact and exposed through the host provider; CLI is separate. Profile installation and host restart/session activation are distinct. |
| OpenCode | Installer deploys plugin payload, shim, discovery skill copies, and agents; current Node npm entry does not build/reinstall the CLI. The restored baseline overwrites same-named files by recursive copy; removed companion resources can remain. The corrected policy is to replace official skill directories directly, without backups or edit conflicts. |
| OpenClaw | Manifest currently selects seven skills and a prompt hook exists, but no dedicated OpenClaw workflow route is established by these facts. Package dependency does not install the standalone CLI. |
| Standard hostless | Documentation directs manual copy of seven skills; init remains offline and does not install skills. CLI is separate. |

Evidence anchors: [skill assembler](../../../scripts/skill-artifacts.mjs), per-adapter skill-input.json, [OpenCode installer](../../../scripts/opencode-plugin-bundle.mjs), [root package](../../../package.json), [OpenClaw manifest](../../../packages/openclaw-adapter/openclaw.plugin.json), [OpenClaw hook](../../../packages/openclaw-adapter/src/index.ts), [standard instructions](../../../packages/standard-adapter/README.md), and [CLI init](../../../packages/cli/src/cli.ts).

Audit evidence for the current checkout also found OpenClaw declaration selects seven while its manifest test still expects one, and that focused test failed. These are source/test observations, not claims about every published artifact or installed host. Cindy shared package 0.2.65 and Cindy frozen contract 0.2.70.0 had matching full manifest JSON in the inspected comparison; version-number difference alone is not incompatibility evidence. The completed claw-kit source pass reports 70 focused regressions and a temporary-home consumption probe of published `@veewo/claw-skills@0.2.65` (seven skills); neither establishes publication of the new adapter artifact or loading in a real Cindy session.

<!-- state: history -->
## Evolution history

<!-- dated: 2026-11-07 -->
### Cindy plugin-only automatic preparation replaces withdrawn Host route

The later claw-kit source pass replaced the withdrawn Host-API-dependent proposal with preparation initiated once from the existing resident plugin startup entry. A private Node helper downloads the pinned shared skills data package with npm lifecycle scripts disabled, validates the published schema and wire hash, replaces official directories without backups, and preserves the last successful version to prevent downgrade. Preparation failures are reported but do not gate ordinary workflows. The source pass reports 70 focused regression checks and a temporary-home probe consuming published `@veewo/claw-skills@0.2.65` with all seven skills; it did not publish/install the new adapter, modify Cindy, restart an application, or verify real Cindy session loading. Keep those proof boundaries distinct.

<!-- dated: 2026-11-05 -->
### Rejected protection direction and implementation outcome

The owner rejected the earlier protection/repair-tool direction as unnecessary complexity; runtime additions, component selection, ownership receipts, backup/journal recovery, and dedicated tests/instructions were removed. A subsequent source pass proposed awaited shared-package preparation through the existing install/update owner, with direct official-directory replacement and no automatic downgrade. Source and focused checks were reported, but publication, installation, runtime loading, and real GUI/host validation did not. The proposal's release prerequisite based on a new Cindy Host API/minCindyVersion was withdrawn: Cindy application code must not be changed, and claw-kit work may use only existing Cindy capabilities. A later correction confirmed that Cindy-repository edits from that pass were fully reverted (31 tracked paths restored, four added files removed); no commit, publication, installation, or restart occurred. The claw-kit work depending on the withdrawn Host API remains unadapted and must not be published until rewritten. No cleanup changed a published artifact, installed plugin, or active host.

## Maintenance anchors

- packages/*-adapter/skill-inputs.json
- scripts/skill-artifacts.mjs
- scripts/opencode-plugin-bundle.mjs
- packages/shared-skills/package.json and data-only package assembly
- packages/cindy-adapter/plugin/main.js (`prepareSharedSkillsAtStartup`, lines 32-49 and 556)
- packages/cindy-adapter/plugin/node/shared-skills.cjs (`prepareSharedSkills`)
- packages/cindy-adapter/package.json (`sharedSkills` minimum)
- packages/openclaw-adapter/test/skill-manifest.test.mjs
