# 技术原理页插图重绘

## 状态

这是 `docs/technical-principles.html` 在本轮完成后沉淀下来的稳定事实，适合作为后续技术原理页插图改版的约束锚点。

## 结论

- 当技术原理页的 storyboard 脚本已经被用户确认后，`svg.mini-diagram` 这类内联 SVG 占位图就不应再作为最终说明图使用。
- 本轮接受的落地方向是：把说明图拆成独立图片资产，由 `imagegen` 生成并在 `docs/technical-principles.html` 中引用，而不是继续保留内联占位图。
- 视觉结构应保持为 6 组并排对照图，每组都明确标成 `传统方式` vs `Claw-Kit 方式`，而不是长篇连环漫画或抽象流程图。
- 预览验证必须确认浏览器里实际展示的是新图片资产，而不是 `file://` 缓存、旧页面状态或仍在渲染的内联 SVG 占位图。

## 长期行为 / 规则

- 技术原理页的图像层责任和页面文案层责任要分开：页面负责叙事和引用，图片资产负责承载具体说明图。
- 一旦用户已经确认了分镜脚本，后续只允许围绕已确认脚本生成或替换图片，不应再退回到抽象占位图。
- 预览验证的目标是浏览器实际显示结果，不是“本地文件能打开”或“路径看起来指向正确”。
- 如果截图或页面检查看到的还是旧占位图，说明缓存或引用链路还没有真正切到新资产，不能算完成。

## 分镜与视觉规范

- 这组技术原理插图的 accepted format 是 6 张并排对比说明图，不是长篇漫画，也不是抽象向量占位图。
- 每一张图都必须把 storyboard 里的具体对象、标签、角色表情和 bottom-line takeaway 明确画出来；“大致相似”的示意图不算达标。
- 成功的 `imagegen` 输出应当接近中文解释型漫画信息图：粗线条、清晰中文标注、白色或浅色背景、左右均衡构图，以及明显的底部 takeaway 横幅。
- 第一轮被批准的方向已经证明：`docs/assets/technical-principles/` 下可以放 raster 图片资产，而且可以按 section 进行独立文件归属与管理。

## 关联代码

- [docs/technical-principles.html](D:/Users/chany/Documents/claw-kit/docs/technical-principles.html)
- [docs/assets/technical-principles/](D:/Users/chany/Documents/claw-kit/docs/assets/technical-principles/)

## 关键检索词

- `technical-principles`
- `mini-diagram`
- `imagegen`
- `file://`
- `传统方式`
- `Claw-Kit 方式`
- `bottom takeaway`
- `docs/assets/technical-principles/`