import assert from "node:assert/strict";
import { test } from "node:test";
import {
  continueList,
  indentSelection,
  insertFootnote,
  insertLink,
  linkifyPaste,
  toggleBulletList,
  toggleHeading,
  toggleNumberedList,
  toggleQuote,
  wrapSelection,
  type EditorState
} from "./markdownCommands.ts";

/** Build a state from a string with `|` marking the caret or `[...]` the selection. */
function parse(marked: string): EditorState {
  if (marked.includes("[") && marked.includes("]")) {
    const start = marked.indexOf("[");
    const end = marked.indexOf("]") - 1;
    const value = marked.replace("[", "").replace("]", "");
    return { value, selectionStart: start, selectionEnd: end };
  }
  const caret = marked.indexOf("|");
  const value = marked.replace("|", "");
  return { value, selectionStart: caret, selectionEnd: caret };
}

/** Render a state back to the `[...]` / `|` notation for readable assertions. */
function show(state: EditorState): string {
  const { value, selectionStart: s, selectionEnd: e } = state;
  if (s === e) {
    return value.slice(0, s) + "|" + value.slice(s);
  }
  return value.slice(0, s) + "[" + value.slice(s, e) + "]" + value.slice(e);
}

test("wrapSelection wraps a selection", () => {
  assert.equal(show(wrapSelection(parse("hello [world]"), "**")), "hello **[world]**");
});

test("wrapSelection toggles off when the selection includes the markers", () => {
  assert.equal(show(wrapSelection(parse("hello [**world**]"), "**")), "hello [world]");
});

test("wrapSelection toggles off when markers sit just outside", () => {
  assert.equal(show(wrapSelection(parse("hello **[world]**"), "**")), "hello [world]");
});

test("wrapSelection uses the placeholder for an empty caret", () => {
  assert.equal(show(wrapSelection(parse("|"), "*", "*", "italic")), "*[italic]*");
});

test("wrapSelection nests a marker instead of stripping a longer one", () => {
  // Bold then italic on the same word must not delete the bold.
  const bold = wrapSelection(parse("hello [world]"), "**");
  assert.equal(bold.value, "hello **world**");
  const italic = wrapSelection(bold, "*", "*", "italic");
  assert.equal(italic.value, "hello ***world***");
});

test("insertLink wraps selected text with a placeholder URL", () => {
  assert.equal(
    show(insertLink(parse("[click]"))),
    "[click]([https://example.com])"
  );
});

test("insertLink uses a selected URL as the target", () => {
  assert.equal(
    show(insertLink(parse("[https://a.com]"))),
    "[[link]](https://a.com)"
  );
});

test("insertLink trims whitespace around a selected URL", () => {
  assert.equal(insertLink(parse("[ https://a.com ]")).value, "[link](https://a.com)");
});

test("toggleBulletList prefixes lines and toggles them off", () => {
  const on = toggleBulletList(parse("[a\nb]"));
  assert.equal(on.value, "- a\n- b");
  assert.equal(toggleBulletList({ ...on, selectionStart: 0, selectionEnd: on.value.length }).value, "a\nb");
});

test("toggleNumberedList numbers sequentially", () => {
  assert.equal(toggleNumberedList(parse("[a\nb\nc]")).value, "1. a\n2. b\n3. c");
});

test("toggleHeading toggles any heading level off", () => {
  assert.equal(toggleHeading(parse("[hello]")).value, "## hello");
  assert.equal(toggleHeading(parse("[# hello]")).value, "hello");
});

test("toggleQuote prefixes a blockquote", () => {
  assert.equal(toggleQuote(parse("[quote me]")).value, "> quote me");
});

test("continueList continues a bullet", () => {
  const result = continueList(parse("- item|"));
  assert.ok(result.handled);
  assert.equal(show(result.state), "- item\n- |");
});

test("continueList auto-increments an ordered list", () => {
  const result = continueList(parse("1. item|"));
  assert.ok(result.handled);
  assert.equal(show(result.state), "1. item\n2. |");
});

test("continueList exits the list on an empty item", () => {
  const result = continueList(parse("- |"));
  assert.ok(result.handled);
  assert.equal(show(result.state), "|");
});

test("continueList preserves indentation", () => {
  const result = continueList(parse("  - item|"));
  assert.ok(result.handled);
  assert.equal(show(result.state), "  - item\n  - |");
});

test("continueList ignores non-list lines", () => {
  assert.equal(continueList(parse("just a line|")).handled, false);
});

test("continueList does not continue when the caret is inside the marker prefix", () => {
  assert.equal(continueList(parse("|  - item")).handled, false);
});

test("indentSelection inserts two spaces at the caret", () => {
  assert.equal(show(indentSelection(parse("he|llo"))), "he  |llo");
});

test("indentSelection indents whole selected lines", () => {
  assert.equal(indentSelection(parse("[a\nb]")).value, "  a\n  b");
});

test("indentSelection outdents", () => {
  assert.equal(indentSelection(parse("[  a\n  b]"), true).value, "a\nb");
});

test("indentSelection outdent is a no-op with no leading space", () => {
  assert.equal(indentSelection(parse("[a\nb]"), true).value, "a\nb");
});

test("linkifyPaste turns a pasted URL over a selection into a link", () => {
  const result = linkifyPaste(parse("see [here]"), "https://a.com");
  assert.ok(result.handled);
  assert.equal(result.state.value, "see [here](https://a.com)");
});

test("linkifyPaste ignores non-URL pastes", () => {
  assert.equal(linkifyPaste(parse("see [here]"), "not a url").handled, false);
});

test("linkifyPaste ignores pastes with no selection", () => {
  assert.equal(linkifyPaste(parse("see here|"), "https://a.com").handled, false);
});

test("insertFootnote adds a reference and definition, numbering upward", () => {
  const result = insertFootnote(parse("A claim|"));
  assert.equal(result.value, "A claimnote[^1]\n\n[^1]: Footnote text.");
  const second = insertFootnote({ ...result, selectionStart: 6, selectionEnd: 6 });
  assert.ok(second.value.includes("[^2]"));
});
