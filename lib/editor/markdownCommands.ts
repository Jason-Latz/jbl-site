/**
 * Pure Markdown editing commands for the post editor.
 *
 * Every command takes an {@link EditorState} (the textarea value plus the
 * current selection) and returns the next state. Keeping them pure and
 * DOM-free makes the tricky bits (toggle wrapping, list continuation,
 * indentation) unit-testable without a browser; the React component just
 * applies the result and restores the selection.
 */

export type EditorState = {
  value: string;
  selectionStart: number;
  selectionEnd: number;
};

const INDENT = "  ";

/** A single-token http(s) URL, e.g. what you get from copying an address bar. */
export function isUrl(text: string): boolean {
  return /^https?:\/\/[^\s]+$/i.test(text.trim());
}

/**
 * Wrap the selection in `before`/`after`, or unwrap it if it is already
 * wrapped (so the same shortcut toggles bold, italic, code, etc. off).
 */
export function wrapSelection(
  state: EditorState,
  before: string,
  after: string = before,
  placeholder = "text"
): EditorState {
  const { value, selectionStart: start, selectionEnd: end } = state;
  const selected = value.slice(start, end);

  // Selection already contains the markers -> unwrap.
  if (
    selected.length >= before.length + after.length &&
    selected.startsWith(before) &&
    selected.endsWith(after)
  ) {
    const inner = selected.slice(before.length, selected.length - after.length);
    return {
      value: value.slice(0, start) + inner + value.slice(end),
      selectionStart: start,
      selectionEnd: start + inner.length
    };
  }

  // Markers sit just outside the selection -> unwrap them too. Guard against a
  // shorter marker matching the inner half of a longer run (e.g. italic "*"
  // matching one "*" of a "**" bold pair), which would strip the longer marker
  // when chaining, say, bold then italic on the same word.
  const beforeStart = start - before.length;
  const afterEnd = end + after.length;
  if (
    beforeStart >= 0 &&
    value.slice(beforeStart, start) === before &&
    value.slice(end, afterEnd) === after
  ) {
    const runsBefore =
      beforeStart - before.length >= 0 &&
      value.slice(beforeStart - before.length, beforeStart) === before;
    const runsAfter = value.slice(afterEnd, afterEnd + after.length) === after;
    if (!runsBefore && !runsAfter) {
      return {
        value: value.slice(0, beforeStart) + selected + value.slice(afterEnd),
        selectionStart: beforeStart,
        selectionEnd: end - before.length
      };
    }
  }

  // Otherwise wrap.
  const inner = selected || placeholder;
  const nextStart = start + before.length;
  return {
    value: value.slice(0, start) + before + inner + after + value.slice(end),
    selectionStart: nextStart,
    selectionEnd: nextStart + inner.length
  };
}

export function insertInlineCode(state: EditorState): EditorState {
  return wrapSelection(state, "`", "`", "code");
}

export function insertCodeBlock(state: EditorState): EditorState {
  return wrapSelection(state, "\n```\n", "\n```\n", "code block");
}

/**
 * Insert a Markdown link. If a URL is selected it becomes the target; any
 * other selection becomes the link text with a placeholder target.
 */
export function insertLink(state: EditorState): EditorState {
  const { value, selectionStart: start, selectionEnd: end } = state;
  const selected = value.slice(start, end);

  if (selected && isUrl(selected)) {
    const insert = `[link](${selected.trim()})`;
    const textStart = start + 1;
    return {
      value: value.slice(0, start) + insert + value.slice(end),
      selectionStart: textStart,
      selectionEnd: textStart + "link".length
    };
  }

  const text = selected || "link";
  const insert = `[${text}](https://example.com)`;
  // Select the URL placeholder so it is easy to overwrite.
  const urlStart = start + `[${text}](`.length;
  return {
    value: value.slice(0, start) + insert + value.slice(end),
    selectionStart: urlStart,
    selectionEnd: urlStart + "https://example.com".length
  };
}

