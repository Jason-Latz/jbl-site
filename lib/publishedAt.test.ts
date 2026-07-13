import assert from "node:assert/strict";
import { test } from "node:test";
import { resolvePublishedAt } from "./publishedAt.ts";

const NOW = "2026-07-13T05:00:00.000Z";
const FIRST = "2026-03-06T17:44:06.098Z";

test("first publish stamps the current time", () => {
  assert.equal(resolvePublishedAt(true, null, NOW), NOW);
});

test("a post kept as a draft has no publish date", () => {
  assert.equal(resolvePublishedAt(false, null, NOW), null);
});

test("editing or autosaving a published post keeps the original date", () => {
  assert.equal(resolvePublishedAt(true, FIRST, NOW), FIRST);
});

test("unpublishing preserves the first-publish date", () => {
  assert.equal(resolvePublishedAt(false, FIRST, NOW), FIRST);
});

test("re-publishing keeps the first-publish date, not the re-publish time", () => {
  assert.equal(resolvePublishedAt(true, FIRST, NOW), FIRST);
});
