# Public skill sources and artifact assembly

## Contract

Public skills have one editable source. Packaging copies complete packages into isolated artifacts, with no synchronization back into adapter source. Every emitted skill retains its complete multi-host text and all companion resources. Cindy distributes these through the independent `@veewo/claw-skills` npm artifact and installs them into global discovery; other adapters retain their existing bundled layouts.

The rejected root-plugin/manifest-array migration is not used. Cindy's explicit shared-package installation is separate from its hooks, workflow tools, session context and host bridge.

## Canonical inputs

Seven public packages live directly in the repository discovery root [project skills](<../.agents/skills/>): planning, config, create-claw-skill, feature-architecture, researcher, using-claw-kit and claw-kit-doc. This directory is now their canonical source, not a generated mirror. The complete documentation corpus lives beside its [entry](<../.agents/skills/claw-kit-doc/SKILL.md>) under references.

[Manual knowledge capture](<../shared/skills/knowledge-capture/>) remains a non-project-discovery canonical package and is shipped only to Codex/DSH. Host-specific update packages remain owned by their adapters. Repository release/test/E2E skills and Core internal governance resources are not added to public bundles.

Bundling adapters own small `skill-inputs.json` declarations. The shared npm artifact reuses the existing seven-package standard declaration; Cindy no longer owns a bundled-skill declaration. [The catalog and assembler](<../scripts/skill-artifacts.mjs>) copy each entire directory byte-for-byte, including templates, references, fallback and runner resources. There are no content transformations or generated-source banners.

| Artifact | Skill packages | Public boundary |
|---|---:|---|
| Codex / DSH | 9 each | Existing public set, including each host's update |
| OpenCode | 8 | No manual capture |
| Standard | 7 | Same seven canonical project packages |
| Shared npm / Cindy global install | 7 | Complete canonical packages; no Cindy plugin skill registrations |
| OpenClaw | 1 | claw-kit-doc only |

## Build and check

```powershell
npm run check:skill-sources
npm run check:template-versions
# Skills-only isolated stage; root and destination are explicit
npm run build:skills -- --source-root . --host dsh --output-root <isolated-output>
# Complete host artifacts
npm run export:codex-plugin
npm run export:codex-marketplace -- --out-dir <isolated-marketplace-output>
npm run export:dsh-plugin
npm run export:opencode-plugin
npm run export:openclaw-plugin
npm run export:standard-skills
npm run export:cindy-plugin -- --output-root <fresh-artifact-directory>
node scripts/shared-skills-artifact.mjs <fresh-shared-package-directory>
```

Outputs must be outside source or under its ignored dist tree. Output overlapping source, unknown inputs and symlink escape are rejected before copying. Assembly rechecks source hashes and refuses stale/partial skill trees. Complete exporters preserve previous valid artifacts on failure or require a fresh output directory. The old sync commands fail explicitly instead of recreating source mirrors.

The [host builders](<../scripts/host-plugin-artifacts.mjs>) reuse installed layouts. DSH export and publish pack the same isolated stage, retain canonical package identity and existing four-part-to-npm version mapping, and verify declared resources inside the tarball. OpenCode still installs its shim/agents/skill discovery copies from a complete artifact. These installation copies are not source copies. Core's existing build step copies the canonical knowledge format into its dist resources, not back into internal source.

## Git marketplace artifacts

Git transport is not permission to keep generated source copies. Publish the composed output tree, not an incomplete adapter source directory. The source marketplace JSON is an assembly input; its presence alone does not certify the raw source checkout as an installable marketplace snapshot.

- Codex's composed marketplace preserves the established `.agents/plugins/marketplace.json` and `packages/codex-adapter` plugin-relative layout. The installed plugin still uses `./skills/` and `$PLUGIN_ROOT/scripts`. Its Git artifact destination/ref must be explicitly authorized at release; building does not create or push one. A native marketplace cannot install a raw source adapter missing assembled skills.
- Cindy source belongs to [the main repository package](<../packages/cindy-adapter/>). [Its artifact builder](<../scripts/cindy-plugin-artifact.mjs>) emits the local `./plugin` marketplace tree without public skills, plus an exact shared-package version/source/content contract. The existing `claw-kit-cindy-adapter` remote remains the artifact-only publication target. See [shared installation](../packages/shared-skills/README.md) for publication ordering, user-file protection, migration and session refresh. No generated artifact is copied back into the source package.
- Source commit, artifact commit and activated host version are distinct evidence. Release from reviewed source; validate complete detached artifacts; publish only with authorization. Do not claim Git delivery or host activation from local export tests.

The Cindy migration preserves its original Git database under the main checkout's .git/modules and the original worktree-link backup in .git. No remote history was rewritten. A future source commit replaces the old gitlink with ordinary source files; a separate authorized publication delivers assembled files to the artifact remote.

## Trusted platform routing

Complete skills retain all platform routes. A current adapter-supplied `[claw host]` block declares `platform`; native structured results may expose `clawHost.platform`. This identifies the host, never the model/provider: Codex running inside Cindy still routes as Cindy. Agent instructions verify the required tool surface, reject conflicts and unknown identity, and never use a copied skill's path or a remote tool to override the current host.

Codex, DSH and OpenCode have supported startup/context prompt surfaces. Cindy appends its host identity and claw development-workflow requirement once per session through the supported `will-user-message` rewrite, with native Ghost metadata/results and continuation messages as additional identity surfaces. A persistent session receipt prevents repeat insertion after plugin restart. Oversized messages are passed unchanged to avoid Host truncation; native catalog confirmation remains available. Standard identity is explicitly supplied by the hostless entry owner. OpenClaw has no implemented workflow startup hook in this package; absent capabilities remain explicit rather than fabricating `--host openclaw`.

## Verification and unchanged behavior

Tests cover exact declared sets, adjacent resources, byte/hash parity, source nonmutation, detached artifact reads, existing flat manifest/hook paths, npm pack content, and failure isolation. Runtime behavior tests continue to use the same installed interfaces. Do not relax a loader or create a repository fallback merely to make source-only tests pass.

Existing runtime issues, including unsupported DSH automatic main-agent transport, are not repaired by packaging and remain separate work. This migration does not perform publishing, profile installs or external-host live E2E.
