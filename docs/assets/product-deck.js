import { deckContent } from "./product-deck-content.js?v=20260721-release-0192";
import {
  buildLocalizedHref,
  persistPreferredLanguage,
  readStoredLanguage,
  resolveInitialLanguage
} from "./site-language.js?v=20260703-pages-refresh";

let currentLang = "en";
let activeSectionId = null;
let sectionObserver = null;
let deck = null;
let langToggle = null;
const supportedLangs = Object.keys(deckContent);

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderPoints(points = []) {
  if (!points.length) {
    return "";
  }

  return `
    <div class="section-points">
      ${points
        .map(
          (point) => `
            <article class="point-card">
              <h3>${escapeHtml(point.label)}</h3>
              <p>${escapeHtml(point.text)}</p>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function renderSteps(steps = []) {
  if (!steps.length) {
    return "";
  }

  const totalCount = String(steps.length).padStart(2, "0");

  return `
    <div class="flow-module">
      <div class="flow-display" data-active-step="0">
        <p class="flow-display-label">
          <span class="flow-display-accent">${escapeHtml(steps[0].accent ?? "")}</span>
          <span class="flow-display-count">01 / ${totalCount}</span>
        </p>
        <p class="flow-display-text">${escapeHtml(steps[0].text)}</p>
      </div>
      <div class="flow-rail">
      ${steps
        .map(
          (step, index) => `
            <article
              class="flow-step ${index === 0 ? "is-current" : ""}"
              data-step-index="${index}"
              data-step-label="${escapeHtml(step.label)}"
              data-step-accent="${escapeHtml(step.accent ?? "")}"
              data-step-text="${escapeHtml(step.text)}"
              data-step-count="${String(index + 1).padStart(2, "0")} / ${totalCount}"
              tabindex="0"
            >
              <span class="flow-step-index">${String(index + 1).padStart(2, "0")}</span>
              <span class="flow-step-accent">${escapeHtml(step.accent ?? "")}</span>
              <h3>${escapeHtml(step.label)}</h3>
              <p>${escapeHtml(step.text)}</p>
            </article>
          `
        )
        .join("")}
      </div>
    </div>
  `;
}

function renderBullets(bullets = []) {
  if (!bullets.length) {
    return "";
  }

  return `
    <div class="problem-bullets">
      ${bullets
        .map(
          (bullet) => `
            <span class="problem-bullet">${escapeHtml(bullet)}</span>
          `
        )
        .join("")}
    </div>
  `;
}

function renderTags(tags = []) {
  if (!tags.length) {
    return "";
  }

  return `
    <div class="host-cloud">
      ${tags.map((tag) => `<span class="host-pill">${escapeHtml(tag)}</span>`).join("")}
    </div>
  `;
}

function renderFeatures(features = []) {
  if (!features.length) {
    return "";
  }

  return `
    <div class="feature-grid">
      ${features
        .map(
          (feature) => `
            <article class="feature-card">
              <h3>${escapeHtml(feature.label)}</h3>
              <p>${escapeHtml(feature.text)}</p>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function renderLinks(links = []) {
  if (!links.length) {
    return "";
  }

  return `
    <div class="closing-links">
      ${links
        .map((link) => {
          if (typeof link === "string") {
            return `<span class="closing-link">${escapeHtml(link)}</span>`;
          }

          const href = buildLocalizedHref(link.href ?? "#", currentLang, supportedLangs);
          return `<a class="closing-link" href="${escapeHtml(href)}">${escapeHtml(link.label ?? "")}</a>`;
        })
        .join("")}
    </div>
  `;
}

function renderCopyPrompt(section) {
  if (!section.copyPrompt) {
    return "";
  }

  const feedback = section.copyFeedback ?? "Copied";
  const hint = section.copyHint ?? "Click to copy";
  const display = section.copyDisplay ?? section.copyPrompt;

  return `
    <button
      type="button"
      class="copy-prompt"
      data-copy-text="${escapeHtml(section.copyPrompt)}"
      data-copy-feedback="${escapeHtml(feedback)}"
      data-copy-hint="${escapeHtml(hint)}"
      aria-label="${escapeHtml(section.copyPrompt)}"
    >
      <span class="copy-prompt-text">${escapeHtml(display)}</span>
      <span class="copy-prompt-status">${escapeHtml(hint)}</span>
    </button>
  `;
}

function renderVisual(section) {
  if (section.variant === "hero") {
    return `
      <div class="section-visual visual-hero" aria-hidden="true">
        <span class="visual-glow visual-glow-a"></span>
        <span class="visual-glow visual-glow-b"></span>
        <span class="visual-device visual-device-a"></span>
        <span class="visual-device visual-device-b"></span>
      </div>
    `;
  }

  if (section.variant === "split") {
    return `
      <div class="section-visual visual-problem" aria-hidden="true">
        <span class="visual-line"></span>
        <span class="visual-line"></span>
        <span class="visual-line"></span>
      </div>
    `;
  }

  if (section.variant === "outcomes") {
    return `
      <div class="section-visual visual-continuity" aria-hidden="true">
        <div class="impact-stack">
          <span>Across sessions</span>
          <span>Back into the repo</span>
          <span>Closed out cleanly</span>
        </div>
      </div>
    `;
  }

  if (section.variant === "flow") {
    return "";
  }

  if (section.variant === "hosts") {
    return `
      <div class="section-visual visual-hosts" aria-hidden="true">
        <span class="host-node">CLI</span>
        <span class="host-node">Codex</span>
        <span class="host-node">OpenCode</span>
        <span class="host-node">OpenClaw</span>
      </div>
    `;
  }

  if (section.variant === "feature-grid") {
    return `
      <div class="section-visual visual-features" aria-hidden="true">
        <span class="feature-accent"></span>
        <span class="feature-accent"></span>
      </div>
    `;
  }

  if (section.variant === "closing") {
    return `
      <div class="section-visual visual-closing" aria-hidden="true">
        <span class="closing-wave"></span>
      </div>
    `;
  }

  return "";
}

function renderSectionBody(section) {
  const lead = `
    <div class="section-lead">
      <p class="section-eyebrow">${escapeHtml(section.eyebrow)}</p>
      <h2 class="section-title">${escapeHtml(section.title)}</h2>
      <p class="section-summary">${escapeHtml(section.summary)}</p>
    </div>
  `;

  if (section.variant === "hero") {
    return `
      <div class="hero-layout">
        <div class="hero-copy">
          ${lead}
          <div class="section-detail detail-inline"><p>${escapeHtml(section.detail)}</p></div>
        </div>
        ${renderVisual(section)}
      </div>
    `;
  }

  if (section.variant === "split") {
    return `
      <div class="split-layout problem-layout">
        <div class="problem-copy">
          ${lead}
          ${renderVisual(section)}
          ${renderBullets(section.bullets)}
        </div>
        <div class="section-detail detail-inline problem-note"><p>${escapeHtml(section.detail)}</p></div>
      </div>
    `;
  }

  if (section.variant === "outcomes") {
    return `
      <div class="continuity-layout">
        <div class="continuity-copy">
          ${lead}
          <div class="section-detail detail-inline"><p>${escapeHtml(section.detail)}</p></div>
        </div>
        <div class="continuity-side">
          ${renderVisual(section)}
          ${renderPoints(section.points)}
        </div>
      </div>
    `;
  }

  if (section.variant === "flow") {
    return `
      <div class="flow-layout">
        <div class="flow-header">
          <div class="flow-intro">
            ${lead}
            <div class="section-detail detail-inline"><p>${escapeHtml(section.detail)}</p></div>
          </div>
          ${renderVisual(section)}
        </div>
        ${renderSteps(section.steps)}
      </div>
    `;
  }

  if (section.variant === "hosts") {
    return `
      ${lead}
      ${renderVisual(section)}
      ${renderTags(section.tags)}
      <div class="section-detail"><p>${escapeHtml(section.detail)}</p></div>
    `;
  }

  if (section.variant === "feature-grid") {
    return `
      <div class="feature-layout">
        <div class="feature-head">
          ${lead}
          <div class="section-detail detail-inline"><p>${escapeHtml(section.detail)}</p></div>
        </div>
        <div class="feature-side">
          ${renderVisual(section)}
          ${renderFeatures(section.features)}
        </div>
      </div>
    `;
  }

  if (section.variant === "closing") {
    const detailMarkup = section.detail
      ? `<div class="section-detail detail-inline"><p>${escapeHtml(section.detail)}</p></div>`
      : "";

    return `
      <div class="closing-layout">
        <div class="closing-copy">
          ${lead}
          ${detailMarkup}
          ${renderCopyPrompt(section)}
        </div>
        ${renderVisual(section)}
        ${renderLinks(section.links)}
      </div>
    `;
  }

  return `${lead}<div class="section-detail"><p>${escapeHtml(section.detail)}</p></div>`;
}

export function buildSectionMarkup(section, index) {
  return `
    <section
      id="${escapeHtml(section.id)}"
      class="deck-section deck-section--${escapeHtml(section.variant)} deck-section--${escapeHtml(section.id)}"
      data-section-id="${escapeHtml(section.id)}"
      data-index="${index}"
      tabindex="0"
    >
      <div class="section-shell">
        ${renderSectionBody(section)}
      </div>
    </section>
  `;
}

export function buildDeckMarkup(lang) {
  const { sections } = deckContent[lang];
  return sections.map((section, index) => buildSectionMarkup(section, index)).join("");
}

function setDocumentLanguage(lang) {
  const { pageTitle } = deckContent[lang];
  if (typeof document === "undefined") {
    return;
  }
  document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  document.title = pageTitle;
}

function renderDeck(lang) {
  if (!deck) {
    return;
  }

  setDocumentLanguage(lang);
  deck.innerHTML = buildDeckMarkup(lang);

  if (!activeSectionId) {
    activeSectionId = deckContent[lang].sections[0]?.id ?? null;
  }
}

function setActiveSection(sectionId) {
  activeSectionId = sectionId;
  if (typeof document === "undefined") {
    return;
  }

  document.querySelectorAll(".deck-section").forEach((section) => {
    const isActive = section.dataset.sectionId === sectionId;
    section.classList.toggle("is-active", isActive);
    section.querySelector(".section-detail")?.setAttribute("aria-hidden", String(!isActive));
  });
}

function wireSectionInteractions() {
  if (typeof document === "undefined") {
    return;
  }

  const sections = document.querySelectorAll(".deck-section");
  sections.forEach((section) => {
    const id = section.dataset.sectionId;

    section.addEventListener("mouseenter", () => setActiveSection(id));
    section.addEventListener("focusin", () => setActiveSection(id));
    section.addEventListener("click", () => {
      if (window.matchMedia("(hover: none)").matches) {
        setActiveSection(activeSectionId === id ? null : id);
      }
    });
  });
}

function setFlowStep(stepElement) {
  const module = stepElement.closest(".flow-module");
  if (!module) {
    return;
  }

  const display = module.querySelector(".flow-display");
  const accent = display?.querySelector(".flow-display-accent");
  const count = display?.querySelector(".flow-display-count");
  const text = display?.querySelector(".flow-display-text");

  module.querySelectorAll(".flow-step").forEach((step) => {
    step.classList.toggle("is-current", step === stepElement);
  });

  if (display) {
    display.dataset.activeStep = stepElement.dataset.stepIndex ?? "0";
  }
  if (accent) {
    accent.textContent = stepElement.dataset.stepAccent ?? "";
  }

  if (count) {
    count.textContent = stepElement.dataset.stepCount ?? "";
  }
  if (text) {
    text.textContent = stepElement.dataset.stepText ?? "";
  }
}

function wireFlowInteractions() {
  if (typeof document === "undefined") {
    return;
  }

  document.querySelectorAll(".flow-step").forEach((step) => {
    step.addEventListener("mouseenter", () => setFlowStep(step));
    step.addEventListener("focusin", () => setFlowStep(step));
    step.addEventListener("click", () => setFlowStep(step));
  });
}

async function copyPromptText(button) {
  const text = button.dataset.copyText ?? "";
  if (!text) {
    return false;
  }

  if (navigator?.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }

  const tempInput = document.createElement("textarea");
  tempInput.value = text;
  tempInput.setAttribute("readonly", "true");
  tempInput.style.position = "absolute";
  tempInput.style.left = "-9999px";
  document.body.append(tempInput);
  tempInput.select();
  const copied = document.execCommand("copy");
  tempInput.remove();
  return copied;
}

function wireCopyPrompts() {
  if (typeof document === "undefined") {
    return;
  }

  document.querySelectorAll(".copy-prompt").forEach((button) => {
    button.addEventListener("click", async () => {
      const status = button.querySelector(".copy-prompt-status");
      const feedback = button.dataset.copyFeedback ?? "Copied";
      const hint = button.dataset.copyHint ?? "Click to copy";

      try {
        const copied = await copyPromptText(button);
        if (!copied) {
          return;
        }
        button.classList.add("is-copied");
        if (status) {
          status.textContent = feedback;
        }
        window.setTimeout(() => {
          button.classList.remove("is-copied");
          if (status) {
            status.textContent = hint;
          }
        }, 1600);
      } catch {
        button.classList.remove("is-copied");
      }
    });
  });
}

function wireScrollObserver() {
  if (typeof document === "undefined" || typeof IntersectionObserver === "undefined") {
    return;
  }

  if (sectionObserver) {
    sectionObserver.disconnect();
  }

  sectionObserver = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

      if (!visible || document.activeElement?.closest(".deck-section")) {
        return;
      }

      setActiveSection(visible.target.dataset.sectionId);
    },
    {
      threshold: [0.35, 0.6, 0.8]
    }
  );

  document.querySelectorAll(".deck-section").forEach((section) => sectionObserver.observe(section));
}

