# Codex update fallback

Use this path when no `.claw` project is available or claw-kit cannot be used.
Continue the update directly; claw-kit is not a prerequisite for this task.

1. Confirm the target claw-kit version is published.
2. Refresh the CLI with `npm install -g @veewo/claw@latest` and verify it with `claw --version` plus `npm list -g @veewo/claw --depth=0`.
3. Resolve the target published `vcodex-<plugin-version>` artifact tag in the official repository. Register or update the official marketplace to that ref with `codex plugin marketplace add chanyuenpang/claw-kit --ref <published-vcodex-tag>`, then refresh it with `codex plugin marketplace upgrade claw-kit`. Do not install raw source main or assume an old pinned ref advances to a new release.
4. Install or enable `claw-kit@claw-kit`; disable or remove `claw-kit@claw-kit-local` and `claw-kit@claw-kit-beta`.
5. Confirm the installed CLI and plugin versions. Artifact skill validation uses its skill-inputs.json, never a fixed count; do not add per-file installation audits.
6. If Codex requests a restart, report that normal installation step. A separate new-session test is not required to report the installed versions.

Use the published source for this update flow. Report installed CLI and plugin versions separately; functional smoke is a separate task.
