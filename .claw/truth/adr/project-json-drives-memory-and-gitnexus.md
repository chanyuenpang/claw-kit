# ADR: Project JSON Drives Memory And GitNexus

## Status

Accepted

## Context

`claw-kit` needs a stable project declaration surface while still working in Codex-first flows. Earlier versions mirrored the nested OpenClaw `gitnexus.enabled` shape, but the canonical config has since been flattened for simple project-level toggles.

At the same time:

- Codex does not need `contextPaths` because session bootstrap already relies on `AGENTS.md`, plugin skills, and CLI guidance.
- memory indexing does need to respect project-declared extra documentation paths.
- `plan done` should refresh GitNexus only when the project explicitly enables it.
- the published `@veewo/gitnexus@1.5.8` CLI does not yet expose `--no-ai-context`, even though newer local source lines already support it.

## Decision

- Preserve the project memory declaration fields in `.claw/project.json`:
  - `contextPaths`
  - `memory.externalDocPaths`
- Use flat `gitnexus` as the sole claw-side GitNexus integration switch.
- Treat legacy `gitnexus.enabled` as a compatibility input for protocol repair, not as the canonical output shape.
- Write those fields explicitly during `claw init`.
- Keep `contextPaths` as a schema field but do not consume it in current Codex-first `claw-kit` flows.
- Use `memory.externalDocPaths` to drive project memory indexing, including directory paths like `docs/`.
- Make `claw plan done` refresh GitNexus only when `gitnexus` is `true`.
- When `gitnexus` is `true`, `claw plan done` must first run a foreground GitNexus preflight before background completion refresh starts; if the CLI is missing, it should try `npm install -g @veewo/gitnexus` followed by `gitnexus setup --cli-spec @veewo/gitnexus`, and any install/setup failure must surface immediately on the foreground error path.
- If GitNexus is installed but its analyze options have not yet persisted embeddings, `claw plan done` should self-heal by running `gitnexus analyze --embeddings` in the foreground so GitNexus records `embeddings=true` in `.gitnexus/meta.json`.
- `gitnexus analyze --embeddings` 是 GitNexus 自己的持久化 embedding 开关，`claw` 不再为同一状态额外引入平行的 workspace 配置开关。
- Before enabling embeddings, `claw plan done` may best-effort seed the GitNexus transformers cache from a matching existing claw model cache to avoid a second download, but only when the model id matches.
- Prefer `gitnexus analyze --no-ai-context`, but automatically fall back to plain `gitnexus analyze` when the installed CLI reports that the flag is unsupported.

## Consequences

- Existing and future `.claw` projects can rely on stable canonical field names, with older nested input repaired into the flat shape.
- Project creation no longer leaves schema interpretation implicit.
- Codex is not forced to adopt `contextPaths` semantics it does not need.
- `plan done` stays robust across the currently published GitNexus CLI and the newer local source line, while keeping `gitnexus` as the sole claw-side gate.
- GitNexus readiness problems surface earlier and more deterministically, which makes the foreground `plan done` failure path easier to diagnose.
- The persisted embedding toggle stays owned by GitNexus itself, so `claw` does not need a parallel embedding config flag just to remember one analysis mode.
- Older GitNexus installs still work because the background lane keeps a plain `analyze` fallback instead of assuming the newest CLI flag set.
