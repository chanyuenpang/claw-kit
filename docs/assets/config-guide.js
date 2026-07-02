import { configGuideContent } from "./config-guide-content.js";

let currentLang = "en";
let guide = null;
let langToggle = null;

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderModelCards(cards) {
  return `
    <div class="model-grid">
      ${cards
        .map(
          (card) => `
            <article class="model-card" data-model-id="${escapeHtml(card.id)}">
              <p class="model-card-label">${escapeHtml(card.label)}</p>
              <p class="model-card-text">${escapeHtml(card.text)}</p>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function renderFieldCards(cards, lang) {
  const headers = lang === "zh"
    ? { field: "字段", usage: "用途与示例" }
    : { field: "Field", usage: "How to use it" };
  return `
    <div class="field-table" role="table">
      <div class="field-table-head" role="rowgroup">
        <div class="field-table-row field-table-row--head" role="row">
          <div class="field-table-cell" role="columnheader">${escapeHtml(headers.field)}</div>
          <div class="field-table-cell field-table-cell--wide" role="columnheader">${escapeHtml(headers.usage)}</div>
        </div>
      </div>
      <div class="field-table-body" role="rowgroup">
      ${cards
        .map(
          (card) => `
            <article class="field-table-row" data-field-id="${escapeHtml(card.id)}" role="row">
              <div class="field-table-cell" role="cell">
                <p class="field-card-group">${escapeHtml(card.group)}</p>
                <h3 class="field-card-title"><code>${escapeHtml(card.id)}</code></h3>
              </div>
              <div class="field-table-cell field-table-cell--wide" role="cell">
                <p class="field-card-kicker">${escapeHtml(card.title)}</p>
                <p class="field-card-summary">${escapeHtml(card.summary)}</p>
                <p class="field-card-detail">${escapeHtml(card.detail)}</p>
                <p class="field-table-example"><code>${escapeHtml(card.example)}</code></p>
              </div>
            </article>
          `
        )
        .join("")}
      </div>
    </div>
  `;
}

function renderExamples(examples) {
  return `
    <div class="example-grid">
      ${examples
        .map(
          (example) => `
            <article class="example-card">
              <h3>${escapeHtml(example.title)}</h3>
              <pre><code>${escapeHtml(example.body)}</code></pre>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

export function buildGuideMarkup(lang) {
  const content = configGuideContent[lang];

  return `
    <section class="hero-panel">
      <p class="section-eyebrow">${escapeHtml(content.hero.eyebrow)}</p>
      <h1 class="hero-title">${escapeHtml(content.hero.title)}</h1>
      <p class="hero-summary">${escapeHtml(content.hero.summary)}</p>
      <p class="hero-detail">${escapeHtml(content.hero.detail)}</p>
    </section>

    <section class="guide-section">
      <div class="section-header">
        <p class="section-eyebrow">${lang === "zh" ? "配置层级" : "config model"}</p>
        <h2 class="section-title">${lang === "zh" ? "先区分共享配置和个人覆盖。" : "Separate shared config from local override first."}</h2>
        <p class="section-summary">${lang === "zh" ? "下表只保留通常需要手动调整的配置项。像 id、name 这类通常在初始化阶段确定的字段，不放进手动配置表。" : "The table below only keeps fields teams usually change by hand. Fields such as id and name are typically set during initialization, so they stay out of the manual config table."}</p>
      </div>
      ${renderModelCards(content.modelCards)}
    </section>

    <section class="guide-section">
      <div class="section-header">
        <p class="section-eyebrow">${lang === "zh" ? "配置表" : "config table"}</p>
        <h2 class="section-title">${lang === "zh" ? "可手动配置项" : "Manual config fields"}</h2>
        <p class="section-summary">${lang === "zh" ? "左侧是字段名，右侧是用途说明和一条最常见的单行示例。" : "The left side shows the field name. The right side gives a short explanation plus one common single-line example."}</p>
      </div>
      ${renderFieldCards(content.fieldCards, lang)}
    </section>

    <section class="guide-section">
      <div class="section-header">
        <p class="section-eyebrow">${lang === "zh" ? "配置案例" : "examples"}</p>
        <h2 class="section-title">${lang === "zh" ? "常见配置写法" : "Common config shapes"}</h2>
      </div>
      ${renderExamples(content.examples ?? [])}
    </section>
  `;
}

function updateDocumentLanguage(lang) {
  const content = configGuideContent[lang];
  document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  document.title = content.pageTitle;
}

function renderGuide(lang) {
  if (!guide) {
    return;
  }

  updateDocumentLanguage(lang);
  guide.innerHTML = buildGuideMarkup(lang);
}

function updateLangToggle() {
  if (!langToggle) {
    return;
  }

  const isZh = currentLang === "zh";
  langToggle.setAttribute("aria-pressed", String(isZh));
  langToggle.dataset.lang = currentLang;
}

export function mountConfigGuide() {
  if (typeof document === "undefined") {
    return;
  }

  guide = document.querySelector("#config-guide");
  langToggle = document.querySelector(".lang-toggle");

  if (!guide || !langToggle) {
    return;
  }

  renderGuide(currentLang);
  updateLangToggle();

  langToggle.addEventListener("click", () => {
    currentLang = currentLang === "en" ? "zh" : "en";
    renderGuide(currentLang);
    updateLangToggle();
  });
}

if (typeof document !== "undefined") {
  mountConfigGuide();
}
