# ADR: Use npm link for the first local claw install path

<!-- document-state: historical -->

## Status

Historical

## Context

The immediate goal was to make `claw` usable on the local machine during early active development, without waiting for packaging or publication work.

## Decision

The initial decision used `npm link .\\packages\\cli` as the first local installation path. Normal release and update completion no longer use this as their installation authority; the current owner is `.claw/truth/adr/release-0-1-18-publish-and-install-protocol.md`.

## Historical release refresh

- After the `0.1.33` release, the local machine was refreshed with `scripts/install-cli.ps1` instead of only relying on `npm link`.
- `npm list -g @veewo/claw --depth=0` now reports `0.1.33`.
- `(Get-Command claw).Source` resolves to `C:\\nvm4w\\nodejs\\claw.ps1`.
- `claw --help` succeeds after the refresh, which confirms the global shim points at the newly installed release.

## Consequences

- Local development can use `claw` as a normal shell command immediately.
- Installation stays simple and reversible.
- Packaging for broader distribution can be handled later without blocking daily use.

<!-- state: history -->
## Evolution history

<!-- dated: 2026-07-20 -->
### Narrowed to a release-development bootstrap exception

The `0.1.87` template-version gate exposed a bootstrap cycle between the published CLI and next-version workspace templates. A temporary link to the already-built workspace CLI/core remains acceptable only to prepare that release; after the target becomes visible in npm, restore the formal registry installation. This historical exception does not make `npm link` a release or update completion signal and does not permit installing the Codex plugin from unpublished workspace content.
