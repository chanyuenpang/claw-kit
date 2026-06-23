# ADR: `dist` ghost-output checks for removed template paths

## Status

Accepted

## Context

本仓库的生成产物依赖 `tsc` 和各类 bundle / sync 脚本，但 `tsc` 不会自动删除已经从源码里移除的旧模板路径或废弃输出。  
如果只验证编译成功，不额外检查生成的 `dist` 树，就可能把过期文件、旧模板副本或残留 payload 继续带进发布产物。

## Decision

- 生成、打包和 closeout 流程必须把 `dist` 中的 ghost output 视为失败信号
- 当模板路径、payload 列表或 bundle 源结构发生变化时，验证不能只看 `tsc` 成功，还要确认生成目录里没有旧文件残留
- Codex / OpenCode 的插件 bundle 检查继续以当前 payload 列表为准，防止删掉的模板路径仍然出现在发行目录中

## Consequences

- 旧模板文件不会因为增量编译而悄悄留在发布目录里
- bundle / distribution 测试需要显式覆盖“删源文件后是否仍有遗留输出”这一类回归
- 构建成功不再等于发行物干净，必须再做一次输出树一致性检查

## Related Code

- `scripts/codex-plugin-bundle.mjs`
- `scripts/opencode-plugin-bundle.mjs`
- `scripts/codex-plugin-bundle.test.mjs`
- `scripts/opencode-plugin-bundle.test.mjs`
- `tsconfig.base.json`
- `packages/cli/package.json`
- `packages/core/package.json`

