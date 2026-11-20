"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MutableRefObject } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import type { ApplyVisualFormat } from "./writerFormats";

const markdown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced", bulletListMarker: "-" });
markdown.use(gfm);

function footnoteName(id: string) {
  return decodeURIComponent(id.replace(/^#?user-content-fn-/, ""));
}

markdown.addRule("footnoteReference", {
  filter: (node) => node.nodeName === "SUP" && Boolean(node.querySelector("[data-footnote-ref]")),
  replacement: (_content, node) => {
    const href = (node as Element).querySelector("[data-footnote-ref]")?.getAttribute("href");
    return href ? `[^${footnoteName(href)}]` : "";
  }
});
markdown.addRule("footnoteBackref", {
  filter: (node) => node.nodeType === 1 && node.hasAttribute("data-footnote-backref"),
  replacement: () => ""
});
markdown.addRule("footnoteDefinitions", {
  filter: (node) => node.nodeType === 1 && node.hasAttribute("data-footnotes"),
  replacement: (_content, node) => {
    const notes = Array.from((node as Element).querySelectorAll<HTMLLIElement>(":scope > ol > li[id]"));
    const definitions = notes.map((note) => {
      const text = markdown.turndown(note);
      return `[^${footnoteName(note.id)}]: ${text.replace(/\n/g, "\n    ")}`;
    });
    return `\n\n${definitions.join("\n\n")}\n\n`;
  }
});

const commands = { bold: "bold", italic: "italic", bullets: "insertUnorderedList", numbers: "insertOrderedList" } as const;
const blocks = { heading: "h2", quote: "blockquote", codeBlock: "pre" } as const;

export default function VisualEditor({ value, onChange, onSave, disabled, formatRef, onMarksChange, onLinkRequest }: {
  value: string;
  onChange: (value: string) => void;
  onSave?: () => void;
  disabled?: boolean;
  formatRef: MutableRefObject<ApplyVisualFormat | null>;
  onMarksChange: (marks: number) => void;
  onLinkRequest: () => void;
}) {
  // Keep React's rendered children stable while the browser owns the editable
  // nodes. The latest Markdown is used on each return to Visual mode.
  const [body] = useState(() => <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>);
  const surface = useRef<HTMLDivElement>(null);
  const lastSelection = useRef<Range | null>(null);

  const rememberSelection = useCallback(() => {
    const selection = window.getSelection();
    const editor = surface.current;
    if (!editor || !selection?.rangeCount) return;
    const current = selection.getRangeAt(0);
    if (!editor.contains(current.commonAncestorContainer)) return;
    lastSelection.current = current.cloneRange();
    onMarksChange(Number(document.queryCommandState("bold")) | (Number(document.queryCommandState("italic")) << 1));
  }, [onMarksChange]);

  useEffect(() => {
    document.addEventListener("selectionchange", rememberSelection);
    return () => document.removeEventListener("selectionchange", rememberSelection);
  }, [rememberSelection]);

  const applyFormat: ApplyVisualFormat = useCallback((format, href) => {
    const editor = surface.current;
    const selection = window.getSelection();
    if (disabled || !editor || !selection) return;
    editor.focus({ preventScroll: true });
    const range = lastSelection.current;
    if (range && editor.contains(range.commonAncestorContainer)) {
      selection.removeAllRanges();
      selection.addRange(range);
    } else if (!editor.contains(selection.anchorNode)) {
      selection.selectAllChildren(editor);
      selection.collapseToEnd();
    }
    const anchor = selection.anchorNode;
    const element = anchor?.nodeType === Node.ELEMENT_NODE ? anchor as Element : anchor?.parentElement;
    const before = editor.innerHTML;
    document.execCommand("styleWithCSS", false, "false");
    if (format === "bold" || format === "italic" || format === "bullets" || format === "numbers") {
      document.execCommand(commands[format]);
    } else if (format === "heading" || format === "quote" || format === "codeBlock") {
      const tag = blocks[format];
      document.execCommand("formatBlock", false, element?.closest(tag) ? "p" : tag);
    } else if (format === "link" && href) {
      if (selection.isCollapsed) {
        const link = document.createElement("a");
        link.href = href;
        link.textContent = href;
        document.execCommand("insertHTML", false, link.outerHTML);
      } else {
        document.execCommand("createLink", false, href);
      }
    } else if (format === "inlineCode") {
      const previous = element?.closest("code");
      if (previous && !previous.closest("pre")) {
        selection.selectAllChildren(previous);
        const range = document.createRange();
        range.selectNode(previous);
        selection.removeAllRanges();
        selection.addRange(range);
      }
      const code = document.createElement(previous && !previous.closest("pre") ? "span" : "code");
      code.textContent = selection.toString() || "code";
      document.execCommand("insertHTML", false, code.outerHTML);
    }
    // Browser commands can update the DOM without emitting an input event.
    if (editor.innerHTML !== before) onChange(markdown.turndown(editor));
    rememberSelection();
  }, [disabled, onChange, rememberSelection]);

  useLayoutEffect(() => {
    formatRef.current = applyFormat;
    return () => { formatRef.current = null; };
  }, [applyFormat, formatRef]);

  return (
      <div
        ref={surface}
        className="content studio-visual"
        role="textbox"
        aria-multiline="true"
        aria-label="Article body in Visual mode"
        contentEditable={!disabled}
        data-placeholder="Write your article…"
        suppressContentEditableWarning
        onFocus={() => document.execCommand("defaultParagraphSeparator", false, "p")}
        onInput={(event) => onChange(markdown.turndown(event.currentTarget))}
        onClick={(event) => {
          if (event.target instanceof Element && event.target.closest("a")) event.preventDefault();
        }}
        onPaste={(event) => {
          event.preventDefault();
          document.execCommand("insertText", false, event.clipboardData.getData("text/plain"));
        }}
        onDrop={(event) => event.preventDefault()}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing || !(event.metaKey || event.ctrlKey) || event.altKey) return;
          const key = event.key.toLowerCase();
          if (key === "b" || key === "i") {
            event.preventDefault();
            rememberSelection();
            applyFormat(key === "b" ? "bold" : "italic");
          } else if (key === "k") {
            event.preventDefault();
            rememberSelection();
            onLinkRequest();
          } else if (key === "s" && onSave) {
            event.preventDefault();
            onSave();
          }
        }}
      >
        {body}
      </div>
  );
}
