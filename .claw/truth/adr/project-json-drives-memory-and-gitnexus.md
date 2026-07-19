# ADR: Project JSON Drives Memory And GitNexus

## Status

Accepted

## Context

`claw-kit` needs a stable project declaration surface while still working in Codex-first flows. Earlier versions mirrored the nested OpenClaw `gitnexus.enabled` shape, but the canonical config has since been flattened for simple project-level toggles.

At the same time:

- Codex does not need `contextPaths` because session bootstrap already relies on `AGENTS.md`, plugin skills, and CLI guidance.
- memory indexing does need to respect project-declared extra documentation paths.
- `plan done` should refresh GitNexus only when the project explicitly enables it.
- the earlier published `@veewo/gitnexus@1.5.8` CLI did not expose `--no-ai-context`, even though newer local source lines already supported it.
- The version-bound 2026-07-19 `@veewo/gitnexus@1.5.9` investigation recorded in `../features/local-claw-cli.md` established both a narrow Windows force-rebuild recovery case and a high-confidence historical cause: overlapping analyze processes against the same LadybugDB files. The rebuilt files prevent byte-level forensics, so this does not make every access violation equivalent to index corruption.
- A later GitNexus fix branch based on `nantas-dev` added its own cross-process per-repository analyze lock and strict LadybugDB artifact/schema/close failure handling. That implementation is owned in detail by `../features/local-claw-cli.md`; because it is fix-branch evidence rather than proof about the published `@veewo/gitnexus@1.5.9`, claw-kit still has to protect callers that run older published behavior.

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
- Keep the intentional `@veewo/gitnexus` integration. Treat only the exact unsigned Windows exit status `0xC0000005` as eligible for one bounded force-rebuild recovery; do not turn other analyze failures into generic rebuilds or unbounded retries. The exact current command construction and fallback behavior are owned by `../features/local-claw-cli.md`.
- Do not extend that automatic rebuild rule to `0xC0000374`: the observed version-bound instance occurred after the index and metadata were written and remained queryable, so it belongs to health-aware diagnosis of a possible native exit-cleanup failure rather than signature-only destructive recovery.
- Keep claw-kit completion-refresh single-flight independent from GitNexus's internal per-repository lock. The dependency lock serializes analyze processes at the storage boundary; claw's caller-side coalescing prevents redundant closeout work and continues to cover published GitNexus versions without that fix.
- Reconsider the exact `0xC0000005` force-rebuild recovery only after a GitNexus release containing the internal lock and strict error propagation has accumulated enough real usage to show that the caller workaround is no longer needed. An unreleased fix branch or non-reproduction of `0xC0000374` is not sufficient removal evidence.
- Keep claw project-memory and GitNexus embedding-model selection independent. Cache seeding is a best-effort reuse optimization for a matching model id, not a configuration bridge that rewrites GitNexus from `memory.embedding.model`.

## Consequences

- Existing and future `.claw` projects can rely on stable canonical field names, with older nested input repaired into the flat shape.
- Project creation no longer leaves schema interpretation implicit.
- Codex is not forced to adopt `contextPaths` semantics it does not need.
- `plan done` stays robust across the currently published GitNexus CLI and the newer local source line, while keeping `gitnexus` as the sole claw-side gate.
- GitNexus readiness problems surface earlier and more deterministically, which makes the foreground `plan done` failure path easier to diagnose.
- The persisted embedding toggle stays owned by GitNexus itself, so `claw` does not need a parallel embedding config flag just to remember one analysis mode.
- Older GitNexus installs still work because the background lane keeps a plain `analyze` fallback instead of assuming the newest CLI flag set.
- A damaged existing GitNexus index can self-heal on the known Windows crash signature without replacing the integration or requiring every user to diagnose LadybugDB manually.
- The exact-signature and single-retry bounds avoid destructive rebuild loops and preserve the existing error surface for missing binaries, unsupported options after fallback, and unrelated analyze failures.
- Keeping `0xC0000374` outside the automatic rebuild rule avoids replacing a healthy index merely because the native process reported a later heap-corruption exit during cleanup.
- The two lock layers intentionally overlap without having the same owner or purpose: claw coalesces workflow refresh demand, while GitNexus protects its LadybugDB lifecycle even when analyze is launched by another process. The cost is some duplicate serialization logic until the dependency fix is broadly deployed and observed.
- Changing claw's project-memory model does not silently change GitNexus's model; the tradeoff is that unlike-model caches cannot be reused across the two systems.
