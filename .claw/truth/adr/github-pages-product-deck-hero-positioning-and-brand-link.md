# ADR: GitHub Pages 产品页 hero 定位与入口链接收敛

## Status

Accepted

## Context

GitHub Pages 产品页的首屏需要把 `Claw Kit` 的公开定位收得更明确：面向复杂项目和长时间运行任务，而不是继续用更泛化的协作口号来做第一屏主叙事。

同一轮完成计划还暴露了一个入口层问题：左上角品牌链接仍指向相对 `README.md` 路径，导致 GitHub Pages 入口在公开页面上不稳定，必须改成仓库主页。

## Decision

- 英文 hero 主标题固定为 `Claw Kit, a harness for complex projects and long-running tasks`。
- hero 的 supporting copy 继续解释 `harness` 是面向 agent 工作的 workflow layer，但不能削弱 `complex projects` 和 `long-running tasks` 这条主定位。
- 中文 hero 文案要与同一定位方向对齐，不能回到泛化的协作 slogan。
- 页面左上角品牌链接固定指向 `https://github.com/chanyuenpang/claw-kit`，不再使用相对 `README.md` 路径。
- 与 hero 文案和入口链接相关的静态测试要继续覆盖这两个公开面事实，避免后续改版把定位或入口再改回去。

## Consequences

- 产品页第一屏的公开叙事会更稳定地指向复杂项目和长期任务，减少读者把 `Claw Kit` 误解成通用协作口号的风险。
- `harness` 仍然保留为解释层词汇，但它的职责是帮助理解 workflow layer，而不是替代主定位。
- 左上角品牌链接与 GitHub 仓库主页对齐后，产品页公开入口和仓库主入口保持一致，不再依赖相对路径跳转。
- 相关测试把 hero 文案和入口链接变成可回归事实，后续视觉或内容调整更容易发现定位漂移。

## Related Code

- `docs/index.html`
- `docs/assets/product-deck-content.js`
- `scripts/product-deck.test.mjs`
- `.claw/truth/features/github-pages-product-deck-shell.md`

