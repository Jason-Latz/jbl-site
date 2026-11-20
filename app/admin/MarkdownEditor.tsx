"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { ClipboardEvent, KeyboardEvent } from "react";
import dynamic from "next/dynamic";
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

const VisualEditor = dynamic(() => import("./VisualEditor"), { ssr: false });

type MarkdownEditorProps = {
  value: string;
  onChange: (value: string) => void;
  onSave?: () => void;
  disabled?: boolean;
};

/**
 * The writing surface: a Markdown textarea with a formatting toolbar,
 * keyboard shortcuts, list continuation, smart paste, and a visual mode
 * that syncs edits back to the Markdown source.
 */
export default function MarkdownEditor({
  value,
  onChange,
  onSave,
  disabled
}: MarkdownEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const pendingSelectionRef = useRef<{ start: number; end: number } | null>(null);
  const [mode, setMode] = useState<"write" | "visual">("write");

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
      if (event.nativeEvent.isComposing) return;
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

      if (event.key === "Tab" && event.currentTarget.selectionStart !== event.currentTarget.selectionEnd) {
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
      <div className="editor-toolbar editor-mode-toggle" role="group" aria-label="Writing mode">
        <button
          type="button"
          className={mode === "write" ? "mode-active" : ""}
          aria-pressed={mode === "write"}
          onClick={() => setMode("write")}
        >
          Markdown
        </button>
        <button
          type="button"
          className={mode === "visual" ? "mode-active" : ""}
          aria-pressed={mode === "visual"}
          onClick={() => setMode("visual")}
        >
          Visual
        </button>
      </div>

      {mode === "write" ? (
        <>
          <fieldset className="editor-toolbar markdown-toolbar" disabled={disabled}>
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
          </fieldset>

          <textarea
            ref={textareaRef}
            className="markdown-editor"
            aria-label="Article body in Markdown mode"
            disabled={disabled}
            placeholder="Write your article in Markdown..."
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            spellCheck
          />
        </>
      ) : (
        <VisualEditor value={value} onChange={onChange} onSave={onSave} disabled={disabled} />
      )}

      <div className="editor-statusbar">
        <span className="post-meta editor-count">{describeLength(value)}</span>
        <span className="post-meta editor-hint">
          {mode === "write" ? "⌘B bold · ⌘I italic · ⌘K link · ⌘S save" : "⌘S save"}
        </span>
      </div>
    </div>
  );
}
