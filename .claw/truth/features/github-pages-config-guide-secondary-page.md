# GitHub Pages Config Guide Secondary Page

<!-- state: current -->
## 状态

这是 `GitHub Pages 配置说明页` 这轮完成后沉淀下来的稳定实现事实，适合作为后续第二层静态文档页的复用锚点。

## 结论

- `docs/config-guide.html` 应当被视为 `docs/` 下的零构建静态二级页面，可以直接作为 GitHub Pages 发布面的一部分，不需要额外 build step。
- 这类二级页面最好继续采用“每页一套内容 + 每页一套渲染 + 每页一套样式”的拆分方式；本轮对应的专用资产是 `docs/assets/config-guide-content.js`、`docs/assets/config-guide.js` 和 `docs/assets/config-guide.css`。
- 首页产品 deck 的最终收口链接已经指向 `./config-guide.html`，并使用 `Config guide / 配置说明` 这种双语标签，因此首页到二级页面的导航本身也是可回归的稳定面。
- `scripts/product-deck.test.mjs` 负责首页 deck 的入口回归，而 `scripts/config-guide.test.mjs` 负责配置说明页本身的内容和渲染回归；这类跨页导航最好继续由聚焦的脚本级测试覆盖。
- 配置说明页使用轻量 field card 语言解释所有支持的 `.claw/project.json` 字段，适合面向产品读者做说明，但 `docs/project-json-reference.md` 仍然是更深的 canonical 细节层。
- `autoCommitKnowledge` 的中英文 field card 都公开说明默认值为 `true`；设为 `false` 时，finalization 仍写入并治理 Truth/ADR、记录成功结果并排队刷新索引，只把文档改动留在工作区不自动提交。项目配置示例也显式展示了该字段。
- 这意味着公开页应该保持“解释型、可读性优先”，而不是把 canonical reference 直接搬到产品页里。

## 影响

- 以后如果再加第二层 GitHub Pages 文档，优先复用这种静态页面壳和独立资产拆分，而不是先引入构建链或共享一个笨重的全站脚本。
- 首页到二级页的跳转应继续被当作产品入口合同的一部分，而不是纯导航细节。
- 产品页和 reference 页的职责分层已经固定下来：产品页讲“怎么理解”，`docs/project-json-reference.md` 讲“完整字段细节”。

## 关联代码

- `docs/config-guide.html`
- `docs/assets/config-guide-content.js`
- `docs/assets/config-guide.js`
- `docs/assets/config-guide.css`
- `scripts/config-guide.test.mjs`
- `scripts/product-deck.test.mjs`
- `docs/project-json-reference.md`

## 关键检索词

- `config-guide`
- `docs/config-guide.html`
- `Config guide / 配置说明`
- `docs/project-json-reference.md`
- `zero-build static docs`
