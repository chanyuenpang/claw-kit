# ADR: GitHub Pages config guide keeps a zero-build layered doc surface

## Status

Accepted

## Context

这轮 GitHub Pages 配置说明页要在 `docs/` 下承接比首页更密集的 `.claw/project.json` 说明，但项目公开面已经通过 `docs/index.html` 形成了稳定的零构建静态壳。为了避免为了“讲清配置”而引入新的站点框架，也为了不把首页做成大杂烩导航，需要把页面层级和信息密度边界固定下来。

同时，`docs/project-json-reference.md` 已经承担 canonical 深度参考职责，尤其是那些更细的 override、`null` 行为和 embedding 边界，不适合在面向浏览器浏览的配置说明页里重复展开。

## Decision

- GitHub Pages 公共页面继续保持 `docs/` 下的 zero-build / static 形态，直接由 GitHub Pages 发布，不为配置教育引入新的站点框架或构建层。
- 首页只保留轻量的第一层产品入口；像 config guide 这样的二层文档，统一从首页 closing area 进入，而不是扩展首页主导航。
- `docs/config-guide.html` 可以采用更密集的产品化 sections 和轻量 field cards 来解释 `.claw/project.json`，但深层 override 语义、`null` 语义和 embedding 边界继续留在 `docs/project-json-reference.md`。

## Alternatives

- 引入新的文档站点框架：被拒绝，因为会增加 build、部署和维护复杂度，而且与当前 GitHub Pages 静态发布模型不一致。
- 把 config guide 放进首页主导航：被拒绝，因为首页需要保持第一层定位清晰，二层配置说明应当作为延展阅读而不是主入口。
- 在 config guide 里完整复制 canonical reference：被拒绝，因为这样会让页面变成参考手册，削弱产品化阅读体验，也容易让权威来源分叉。

## Consequences

- GitHub Pages 继续保持低复杂度发布路径，后续内容迭代不需要额外站点工程。
- 首页可以继续承担产品叙事和少量入口，二层配置说明不会挤占主导航空间。
- `docs/project-json-reference.md` 继续作为深度规则的权威参考，config guide 负责浏览器里的快速理解与路径引导。

## Related Code

- `docs/index.html`
- `docs/config-guide.html`
- `docs/assets/config-guide.css`
- `docs/assets/config-guide.js`
- `docs/assets/config-guide-content.js`
- `docs/project-json-reference.md`
- `README.md`
- `scripts/product-deck.test.mjs`

## Search Terms

- `GitHub Pages`
- `zero-build`
- `static docs`
- `config guide`
- `homepage closing area`
- `project-json-reference`
- `field cards`
