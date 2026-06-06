# Codex delegated deposition

Use this note when coordinating completion work in the Codex adapter.

## Core rule

The main agent should not spend its primary context window performing plan review, truth deposition, or ADR deposition inline when delegation is available.

Treat these as delegated specialist workflows:

- `truth-writer`
- `adr-writer`

## Main-agent responsibility

The main agent should:

1. recover current `.claw` context
2. perform the primary execution work
3. prepare small, focused deposition bundles
4. dispatch specialist subagents
5. consume compact results

## Canonical outputs

Default completion outputs belong here:

- reusable stable facts -> `.claw/truth/`
- durable decisions -> `.claw/truth/adr/`

Do not default to writing a generic doc, report, or summary file unless the user explicitly asks for one.
