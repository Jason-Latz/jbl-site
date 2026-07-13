"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { ClipboardEvent, KeyboardEvent, ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  continueList,
  indentSelection,
  insertCodeBlock,
  insertFootnote,
  insertInlineCode,
  insertLink,
  linkifyPaste,
  toggleBulletList,
  toggleHeading,
  toggleNumberedList,
  toggleQuote,
  wrapSelection,
  type EditorState
} from "@/lib/editor/markdownCommands";
import { describeLength } from "@/lib/editor/text";

type MarkdownEditorProps = {
  value: string;
  onChange: (value: string) => void;
  onSave?: () => void;
  previewHeader?: ReactNode;
};

/**
 * The writing surface: a Markdown textarea with a formatting toolbar,
 * keyboard shortcuts, list continuation, smart paste, a live word count,
 * and a read-only Preview that renders through the same pipeline as the
 * published page. Purely presentational: it owns no persistence or auth,
 * so it is drivable in isolation.
 */
export default function MarkdownEditor({
  value,
  onChange,
  onSave,
  previewHeader
}: MarkdownEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const pendingSelectionRef = useRef<{ start: number; end: number } | null>(null);
  const [mode, setMode] = useState<"write" | "preview">("write");

  // Restore the caret/selection a command asked for, but only after React has
  // committed the new value to the DOM. Doing it here (rather than in a
  // requestAnimationFrame) avoids a race where the controlled textarea resets
  // the caret to the end after the selection was set.
  useLayoutEffect(() => {
    const pending = pendingSelectionRef.current;
    if (!pending) {
      return;
    }
    pendingSelectionRef.current = null;
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.focus();
      textarea.setSelectionRange(pending.start, pending.end);
    }
  });

  const readEditorState = useCallback((): EditorState => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return {
        value,
        selectionStart: value.length,
        selectionEnd: value.length
      };
    }
    return {
      value,
      selectionStart: textarea.selectionStart,
      selectionEnd: textarea.selectionEnd
    };
  }, [value]);

  const applyEditorState = useCallback(
    (next: EditorState) => {
      // A no-op command (e.g. outdent on an unindented line) leaves the value
      // unchanged, so onChange would not trigger a re-render and the layout
      // effect would never run. Apply the selection directly in that case,
      // and only defer to the effect when the value actually changes.
      if (next.value === value) {
        const textarea = textareaRef.current;
        if (textarea) {
          textarea.focus();
          textarea.setSelectionRange(next.selectionStart, next.selectionEnd);
        }
        return;
      }
      pendingSelectionRef.current = {
        start: next.selectionStart,
        end: next.selectionEnd
      };
      onChange(next.value);
    },
    [onChange, value]
  );

  const runCommand = useCallback(
    (command: (state: EditorState) => EditorState) => {
      applyEditorState(command(readEditorState()));
    },
    [applyEditorState, readEditorState]
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      const mod = event.metaKey || event.ctrlKey;

      if (mod && !event.altKey) {
        const key = event.key.toLowerCase();
        if (key === "b") {
          event.preventDefault();
          runCommand((state) => wrapSelection(state, "**", "**", "bold"));
          return;
        }
        if (key === "i") {
          event.preventDefault();
          runCommand((state) => wrapSelection(state, "*", "*", "italic"));
          return;
        }
        if (key === "k") {
          event.preventDefault();
          runCommand(insertLink);
          return;
        }
        if (key === "s") {
          if (onSave) {
            event.preventDefault();
            onSave();
          }
          return;
        }
      }

      if (event.key === "Tab") {
        event.preventDefault();
        runCommand((state) => indentSelection(state, event.shiftKey));
        return;
      }

      if (event.key === "Enter" && !event.shiftKey && !mod) {
        const result = continueList(readEditorState());
        if (result.handled) {
          event.preventDefault();
          applyEditorState(result.state);
        }
      }
    },
    [applyEditorState, onSave, readEditorState, runCommand]
  );

  const handlePaste = useCallback(
    (event: ClipboardEvent<HTMLTextAreaElement>) => {
      const pasted = event.clipboardData.getData("text");
      const result = linkifyPaste(readEditorState(), pasted);
      if (result.handled) {
        event.preventDefault();
        applyEditorState(result.state);
      }
    },
    [applyEditorState, readEditorState]
  );

  return (
    <div className="markdown-editor-shell">
      <div className="editor-toolbar editor-mode-toggle" role="tablist">
        <button
          type="button"
          className={mode === "write" ? "mode-active" : ""}
          onClick={() => setMode("write")}
        >
          Write
        </button>
        <button
          type="button"
          className={mode === "preview" ? "mode-active" : ""}
          onClick={() => setMode("preview")}
        >
          Preview
        </button>
      </div>

      {mode === "write" ? (
        <>
          <div className="editor-toolbar markdown-toolbar">
            <button
              className="secondary"
              type="button"
              title="Bold (⌘B)"
              onClick={() => runCommand((s) => wrapSelection(s, "**", "**", "bold"))}
            >
              Bold
            </button>
            <button
              className="secondary"
              type="button"
              title="Italic (⌘I)"
              onClick={() => runCommand((s) => wrapSelection(s, "*", "*", "italic"))}
            >
              Italic
            </button>
            <button
              className="secondary"
              type="button"
              title="Heading"
              onClick={() => runCommand(toggleHeading)}
            >
              H2
            </button>
            <button
              className="secondary"
              type="button"
              title="Quote"
              onClick={() => runCommand(toggleQuote)}
            >
              Quote
            </button>
            <button
              className="secondary"
              type="button"
              title="Link (⌘K)"
              onClick={() => runCommand(insertLink)}
            >
              Link
            </button>
            <button
              className="secondary"
              type="button"
              title="Inline code"
              onClick={() => runCommand(insertInlineCode)}
            >
              Inline code
            </button>
            <button
              className="secondary"
              type="button"
              title="Code block"
              onClick={() => runCommand(insertCodeBlock)}
            >
              Code block
            </button>
            <button
              className="secondary"
              type="button"
              title="Bulleted list"
              onClick={() => runCommand(toggleBulletList)}
            >
              Bulleted list
            </button>
            <button
              className="secondary"
              type="button"
              title="Numbered list"
              onClick={() => runCommand(toggleNumberedList)}
            >
              Numbered list
            </button>
            <button
              className="secondary"
              type="button"
              title="Footnote"
              onClick={() => runCommand(insertFootnote)}
            >
              Footnote
            </button>
          </div>

          <textarea
            ref={textareaRef}
            className="markdown-editor"
            placeholder="Write your article in Markdown..."
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            spellCheck
          />
        </>
      ) : (
        <div className="editor-preview-surface">
          <article className="content">
            {previewHeader}
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {value.trim() ? value : "_Nothing to preview yet._"}
            </ReactMarkdown>
          </article>
        </div>
      )}

      <div className="editor-statusbar">
        <span className="post-meta editor-count">{describeLength(value)}</span>
        <span className="post-meta editor-hint">
          Markdown supported · ⌘B bold · ⌘I italic · ⌘K link · ⌘S save
        </span>
      </div>
    </div>
  );
}
