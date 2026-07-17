# ADR: Codex runtime repair requires explicit user consent

## Status

Accepted

Supersedes: `codex-adapter-owns-versioned-sdk-runtime.md`

## Context

Codex knowledge finalization 依赖版本化 SDK runtime，但 runtime 安装或损坏的具体原因受当前机器、权限、包管理器与网络环境影响。`claw context` 内置安装或输出固定 repair command 无法根据环境选择安全方案；安装接口失败后由程序自动重试，还会引入失败循环。

## Decision

- `claw context --host codex` 只检测 Codex SDK runtime 是否可用，不安装、不修复、不自动重试。
- runtime 缺失或无效时，context 返回英文结构化 `CODEX_SDK_RUNTIME_MISSING` error，并设置 `requiresUserConsent: true`。
- error 提供给 agent 的是授权与诊断 prompt，而不是固定 `repairCommand`。SessionStart 在默认和已恢复 workflow 两种路径中都将该 prompt 前置。
- agent 必须先告知用户并获得同意，然后诊断当前环境、选择安全修复方案；修复后重新运行 `claw context --host codex` 验证，不得盲目重复失败动作。

## Consequences

- context 保持纯检测且无外部安装副作用，不会因内置 installer 失败进入重试循环。
- 修复是显式的用户授权操作，且由 agent 结合当前环境决定具体方案。
- 缺失 runtime 时，自动 Truth/ADR finalization 在修复前不可用，但前台 claw plan lifecycle 仍按 fail-open 边界运行。
- 健康 runtime 的公开 context 仍保持最小输出。

## Related Code

- `packages/cli/src/codex-runtime.ts`
- `packages/cli/src/cli.ts`
- `packages/cli/test/cli.test.ts`
- `packages/codex-adapter/references/codex-hooks-strategy.md`

## Search Terms

- `CODEX_SDK_RUNTIME_MISSING`
- `requiresUserConsent`
- `repairCommand`
- `claw context --host codex`
- `SessionStart`
- `Codex SDK runtime`
