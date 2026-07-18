# ADR: Use npm link for the first local claw install path

## Status

Accepted

## Context

The immediate goal was to make `claw` usable on the local machine during active development, without waiting for packaging or publication work.

## Decision

Use `npm link .\\packages\\cli` as the first local installation path.

## Current release refresh

- After the `0.1.33` release, the local machine was refreshed with `scripts/install-cli.ps1` instead of only relying on `npm link`.
- `npm list -g @veewo/claw --depth=0` now reports `0.1.33`.
- `(Get-Command claw).Source` resolves to `C:\\nvm4w\\nodejs\\claw.ps1`.
- `claw --help` succeeds after the refresh, which confirms the global shim points at the newly installed release.

## Consequences

- Local development can use `claw` as a normal shell command immediately.
- Installation stays simple and reversible.
- Packaging for broader distribution can be handled later without blocking daily use.
