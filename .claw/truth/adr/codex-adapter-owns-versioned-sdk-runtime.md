# ADR: Codex adapter owns the versioned SDK runtime

## Status

Superseded

Superseded by: `codex-runtime-repair-requires-user-consent.md`

## Context

Codex knowledge finalization worker 需要 `@openai/codex-sdk` 及其匹配平台的 Codex CLI。依赖 PATH 或 Codex Desktop binary 作为 fallback，无法保证 worker 获得与 adapter 版本匹配、可由 SDK 稳定启动的 CLI；npm 的平台 optional dependency 缺失也会让仅安装 SDK 包的路径失效。

同时，SDK 只服务 Codex host。把它静态声明为通用 `@veewo/claw` CLI 的依赖，会把 host-specific runtime 成本和失败面扩散到其他 adapter。

## Decision

- 拒绝 PATH / Codex Desktop binary fallback。
- `@claw-kit/codex-adapter` 拥有 `@openai/codex-sdk`；通用 `@veewo/claw` CLI 不声明 SDK 包依赖。
- `claw context --host codex` 在用户目录下准备按 claw-kit 版本隔离的 runtime，并显式安装 SDK 与当前平台 alias。
- knowledge finalization worker 从 context 准备的 runtime 动态加载 SDK。
- 健康 context 保持静默，不公开 runtime 路径或版本；准备失败时只返回必要的英文 `codexRuntimeWarning`。

## Consequences

- Codex worker 使用 adapter 控制、版本匹配的 SDK/CLI 组合，不再依赖机器 PATH 或 Desktop 安装布局。
- 首次或缺失 runtime 的 Codex context 可能需要安装依赖；后续健康调用复用版本化用户缓存。
- 平台 alias 被显式安装，避免 npm optional dependency 缺失导致 worker 启动失败。
- 通用 CLI 与非 Codex adapter 不承担 Codex SDK 的安装体积和依赖风险。
- runtime 准备失败仍然可观察，但健康公开 context 保持最小输出。

## Related Code

- `packages/cli/src/codex-runtime.ts`
- `packages/cli/src/cli.ts`
- `packages/codex-adapter/package.json`
- `packages/codex-adapter/hooks/hooks.json`

## Search Terms

- `codex runtime`
- `@openai/codex-sdk`
- `platform alias`
- `codexRuntimeWarning`
- `claw context --host codex`
- `knowledge finalization worker`
- `PATH fallback`
