import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

test("config guide entrypoint exists and loads dedicated assets", () => {
  const htmlPath = new URL("../docs/config-guide.html", import.meta.url);

  assert.equal(existsSync(htmlPath), true, "expected docs/config-guide.html to exist");

  const html = readFileSync(htmlPath, "utf8");

  assert.match(html, /<link rel="stylesheet" href="\.\/assets\/config-guide\.css/);
  assert.match(html, /<script type="module" src="\.\/assets\/config-guide\.js/);
  assert.match(html, /id="config-guide"/);
});

test("config guide content model covers every supported project.json field", async () => {
  const { configGuideContent } = await import("../docs/assets/config-guide-content.js");
  const requiredFields = [
    "version",
    "maxTasksToKeep",
    "planning",
    "goalMode",
    "truthDispatch",
    "defaultPlanTemplate",
    "contextPaths",
    "externalPlanningSkill",
    "externalTruthSkill",
    "externalAdrSkill",
    "memory.enabled",
    "memory.externalDocPaths",
    "memory.embedding",
    "gitnexus"
  ];

  const enIds = configGuideContent.en.fieldCards.map((card) => card.id);
  const zhIds = configGuideContent.zh.fieldCards.map((card) => card.id);

  assert.deepEqual(zhIds, enIds);
  assert.deepEqual(enIds, requiredFields);
  assert.equal(enIds.includes("id"), false);
  assert.equal(enIds.includes("name"), false);
  assert.equal(configGuideContent.en.fieldCards.every((card) => typeof card.example === "string" && card.example.length > 0), true);
  assert.equal(configGuideContent.zh.fieldCards.every((card) => typeof card.example === "string" && card.example.length > 0), true);
  const zhExternalDocPaths = configGuideContent.zh.fieldCards.find((card) => card.id === "memory.externalDocPaths");
  const zhEmbedding = configGuideContent.zh.fieldCards.find((card) => card.id === "memory.embedding");
  const zhMemoryEnabled = configGuideContent.zh.fieldCards.find((card) => card.id === "memory.enabled");
  const zhVersion = configGuideContent.zh.fieldCards.find((card) => card.id === "version");
  const zhTruthDispatch = configGuideContent.zh.fieldCards.find((card) => card.id === "truthDispatch");
  const zhContextPaths = configGuideContent.zh.fieldCards.find((card) => card.id === "contextPaths");
  assert.match(zhVersion.detail, /claw context/);
  assert.match(zhMemoryEnabled.summary, /memory/);
  assert.match(zhMemoryEnabled.detail, /claw search/);
  assert.match(zhExternalDocPaths.example, /^"memory": \{ "externalDocPaths":/);
  assert.match(zhEmbedding.example, /^"memory": \{ "embedding":/);
  assert.match(zhTruthDispatch.summary, /per_task/);
  assert.match(zhTruthDispatch.summary, /final_only/);
  assert.match(zhTruthDispatch.detail, /per_task/);
  assert.match(zhTruthDispatch.detail, /final_only/);
  assert.match(zhContextPaths.summary, /OpenClaw/);
  assert.match(zhContextPaths.summary, /agents\.md/);
  assert.match(zhContextPaths.example, /agents\.md/);
});

test("config guide renderer exposes a table-style field surface", async () => {
  const { buildGuideMarkup } = await import("../docs/assets/config-guide.js");

  const markup = buildGuideMarkup("zh");

  assert.match(markup, /field-table/);
  assert.match(markup, /field-table-row/);
  assert.match(markup, /field-table-example/);
  assert.match(markup, />字段</);
  assert.match(markup, />用途与示例</);
  assert.doesNotMatch(markup, /concept-stack/);
  assert.match(markup, /example-grid/);
  assert.doesNotMatch(markup, /closing-panel/);
});

test("config guide css includes dedicated zh-CN typography rules", async () => {
  const css = readFileSync(new URL("../docs/assets/config-guide.css", import.meta.url), "utf8");

  assert.match(css, /html:lang\(zh-CN\) \.hero-title/);
  assert.match(css, /html:lang\(zh-CN\) \.section-summary/);
  assert.match(css, /html:lang\(zh-CN\) \.field-table-example code/);
});
