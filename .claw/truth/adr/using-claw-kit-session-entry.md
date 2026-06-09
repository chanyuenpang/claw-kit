# ADR: Add using-claw-kit as the Codex session-entry skill

## Context

After moving away from Codex hook-dependent startup, the adapter still needed a stronger prompt-side way to make fresh sessions enter the `.claw` harness flow.

`claw-kit:bootstrap` already handled context recovery, but relying on bootstrap alone did not give the plugin a clearly named session-entry step.

## Decision

Add `using-claw-kit` as the first session-entry skill for the Codex adapter.

It should:

- run first when `@claw-kit` is invoked
- route into `claw-kit:bootstrap`
- encourage `.claw` context recovery before normal chat

## Consequences

- The plugin now has a clearer startup identity.
- Manifest ordering and starter prompts can explicitly point to one entry skill.
- Codex startup behavior remains prompt-driven, but with a stronger first-step contract than before.
