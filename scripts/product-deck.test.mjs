import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

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

test("closing section renders meaningful navigation links", () => {
  const closingZh = deckContent.zh.sections.find((section) => section.id === "closing");
  const closingEn = deckContent.en.sections.find((section) => section.id === "closing");

  assert.ok(closingZh);
  assert.ok(closingEn);

  const zhMarkup = buildSectionMarkup(closingZh, 0);
  const enMarkup = buildSectionMarkup(closingEn, 0);

  assert.match(
    zhMarkup,
    /<a class="closing-link" href="https:\/\/github\.com\/chanyuenpang\/claw-kit#readme">查看文档<\/a>/
  );
  assert.match(
    zhMarkup,
    /<a class="closing-link" href="\.\/technical-principles\.html\?lang=en">技术原理<\/a>/
  );
  assert.match(
    zhMarkup,
    /<a class="closing-link" href="\.\/config-guide\.html\?lang=en">配置说明<\/a>/
  );

  assert.match(
    enMarkup,
    /<a class="closing-link" href="https:\/\/github\.com\/chanyuenpang\/claw-kit#readme">Read the docs<\/a>/
  );
  assert.match(
    enMarkup,
    /<a class="closing-link" href="\.\/technical-principles\.html\?lang=en">Technical principles<\/a>/
  );
  assert.match(
    enMarkup,
    /<a class="closing-link" href="\.\/config-guide\.html\?lang=en">Config guide<\/a>/
  );
});

test("hero copy positions claw-kit around complex projects and long-running tasks", () => {
  const heroEn = deckContent.en.sections.find((section) => section.id === "hero");
  const heroZh = deckContent.zh.sections.find((section) => section.id === "hero");

  assert.ok(heroEn);
  assert.ok(heroZh);
  assert.equal(heroEn.title, "Claw Kit, a harness for complex projects and long-running tasks");
  assert.equal(
    heroEn.summary,
    "A workflow layer for agent work that keeps planning, context, execution, and closeout connected across the life of a project."
  );
  assert.match(heroZh.title, /复杂项目/);
  assert.match(heroZh.title, /长时任务/);
  assert.match(heroZh.summary, /workflow layer/i);
});

test("top-left brand link points to the GitHub repository homepage", () => {
  const indexHtml = readFileSync(new URL("../docs/index.html", import.meta.url), "utf8");

  assert.match(
    indexHtml,
    /<a class="brand" href="https:\/\/github\.com\/chanyuenpang\/claw-kit" aria-label="claw-kit repository">/
  );
});

test("english hero and workflow titles opt into explicit centered layout rules", () => {
  const css = readFileSync(new URL("../docs/assets/product-deck.css", import.meta.url), "utf8");
  const heroTitleRule =
    Array.from(css.matchAll(/\.deck-section--hero \.section-title\s*\{([^}]*)\}/g))
      .map((match) => match[1])
      .find((rule) => /text-align:\s*center;/.test(rule)) ?? "";
  const workflowTitleRule =
    Array.from(css.matchAll(/\.deck-section--workflow \.section-title\s*\{([^}]*)\}/g))
      .map((match) => match[1])
      .find((rule) => /text-align:\s*center;/.test(rule)) ?? "";

  assert.match(heroTitleRule, /margin-inline:\s*auto;/);
  assert.match(heroTitleRule, /text-align:\s*center;/);
  assert.match(workflowTitleRule, /margin-inline:\s*auto;/);
  assert.match(workflowTitleRule, /text-align:\s*center;/);
});

test("chinese hero title keeps a dedicated wider layout rule", () => {
  const css = readFileSync(new URL("../docs/assets/product-deck.css", import.meta.url), "utf8");
  const zhHeroRule =
    Array.from(css.matchAll(/html:lang\(zh-CN\) \.deck-section--hero \.section-title\s*\{([^}]*)\}/g))
      .map((match) => match[1])
      .at(-1) ?? "";

  assert.match(zhHeroRule, /max-width:\s*8\.8em;/);
  assert.match(zhHeroRule, /line-height:\s*1\.18;/);
});

test("ecosystem title uses a moderated size instead of the oversized display scale", () => {
  const css = readFileSync(new URL("../docs/assets/product-deck.css", import.meta.url), "utf8");
  const ecosystemRule =
    Array.from(css.matchAll(/\.deck-section--ecosystem \.section-title\s*\{([^}]*)\}/g))
      .map((match) => match[1])
      .find((rule) => /max-width:\s*10\.5ch;/.test(rule)) ?? "";

  assert.match(ecosystemRule, /max-width:\s*10\.5ch;/);
  assert.match(ecosystemRule, /font-size:\s*clamp\(2\.35rem,\s*4\.2vw,\s*3\.8rem\);/);
  assert.match(ecosystemRule, /line-height:\s*1\.04;/);
});

test("deck sections suppress the browser default outline when anchor navigation targets them", () => {
  const css = readFileSync(new URL("../docs/assets/product-deck.css", import.meta.url), "utf8");
  const deckSectionRule =
    Array.from(css.matchAll(/\.deck-section\s*\{([^}]*)\}/g))
      .map((match) => match[1])
      .find((rule) => /position:\s*relative;/.test(rule)) ?? "";

  assert.match(deckSectionRule, /outline:\s*none;/);
});

test("closing section suppresses the decorative wave line", () => {
  const css = readFileSync(new URL("../docs/assets/product-deck.css", import.meta.url), "utf8");
  const closingVisualRule =
    Array.from(css.matchAll(/\.visual-closing\s*\{([^}]*)\}/g))
      .map((match) => match[1])
      .find((rule) => /display:\s*none;/.test(rule)) ?? "";

  assert.match(closingVisualRule, /display:\s*none;/);
});

test("ecosystem section suppresses the mid-page divider line", () => {
  const css = readFileSync(new URL("../docs/assets/product-deck.css", import.meta.url), "utf8");
  const ecosystemAfterRule =
    Array.from(css.matchAll(/\.deck-section--ecosystem \.section-shell::after\s*\{([^}]*)\}/g))
      .map((match) => match[1])
      .find((rule) => /display:\s*none;/.test(rule)) ?? "";

  assert.match(ecosystemAfterRule, /display:\s*none;/);
});
