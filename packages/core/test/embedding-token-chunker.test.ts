import test from "node:test";
import assert from "node:assert/strict";
import { splitTextsIntoTokenWindows } from "../src/embedding-token-chunker.js";

const countCodePointTokens = (text: string): number => Array.from(text).length + 2;

test("token-aware embedding chunks stay below the tokenizer limit and preserve overlap", () => {
  const text = Array.from({ length: 1200 }, (_, index) => String.fromCodePoint(0x4e00 + (index % 200))).join("");
  const segments = splitTextsIntoTokenWindows(
    [text],
    countCodePointTokens,
    { targetTokens: 448, overlapTokens: 64 },
  );

  assert.ok(segments.length > 1);
  assert.ok(segments.every((segment) => countCodePointTokens(segment.text) <= 448));
  assert.ok(segments.every((segment) => segment.sourceTextIndex === 0));
  for (let index = 1; index < segments.length; index += 1) {
    const previous = segments[index - 1]?.text ?? "";
    const current = segments[index]?.text ?? "";
    assert.ok(previous.length > 0 && current.length > 0);
    assert.ok(previous.includes(current.slice(0, 32)));
  }
});

test("token-aware embedding chunking leaves short inputs unchanged and maps source indices", () => {
  const segments = splitTextsIntoTokenWindows(
    ["短文本", "second input"],
    countCodePointTokens,
    { targetTokens: 448, overlapTokens: 64 },
  );

  assert.deepEqual(segments, [
    { sourceTextIndex: 0, text: "短文本" },
    { sourceTextIndex: 1, text: "second input" },
  ]);
});