type LineTransform = {
  /** Matches (and, when toggling off, is stripped from) an already-formatted line. */
  detect: RegExp;
  /** Builds the prefixed line from a raw line and its 0-based content index. */
  add: (line: string, index: number) => string;
  placeholder: string;
};

function transformLines(state: EditorState, spec: LineTransform): EditorState {
  const { value, selectionStart, selectionEnd } = state;
  const blockStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
  const newlineAfter = value.indexOf("\n", selectionEnd);
  const blockEnd = newlineAfter === -1 ? value.length : newlineAfter;

  const block = value.slice(blockStart, blockEnd);
  const lines = block === "" ? [""] : block.split("\n");
  const contentLines = lines.filter((line) => line.trim().length > 0);
  const allFormatted =
    contentLines.length > 0 && contentLines.every((line) => spec.detect.test(line));

  let contentIndex = 0;
  const nextLines = lines.map((line) => {
    const isBlank = line.trim().length === 0;
    if (isBlank && lines.length > 1) {
      return line;
    }
    if (allFormatted) {
      return line.replace(spec.detect, "");
    }
    const base = isBlank ? spec.placeholder : line;
    return spec.add(base, contentIndex++);
  });

  const nextBlock = nextLines.join("\n");
  return {
    value: value.slice(0, blockStart) + nextBlock + value.slice(blockEnd),
    selectionStart: blockStart,
    selectionEnd: blockStart + nextBlock.length
  };
}

export function toggleHeading(state: EditorState): EditorState {
  return transformLines(state, {
    detect: /^#{1,6}\s+/,
    add: (line) => `## ${line}`,
    placeholder: "Heading"
  });
}

export function toggleQuote(state: EditorState): EditorState {
  return transformLines(state, {
    detect: /^>\s+/,
    add: (line) => `> ${line}`,
    placeholder: "Quote"
  });
}

export function toggleBulletList(state: EditorState): EditorState {
  return transformLines(state, {
    detect: /^[-*+]\s+/,
    add: (line) => `- ${line}`,
    placeholder: "List item"
  });
}

export function toggleNumberedList(state: EditorState): EditorState {
  return transformLines(state, {
    detect: /^\d+\.\s+/,
    add: (line, index) => `${index + 1}. ${line}`,
    placeholder: "List item"
  });
}

export function getNextFootnoteIndex(markdown: string): number {
  const matches = [...markdown.matchAll(/\[\^(\d+)\]/g)];
  const max = matches.reduce((largest, match) => {
    const parsed = Number(match[1]);
    return Number.isNaN(parsed) ? largest : Math.max(largest, parsed);
  }, 0);
  return max + 1;
}

/** Insert a footnote reference at the cursor and append its definition. */
export function insertFootnote(state: EditorState): EditorState {
  const { value, selectionStart: start, selectionEnd: end } = state;
  const index = getNextFootnoteIndex(value);
  const reference = `[^${index}]`;
  const definitionBody = "Footnote text.";
  const definition = `\n\n[^${index}]: ${definitionBody}`;

  const selected = value.slice(start, end);
  const withReference = selected ? `${selected}${reference}` : `note${reference}`;
  const nextValue =
    value.slice(0, start) + withReference + value.slice(end) + definition;

  // Select the definition body so it is ready to type over.
  const definitionStart = nextValue.lastIndexOf(definitionBody);
  return {
    value: nextValue,
    selectionStart: definitionStart,
    selectionEnd: definitionStart + definitionBody.length
  };
}

export type ListContinuation =
  | { handled: false }
  | { handled: true; state: EditorState };

/**
 * Handle Enter inside a list. Continues the list with the next marker
 * (auto-incrementing ordered lists), or clears the marker when Enter is
 * pressed on an empty item so the list ends cleanly.
 */
