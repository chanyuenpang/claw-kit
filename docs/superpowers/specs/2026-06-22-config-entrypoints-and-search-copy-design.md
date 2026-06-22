# Config Entrypoints And Search Copy Design

## Goal

Shorten the public `search and recall` copy in the root README and CLI README as part of improving the GitHub-facing product explanation, without changing plugin-specific materials.

## Scope

This round updates:

- `README.md`
- `packages/cli/README.md`

## Non-Goals

- changing runtime behavior
- changing the harness workflow contract
- changing plugin-specific materials
- removing the canonical backup guide at `docs/project-json-reference.md`

## Decisions

### Search and recall copy should be short

- root `README.md` should not carry the long `search and recall` explainer
- `packages/cli/README.md` can keep a very short practical boundary, but not the current long walkthrough

### Canonical guide remains backup-only

- `docs/project-json-reference.md` remains backup material when detailed config reference is needed
- this round does not move or rewrite plugin-side materials

### Config guidance should be scenario-oriented

The adapter reference notes should help readers answer:

- where shared team config belongs
- where personal runtime preferences belong
- when to enable GitNexus
- when to change memory settings
- when writer overrides are useful

## Verification

After editing:

- root `README.md` no longer contains the long `search and recall` section
- `packages/cli/README.md` keeps only a short search/recall explanation
- the public GitHub-facing wording becomes shorter and more product-oriented
- no plugin-specific files change in this round
