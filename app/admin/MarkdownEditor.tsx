"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ClipboardEvent, FormEvent, KeyboardEvent } from "react";
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
import { allowedLink, writerFormats, type ApplyVisualFormat, type WriterFormat } from "./writerFormats";

const VisualEditor = dynamic(() => import("./VisualEditor"), {
  ssr: false,
  loading: () => <p className="writer-loading" role="status">Opening Visual editor…</p>
});

const textFormats: Record<Exclude<WriterFormat, "link">, (state: EditorState) => EditorState> = {
  bold: (state) => wrapSelection(state, "**", "**", "bold"),
  italic: (state) => wrapSelection(state, "*", "*", "italic"),
  heading: toggleHeading,
  bullets: toggleBulletList,
  numbers: toggleNumberedList,
  quote: toggleQuote,
  inlineCode: insertInlineCode,
  codeBlock: insertCodeBlock,
  footnote: insertFootnote
};

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
  const visualFormat = useRef<ApplyVisualFormat | null>(null);
  const [openLink, setOpenLink] = useState(false);
  const [linkValue, setLinkValue] = useState("");
  const [linkError, setLinkError] = useState(false);
  const [activeMarks, setActiveMarks] = useState(0);
  const linkInput = useRef<HTMLInputElement>(null);
  const linkButton = useRef<HTMLButtonElement>(null);
  const markdownLinkSelection = useRef<EditorState>();

  useEffect(() => {
    try {
      if (localStorage.getItem("studio-writing-mode") === "visual") setMode("visual");
    } catch {}
  }, []);

  useEffect(() => {
    if (openLink) linkInput.current?.focus();
  }, [openLink]);

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

  const requestLink = useCallback(() => {
    markdownLinkSelection.current = textareaRef.current ? readEditorState() : undefined;
    setLinkValue("");
    setLinkError(false);
    setOpenLink(true);
  }, [readEditorState]);

  function chooseMode(next: "write" | "visual") {
    setOpenLink(false);
    setMode(next);
    setActiveMarks(0);
    try { localStorage.setItem("studio-writing-mode", next); } catch {}
  }

  function format(action: WriterFormat) {
    if (action === "link") {
      requestLink();
      return;
    }
    if (mode === "write") runCommand(textFormats[action]);
    else if (action !== "footnote") visualFormat.current?.(action);
  }

  function addLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const url = linkValue.trim();
    if (!allowedLink(url)) {
      setLinkError(true);
      return;
    }
    setOpenLink(false);
    if (mode === "write") applyEditorState(insertLink(markdownLinkSelection.current ?? readEditorState(), url));
    else visualFormat.current?.("link", url);
  }

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
          requestLink();
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
    [applyEditorState, onSave, readEditorState, requestLink, runCommand]
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
    <div className="writer-composer">
      <div className="writer-tools">
        <fieldset className="writer-format" aria-label="Formatting" disabled={disabled}>
          {writerFormats.slice(0, 8).map((item) => (
            <button key={item.id} type="button" data-format={item.id}
              ref={item.id === "link" ? linkButton : undefined}
              aria-label={item.label} title={item.label}
              aria-keyshortcuts={"shortcut" in item ? item.shortcut : undefined}
              aria-pressed={mode === "visual" && (item.id === "bold" || item.id === "italic")
                ? Boolean(activeMarks & (item.id === "bold" ? 1 : 2)) : undefined}
              onMouseDown={(event) => event.preventDefault()} onClick={() => format(item.id)}>
              {item.id === "link" ? (
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                  <path d="M10.2 13.8 14 10m-6 6-1 1a3.53 3.53 0 0 1-5-5l4-4a3.53 3.53 0 0 1 5 0m5 0 1-1a3.53 3.53 0 0 1 5 5l-4 4a3.53 3.53 0 0 1-5 0" transform="rotate(-22 12 12)" />
                </svg>
              ) : <span aria-hidden="true">{item.symbol}</span>}
            </button>
          ))}
          <details className="writer-more">
            <summary title="More formatting" aria-label="More formatting">···</summary>
            <div>
              {writerFormats.slice(8).filter(({ id }) => mode === "write" || id !== "footnote").map(({ id, label }) => (
                <button key={id} type="button" onMouseDown={(event) => event.preventDefault()}
                  onClick={(event) => {
                    event.currentTarget.closest("details")?.removeAttribute("open");
                    format(id);
                  }}>{label}</button>
              ))}
            </div>
          </details>
        </fieldset>
        <div className="writer-mode" role="group" aria-label="Writing mode">
          <button type="button" aria-pressed={mode === "write"} onClick={() => chooseMode("write")}>Markdown</button>
          <button type="button" aria-pressed={mode === "visual"} onClick={() => chooseMode("visual")}>Visual</button>
        </div>
        {openLink ? (
          <form className="writer-link-box" onSubmit={addLink} onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            setOpenLink(false);
            linkButton.current?.focus();
          }}>
            <input ref={linkInput} aria-label="Link URL" placeholder="Paste or type a link" value={linkValue}
              onChange={(event) => { setLinkValue(event.target.value); setLinkError(false); }} />
            <button type="submit">Apply</button>
            <button type="button" onClick={() => { setOpenLink(false); linkButton.current?.focus(); }}>Cancel</button>
            {linkError ? <small role="alert">Enter a valid link.</small> : null}
          </form>
        ) : null}
      </div>
      {mode === "write" ? (
        <textarea ref={textareaRef} className="writer-source" aria-label="Article body in Markdown mode"
          disabled={disabled} placeholder="Write your article…" value={value}
          onChange={(event) => onChange(event.target.value)} onKeyDown={handleKeyDown} onPaste={handlePaste} spellCheck />
      ) : (
        <VisualEditor value={value} onChange={onChange} onSave={onSave} disabled={disabled}
          formatRef={visualFormat} onMarksChange={setActiveMarks} onLinkRequest={requestLink} />
      )}
      <div className="writer-length">{describeLength(value)}</div>
    </div>
  );
}
