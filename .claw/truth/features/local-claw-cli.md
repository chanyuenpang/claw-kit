# Local claw CLI

## Status

Accepted working truth for local development on this machine.

## Core facts

- `claw init` now exists and bootstraps a minimal `.claw` project.
- The local CLI command surface includes:
  - `claw init`
  - `claw context`
  - `claw search`
  - `claw plan write`
  - `claw plan edit`
  - `claw switch-task`
  - `claw memory index/search/get` for legacy/debug and low-level index management
  - `claw truth ingest`
- Codex-facing recall should use `claw search --query "<topic>"`.
- Before writing a new plan, agents may run `claw search --query "<topic>"` to recover relevant project context.
- `claw memory ...` remains available, but it is not the recommended Codex workflow concept.
- Local installation is currently done through `npm link .\\packages\\cli`.
- On this machine, the global wrappers are created under `C:\\nvm4w\\nodejs`.
- 远程 Windows 机器应该优先使用 `scripts/install-cli.ps1`：脚本会执行 `npm install`、`npm run build`，移除旧的全局链接，然后用 `npm link --force .\\packages\\cli` 重新链接 CLI。
- 根目录 `README.md` 已把远程用户导向这个安装脚本，而不是要求他们手工拼装安装步骤。

## Practical implications

- `claw` can now be used as a normal shell command during local development.
- New projects do not need manual `.claw` scaffolding before they can enter the harness flow.
- Workflow docs and skills should say `claw search`, not OpenClaw-style "memory search", when explaining recall to Codex agents.
