# Claw Kit Truth Summary

- `claw-kit` is a host-neutral `.claw` harness core extracted from OpenClaw semantics.
- Codex startup uses prompt-driven bootstrap plus `SessionStart` context injection.
- `claw search` is the Codex-facing recall command; `memory.externalDocPaths` extends project recall sources.
- `claw plan write`, `claw plan edit`, and `claw plan done` return compact `workflowGuidance` and `planSummary` contracts.
- Thread goal mode starts on `plan write`.
- Truth and ADR deposition run through delegated writer specialists, not inline main-agent writes.
- Writer delegation contracts now carry explicit `skill` and `model` fields.
- `.claw/project.json` supports explicit `externalTruthSkill` and `externalAdrSkill` overrides with `null` defaults.
- 远程 Windows 机器的本地安装入口是 `scripts/install-cli.ps1`，它会先安装依赖、构建、清理旧的全局链接，再重新链接 CLI。
- Remote Windows installs now use `scripts/install-cli.ps1` after a GitHub clone; the script installs dependencies, builds, cleans old global links, and links the local CLI without requiring `npm publish`.
- `@veewo/claw-core` and `@veewo/claw` remain the publishable npm packages; `publish-claw-npm-package` still governs the dry-run publish checks and the core-before-CLI publish order.
