# ADR: Use npm link for the first local claw install path

## Context

The immediate goal was to make `claw` usable on the local machine during active development, without waiting for packaging or publication work.

## Decision

Use `npm link .\\packages\\cli` as the first local installation path.

## Consequences

- Local development can use `claw` as a normal shell command immediately.
- Installation stays simple and reversible.
- Packaging for broader distribution can be handled later without blocking daily use.