function updateLangToggle() {
  if (!langToggle) {
    return;
  }

  const isZh = currentLang === "zh";
  langToggle.setAttribute("aria-pressed", String(isZh));
  langToggle.dataset.lang = currentLang;
}

function getInitialLanguage() {
  if (typeof window === "undefined") {
    return "en";
  }

  return resolveInitialLanguage({
    search: window.location.search,
    storageValue: readStoredLanguage(window.localStorage),
    fallbackLang: "en",
    supportedLangs
  });
}

function switchLanguage(nextLang) {
  if (!deck || !langToggle || nextLang === currentLang || !deckContent[nextLang]) {
    return;
  }

  currentLang = nextLang;
  persistPreferredLanguage(window.localStorage, currentLang, supportedLangs);
  const previouslyActive = activeSectionId;
  renderDeck(currentLang);
  wireSectionInteractions();
  wireFlowInteractions();
  wireCopyPrompts();
  wireScrollObserver();
  updateLangToggle();
  if (previouslyActive) {
    setActiveSection(previouslyActive);
  }
}

export function mountProductDeck() {
  if (typeof document === "undefined") {
    return;
  }

  deck = document.querySelector("#deck");
  langToggle = document.querySelector(".lang-toggle");

  if (!deck || !langToggle) {
    return;
  }

  currentLang = getInitialLanguage();
  renderDeck(currentLang);
  wireSectionInteractions();
  wireFlowInteractions();
  wireCopyPrompts();
  wireScrollObserver();
  updateLangToggle();

  if (activeSectionId) {
    setActiveSection(activeSectionId);
  }

  langToggle.addEventListener("click", () => {
    switchLanguage(currentLang === "en" ? "zh" : "en");
  });

  window.__productDeckSetLanguage = switchLanguage;
}

if (typeof document !== "undefined") {
  mountProductDeck();
}
