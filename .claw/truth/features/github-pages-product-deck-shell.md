# GitHub Pages Product Deck Shell

## 状态

这是 `GitHub Pages 产品介绍页` 这轮完成后的稳定实现事实，适合作为后续类似产品页的复用锚点。

## 结论

- 这套产品介绍页保持为 `docs/` 下的零构建静态实现，可以直接作为 GitHub Pages 发布，不依赖额外 build step。
- `README.md` 现在把读者显式导向 `docs/index.html` 作为产品页入口，所以这套 deck 的公开入口已经和 GitHub Pages 壳对齐。
- 当前这轮应当被视为产品页视觉重构 round，而不是普通文案或局部样式微调 round。
- 这类页面的主要失败模式是重复同一套 oversized left-title skeleton，而不是单纯的配色或字号问题。
- 页面内容采用按语言分组的双语数据模型，英文和中文共享同一组 section id，便于滚动叙事页面在两种语言之间保持结构一致。
- 页面脚本拆成了可测试的纯 markup builder 和浏览器端 mount 路径，后者通过 `document` 存在性检查隔离，避免在非浏览器环境下误触发挂载逻辑。
- 这种 `document` 保护让 `node:test` 可以直接导入并验证渲染辅助函数，而不需要先模拟完整浏览器环境。
- 介绍页里的 advanced-features 文案刻意覆盖了 `shared team config`、`personal overrides via .claw/project-override.json`、`custom templates`、`planning skills`、`writer skills`，以及与其他 skills 或自定义 harness 的低干扰兼容性，这一段话术可以直接复用于同类产品页。
- `scripts/product-deck.test.mjs` 用轻量 `node:test` 回归了双语 section 对齐、advanced-features 文案、HTML escaping，以及 section 渲染数量，说明这类页面可以用纯字符串层面的测试维持稳定。
- 对这类静态 bilingual deck 来说，截图驱动的浏览器审查是布局工作的必需决策工具，单靠 CSS 文字推断不足以判断 composition 是否正确。
- hover-first 的细节揭示可以保留，但前提是默认 section composition 已经能独立成立，不需要先点击才能读懂。

## 视觉结论

- hero 通过收紧标题宽度、改成居中单栏叙事，并把抽象视觉降为 supporting role 后得到改善。
- problem 通过停止伪装成 split composition，改为把 bullets 和 note 合并进同一段可读节奏后得到改善。
- continuity 通过把 narrative copy 与 structural proof 分开成两个可读 zone，并减弱 decorative background phrases 后得到改善。
- workflow 仍然最强，因为交互模块本身就是 hero object；标题和 intro 应服务模块，而不是重复同一套大标题骨架。

## 影响

- 以后如果要做同类 scroll-driven bilingual product deck，优先复用这套 `docs/` 静态壳、双语 content model 和纯函数渲染拆分，而不是先引入构建链。
- 这类页面的稳定性重点不是复杂交互，而是语言结构一致、内容模型可共享、以及浏览器挂载逻辑不污染测试环境。
- README 入口、静态站点壳和可直接被测试的渲染辅助函数，三者合起来构成了这类页面最值得保留的长期模板。
- 这轮视觉 refactor 的长期约束是：`docs/assets/product-deck.js` 和 `docs/assets/product-deck.css` 继续承担结构与表现，`docs/assets/product-deck-content.js` 保持跨语言结构对齐。

## 关联代码

- [docs/index.html](D:/Users/chany/Documents/claw-kit/docs/index.html)
- [docs/assets/product-deck-content.js](D:/Users/chany/Documents/claw-kit/docs/assets/product-deck-content.js)
- [docs/assets/product-deck.js](D:/Users/chany/Documents/claw-kit/docs/assets/product-deck.js)
- [docs/assets/product-deck.css](D:/Users/chany/Documents/claw-kit/docs/assets/product-deck.css)
- [scripts/product-deck.test.mjs](D:/Users/chany/Documents/claw-kit/scripts/product-deck.test.mjs)
- [docs/superpowers/specs/2026-07-02-github-pages-product-deck-design.md](D:/Users/chany/Documents/claw-kit/docs/superpowers/specs/2026-07-02-github-pages-product-deck-design.md)
- [docs/superpowers/plans/2026-07-02-github-pages-product-deck-implementation.md](D:/Users/chany/Documents/claw-kit/docs/superpowers/plans/2026-07-02-github-pages-product-deck-implementation.md)

## 关键检索词

- `GitHub Pages`
- `docs/index.html`
- `product-deck-content`
- `product-deck.test.mjs`
- `bilingual section parity`
