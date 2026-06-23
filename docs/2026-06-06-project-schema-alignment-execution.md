# Project Schema Alignment Execution

## Scope

Align `claw-kit` project declaration handling with the current `OpenClaw` schema so new projects write canonical fields up front and plan completion refresh follows `project.json`.

## Changes

- Confirmed the current canonical declaration fields from `OpenClaw-dev` source:
  - `contextPaths`
  - `memory.externalDocPaths`
  - `gitnexus.enabled`
- Updated `claw init` to write those fields explicitly into `.claw/project.json`.
- Kept `contextPaths` in schema for alignment, but left it unused in Codex-first flows.
- Extended project memory indexing so `memory.externalDocPaths` supports directory paths like `docs/` as well as single files.
- Updated `plan done` completion refresh to:
  - always rebuild project/task memory indexes
  - run GitNexus only when `gitnexus.enabled` is `true`
  - prefer `gitnexus analyze --no-ai-context`
  - fall back to `gitnexus analyze` when the installed CLI reports that `--no-ai-context` is unknown
- Updated this repo's `.claw/project.json` to the canonical explicit shape.

## Verification

- `npm run check`
- `npm run test`
- Real CLI smoke on a temporary git repo:
  - `claw init --ext-path docs/ --ext-path README.md --gitnexus true`
  - `claw plan create`
  - `claw plan done`
- Smoke confirmed:
  - `docs/guide.md` is now indexed from `externalDocPaths`
  - older published `@veewo/gitnexus@1.5.8` falls back cleanly to plain `gitnexus analyze`

## Follow-up

- Remove or simplify the GitNexus fallback once the published CLI exposes `--no-ai-context`.
- Consider adding a focused CLI regression test around `plan done` completion refresh.
