---
name: beta-claw-kit
description: Prepare a local claw-kit beta using the intended stable version, locally committed source, frozen npm and Codex artifacts, and a seven-day trial, without remote publication.
---
# beta-claw-kit

Read [the beta workflow](../../../docs/beta-release.md). Follow using-claw-kit for the current host lifecycle; use a generic plan when this owns the task, or contribute to the active task.

- Prepare the intended stable version and local main commit; classify every existing change. Local commit is allowed. Never push a branch/tag or publish npm/GitHub artifacts during beta.
- Run proportionate checks and beta:pack to freeze Core/Client/CLI and Codex with source revision and hashes. This batch does not cover other adapters.
- For requested local testing, install the batch and confirm CLI/plugin versions, then record the start with beta:start-test. No per-file installation audit or loaded-runtime proof is needed. Use smoke-test-claw-kit separately in beta mode.
- Changed artifacts require a new batch and seven-day trial. Report batch path, versions and trial start; preserve bytes and version through promotion.
- A later explicit formal-release request routes to the artifact release skills with this directory. They verify npm retrieval before any GitHub push. Do not automatically schedule or initiate publication.
