# Contributing / 参与贡献

## 报告平台问题

某个宿主上安装、`claw init` 或第一次会话卡住时，用 [平台适配问题](https://github.com/chanyuenpang/claw-kit/issues/new?template=platform-adapter.yml) 表单。它会带上 `platform` 标签。请填写宿主、`claw --version`、操作系统、卡在哪一步、实际和预期，以及去掉密钥后的日志。

仓库里标了 `good first issue` 的问题适合第一次参与。

## Report a platform problem

If install, `claw init`, or the first session gets stuck on a host, open a [platform adapter issue](https://github.com/chanyuenpang/claw-kit/issues/new?template=platform-adapter.yml). The form applies the `platform` label. Include the host, `claw --version`, OS, the step that stuck, what happened versus what you expected, and logs with secrets removed.

Issues labeled `good first issue` are beginner-friendly tasks.

## 本地开发并提交 PR

1. Fork 这个仓库，再克隆你自己的 fork。
2. 安装 Node.js 和 npm，在仓库根目录运行 `npm install`。
3. 改动对应目录。各宿主适配器在 `packages/*-adapter`（例如 `packages/dsh-adapter`、`packages/codex-adapter`、`packages/cindy-adapter`、`packages/opencode-adapter`、`packages/standard-adapter`）。
4. 跑与你改动相称的检查。覆盖面较广的一条是 `npm run check`。
5. 开一个分支，提交，然后向 `main` 发 pull request。

## Set up locally and send a PR

1. Fork the repository and clone your fork.
2. Install Node.js and npm, then run `npm install` at the repository root.
3. Change the package you are working on. Host adapters live under `packages/*-adapter` (for example `packages/dsh-adapter`, `packages/codex-adapter`, `packages/cindy-adapter`, `packages/opencode-adapter`, and `packages/standard-adapter`).
4. Run a check that matches the change. `npm run check` covers the broader suite.
5. Push a branch and open a pull request against `main`.