export function continueList(state: EditorState): ListContinuation {
  const { value, selectionStart, selectionEnd } = state;
  if (selectionStart !== selectionEnd) {
    return { handled: false };
  }

  const caret = selectionStart;
  const lineStart = value.lastIndexOf("\n", caret - 1) + 1;
  const newlineAfter = value.indexOf("\n", caret);
  const lineEnd = newlineAfter === -1 ? value.length : newlineAfter;
  const line = value.slice(lineStart, lineEnd);

  const match = line.match(/^(\s*)([-*+]|(\d+)\.)(\s+)(.*)$/);
  if (!match) {
    return { handled: false };
  }

  const [, indent, marker, orderedNum, spacing, content] = match;

  // Only continue the list when the caret is past the marker, not inside the
  // indent/marker prefix (e.g. Enter pressed at column 0 should split normally,
  // not duplicate the marker).
  const prefixLength = indent.length + marker.length + spacing.length;
  if (caret < lineStart + prefixLength) {
    return { handled: false };
  }

  if (content.trim() === "") {
    // Empty item: pressing Enter exits the list by clearing the marker.
    const nextValue = value.slice(0, lineStart) + indent + value.slice(lineEnd);
    const nextCaret = lineStart + indent.length;
    return {
      handled: true,
      state: { value: nextValue, selectionStart: nextCaret, selectionEnd: nextCaret }
    };
  }

  const nextMarker =
    orderedNum !== undefined ? `${Number(orderedNum) + 1}.` : marker;
  const insert = `\n${indent}${nextMarker}${spacing}`;
  const nextCaret = caret + insert.length;
  return {
    handled: true,
    state: {
      value: value.slice(0, caret) + insert + value.slice(caret),
      selectionStart: nextCaret,
      selectionEnd: nextCaret
    }
  };
}

/** Tab / Shift+Tab. Indents or outdents the selected lines by two spaces. */
export function indentSelection(state: EditorState, outdent = false): EditorState {
  const { value, selectionStart, selectionEnd } = state;

  if (selectionStart === selectionEnd && !outdent) {
    const nextCaret = selectionStart + INDENT.length;
    return {
      value: value.slice(0, selectionStart) + INDENT + value.slice(selectionEnd),
      selectionStart: nextCaret,
      selectionEnd: nextCaret
    };
  }

  const blockStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
  const newlineAfter = value.indexOf("\n", selectionEnd);
  const blockEnd = newlineAfter === -1 ? value.length : newlineAfter;
  const lines = value.slice(blockStart, blockEnd).split("\n");

  let firstLineDelta = 0;
  let totalDelta = 0;
  const nextLines = lines.map((line, index) => {
    if (outdent) {
      const removed = line.match(/^( {1,2}|\t)/);
      if (!removed) {
        return line;
      }
      const cut = removed[0].length;
      if (index === 0) {
        firstLineDelta = -cut;
      }
      totalDelta -= cut;
      return line.slice(cut);
    }
    if (index === 0) {
      firstLineDelta = INDENT.length;
    }
    totalDelta += INDENT.length;
    return INDENT + line;
  });

  const nextBlock = nextLines.join("\n");
  const nextSelectionStart =
    selectionStart === blockStart
      ? blockStart
      : Math.max(blockStart, selectionStart + firstLineDelta);
  return {
    value: value.slice(0, blockStart) + nextBlock + value.slice(blockEnd),
    selectionStart: nextSelectionStart,
    selectionEnd: Math.max(nextSelectionStart, selectionEnd + totalDelta)
  };
}

export type PasteResult =
  | { handled: false }
  | { handled: true; state: EditorState };

/**
 * Turn "paste a URL over selected text" into a Markdown link. Any other
 * paste is left to the browser's default handling.
 */
export function linkifyPaste(state: EditorState, pasted: string): PasteResult {
  const { value, selectionStart: start, selectionEnd: end } = state;
  const selected = value.slice(start, end);
  const url = pasted.trim();

  if (selected.length === 0 || !isUrl(url)) {
    return { handled: false };
  }

  const insert = `[${selected}](${url})`;
  const nextCaret = start + insert.length;
  return {
    handled: true,
    state: {
      value: value.slice(0, start) + insert + value.slice(end),
      selectionStart: nextCaret,
      selectionEnd: nextCaret
    }
  };
}
