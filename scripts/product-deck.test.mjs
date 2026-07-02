import test from "node:test";
import assert from "node:assert/strict";

import { deckContent } from "../docs/assets/product-deck-content.js";
import { buildDeckMarkup, buildSectionMarkup } from "../docs/assets/product-deck.js";

test("deck content keeps the same section ids across languages", () => {
  const enIds = deckContent.en.sections.map((section) => section.id);
  const zhIds = deckContent.zh.sections.map((section) => section.id);

  assert.deepEqual(zhIds, enIds);
});

test("advanced features section contains customization and extension messaging", () => {
  const enAdvanced = deckContent.en.sections.find((section) => section.id === "advanced-features");
  const zhAdvanced = deckContent.zh.sections.find((section) => section.id === "advanced-features");

  assert.ok(enAdvanced);
  assert.ok(zhAdvanced);
  assert.match(enAdvanced.detail, /config-driven|customizable|harness/i);
  assert.match(
    enAdvanced.features.map((feature) => feature.text).join(" "),
    /project-override\.json/
  );
  assert.match(
    enAdvanced.features.map((feature) => feature.text).join(" "),
    /writer skill|custom harness|harnesses/i
  );
  assert.match(zhAdvanced.detail, /配置驱动|定制化|harness/);
  assert.match(
    zhAdvanced.features.map((feature) => feature.text).join(" "),
    /project-override\.json/
  );
  assert.match(
    zhAdvanced.features.map((feature) => feature.text).join(" "),
    /plan skill|writer skill|自定义 harness/
  );
});

test("buildSectionMarkup escapes raw HTML in content fields", () => {
  const markup = buildSectionMarkup(
    {
      id: "xss-check",
      eyebrow: "08",
      title: "<script>alert(1)</script>",
      summary: "Safe <b>summary</b>",
      detail: "Escape <img src=x onerror=alert(1)> detail"
    },
    0
  );

  assert.doesNotMatch(markup, /<script>/);
  assert.match(markup, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(markup, /Safe &lt;b&gt;summary&lt;\/b&gt;/);
});

test("buildDeckMarkup returns all sections for each language", () => {
  const enMarkup = buildDeckMarkup("en");
  const zhMarkup = buildDeckMarkup("zh");

  assert.equal((enMarkup.match(/class="deck-section /g) ?? []).length, deckContent.en.sections.length);
  assert.equal((zhMarkup.match(/class="deck-section /g) ?? []).length, deckContent.zh.sections.length);
});

test("closing section renders a copyable install prompt", () => {
  const closing = deckContent.zh.sections.find((section) => section.id === "closing");

  assert.ok(closing);

  const markup = buildSectionMarkup(closing, 0);

  assert.match(markup, /copy-prompt/);
  assert.match(markup, /copy-prompt-text">“帮我安装 claw-kit 插件”</);
  assert.match(
    markup,
    /data-copy-text="帮我安装 claw-kit 插件和 CLI，项目地址：https:\/\/github\.com\/chanyuenpang\/claw-kit"/
  );
  assert.match(markup, /文本已复制/);
});
