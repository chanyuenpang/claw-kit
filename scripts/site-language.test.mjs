import test from "node:test";
import assert from "node:assert/strict";

import {
  LANGUAGE_STORAGE_KEY,
  buildLocalizedHref,
  persistPreferredLanguage,
  resolveInitialLanguage
} from "../docs/assets/site-language.js";

test("resolveInitialLanguage prefers the persisted language when there is no query override", () => {
  assert.equal(
    resolveInitialLanguage({
      search: "",
      storageValue: "zh",
      fallbackLang: "en",
      supportedLangs: ["en", "zh"]
    }),
    "zh"
  );
});

test("resolveInitialLanguage lets the query string override persisted language", () => {
  assert.equal(
    resolveInitialLanguage({
      search: "?lang=en",
      storageValue: "zh",
      fallbackLang: "en",
      supportedLangs: ["en", "zh"]
    }),
    "en"
  );
});

test("persistPreferredLanguage writes the chosen language using the shared storage key", () => {
  const writes = [];
  const storage = {
    setItem(key, value) {
      writes.push([key, value]);
    }
  };

  persistPreferredLanguage(storage, "zh", ["en", "zh"]);

  assert.deepEqual(writes, [[LANGUAGE_STORAGE_KEY, "zh"]]);
});

test("persistPreferredLanguage ignores unsupported language values", () => {
  const writes = [];
  const storage = {
    setItem(key, value) {
      writes.push([key, value]);
    }
  };

  persistPreferredLanguage(storage, "fr", ["en", "zh"]);

  assert.deepEqual(writes, []);
});

test("buildLocalizedHref appends the active language to relative html links", () => {
  assert.equal(buildLocalizedHref("./index.html", "zh"), "./index.html?lang=zh");
  assert.equal(buildLocalizedHref("./config-guide.html", "en"), "./config-guide.html?lang=en");
});

test("buildLocalizedHref leaves external links unchanged", () => {
  assert.equal(
    buildLocalizedHref("https://github.com/chanyuenpang/claw-kit#readme", "zh"),
    "https://github.com/chanyuenpang/claw-kit#readme"
  );
});
