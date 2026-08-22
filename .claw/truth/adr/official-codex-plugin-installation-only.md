# ADR: Official Codex plugin installation only

## Context

Codex can retain plugin identities, marketplace registrations, hook approvals, and cache trees independently. A local hookfix marketplace was able to remain enabled after the official plugin had been refreshed, leaving the running plugin and global CLI on different release lines. Cache presence or a previous update report does not prove which plugin is enabled.

## Decision

For normal Codex use, `claw-kit@claw-kit` from the `chanyuenpang/claw-kit` GitHub marketplace is the only permitted claw-kit plugin identity.

- Do not enable a local marketplace or identity such as `claw-kit@claw-kit-local`, `claw-kit-local@personal`, or `claw-kit@claw-kit-hookfix-local`.
- An official update must remove local claw-kit marketplace registrations, local identity and hook configuration, and their cache trees before enabling the official identity.
- A Codex plugin release remains an artifact publication boundary. When a maintainer installation refresh is authorized after release, it must use the published official GitHub source, clean local variants, enable the official identity, and verify the enabled identity plus source and cache manifests. It must not install the unpublished workspace as the normal runtime.

## Alternatives

Keep local identities disabled but retained. Rejected: stale hooks, caches, or an accidental enablement can silently restore a local runtime.

Use a local marketplace as the normal release validation runtime. Rejected: it tests different bytes and activation state from the published official marketplace.

## Consequences

Local plugin experimentation requires an explicitly isolated development environment rather than the normal Codex installation. The official update procedure has a destructive cleanup step, so it must enumerate and verify the exact local paths before removal. Restart Codex and start a new task after an update; an already running task may retain its prior plugin files.
