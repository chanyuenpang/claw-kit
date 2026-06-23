# Complete claw CLI and local install

## Summary

This pass completed the local `claw` command enough for normal harness work and installed it on the machine through `npm link`.

## Changes

- Added `packages/core/src/init.ts`
  - introduces `initProject`
  - creates a minimal `.claw` scaffold
- Updated `packages/core/src/index.ts`
  - exports `initProject`
- Updated `packages/cli/src/cli.ts`
  - adds `claw init`
  - updates CLI usage output
- Updated `packages/core/test/core.test.ts`
  - adds `initProject` coverage
- Updated `README.md`
  - documents local install and the main command surface
- Updated root `package.json`
  - adds `install:local-cli`
  - adds `uninstall:local-cli`

## Local install result

- `npm run install:local-cli` completed successfully
- global command shims were created under `C:\\nvm4w\\nodejs`
- verified with:
  - direct CLI invocation
  - global `claw.cmd init`

## Practical result

The machine can now use `claw` as a normal shell command for:

- `claw init`
- `claw context`
- `claw plan create`
- `claw plan edit`
- `claw switch-task`
- `claw memory index/search/get`
- `claw truth ingest`
