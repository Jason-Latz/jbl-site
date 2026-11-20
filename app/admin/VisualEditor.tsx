"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

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

export default function VisualEditor({ value, onChange, onSave, disabled }: {
  value: string;
  onChange: (value: string) => void;
  onSave?: () => void;
  disabled?: boolean;
}) {
  // Keep React's rendered children stable while the browser owns the editable
  // nodes. The latest Markdown is used on each return to Visual mode.
  const [body] = useState(() => <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>);

  return (
    <div className="editor-preview-surface">
      <div
        className="content studio-visual"
        role="textbox"
        aria-multiline="true"
        aria-label="Article body in Visual mode"
        contentEditable={!disabled}
        suppressContentEditableWarning
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
          if (onSave && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
            event.preventDefault();
            onSave();
          }
        }}
      >
        {body}
      </div>
    </div>
  );
}
