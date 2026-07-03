export const LANGUAGE_STORAGE_KEY = "claw-kit-preferred-language";

export function resolveInitialLanguage({
  search = "",
  storageValue = null,
  fallbackLang = "en",
  supportedLangs = ["en", "zh"]
} = {}) {
  const queryLang = new URLSearchParams(search).get("lang");

  if (supportedLangs.includes(queryLang)) {
    return queryLang;
  }

  if (supportedLangs.includes(storageValue)) {
    return storageValue;
  }

  return fallbackLang;
}

export function readStoredLanguage(storage, storageKey = LANGUAGE_STORAGE_KEY) {
  try {
    return storage?.getItem?.(storageKey) ?? null;
  } catch {
    return null;
  }
}

export function persistPreferredLanguage(
  storage,
  lang,
  supportedLangs = ["en", "zh"],
  storageKey = LANGUAGE_STORAGE_KEY
) {
  if (!supportedLangs.includes(lang)) {
    return;
  }

  try {
    storage?.setItem?.(storageKey, lang);
  } catch {
    // Ignore storage failures so static docs still render normally.
  }
}

export function buildLocalizedHref(href, lang, supportedLangs = ["en", "zh"]) {
  if (!href || !supportedLangs.includes(lang)) {
    return href;
  }

  if (!/^(?:\.\/|\.\.\/).+\.html(?:[?#].*)?$/i.test(href)) {
    return href;
  }

  const [base, hash = ""] = href.split("#");
  const [path, query = ""] = base.split("?");
  const params = new URLSearchParams(query);
  params.set("lang", lang);
  const nextQuery = params.toString();

  return `${path}${nextQuery ? `?${nextQuery}` : ""}${hash ? `#${hash}` : ""}`;
}
