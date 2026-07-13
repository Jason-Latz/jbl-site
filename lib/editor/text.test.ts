import assert from "node:assert/strict";
import { test } from "node:test";
import { countWords, describeLength, readingTimeMinutes } from "./text.ts";

test("countWords ignores surrounding whitespace", () => {
  assert.equal(countWords("  hello   world \n"), 2);
  assert.equal(countWords(""), 0);
  assert.equal(countWords("   "), 0);
});

test("readingTimeMinutes rounds to at least one minute for any content", () => {
  assert.equal(readingTimeMinutes(0), 0);
  assert.equal(readingTimeMinutes(10), 1);
  assert.equal(readingTimeMinutes(225), 1);
  assert.equal(readingTimeMinutes(700), 3);
});

test("describeLength reads naturally", () => {
  assert.equal(describeLength(""), "0 words");
  assert.equal(describeLength("solo"), "1 word · 1 min read");
  assert.equal(describeLength("one two three"), "3 words · 1 min read");
});
