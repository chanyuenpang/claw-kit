# Changelog

All notable release-oriented changes for `claw-kit` should be recorded here.

## [0.1.12] - 2026-06-08

### Added

- publishable package names `@veewo/claw-core` and `@veewo/claw`
- package-level README files for the publishable packages
- `scripts/install-cli.ps1` for GitHub-based Windows installation
- `DISTRIBUTION.md` for release and npm publish workflow

### Changed

- CLI package metadata and dependency wiring to support npm publishing
- root README install guidance to cover both GitHub install and npm publish flow

### Fixed

- package file lists so `@veewo/claw-core` no longer packs test artifacts
