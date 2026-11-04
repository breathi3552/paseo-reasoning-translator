import assert from "node:assert/strict";
import test from "node:test";
import { splitReasoning } from "./chunks";

test("chunks retain every character, paragraph and UTF-16 surrogate pair", () => {
  const text = "abc😀def\n\nparagraph two\n\n尾段";
  const chunks = splitReasoning(text, 5);
  assert.equal(chunks.join(""), text);
  assert.ok(chunks.every((chunk) => chunk.length <= 5));
  assert.ok(chunks.every((chunk) => !/[\uD800-\uDBFF]$/.test(chunk) && !/^[\uDC00-\uDFFF]/.test(chunk)));
});
