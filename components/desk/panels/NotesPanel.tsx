"use client";

import { useEffect, useState, type FormEvent } from "react";

type DeskNote = {
  id: string;
  body: string;
  author: string | null;
  createdAt: string;
};

const MAX_BODY_LENGTH = 280;
const MAX_AUTHOR_LENGTH = 40;
const FALLBACK_POST_ERROR = "The note didn't stick — try again.";

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();

  if (Number.isNaN(then)) {
    return "";
  }

  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));

  if (seconds < 60) {
    return "just now";
  }

  const minutes = Math.floor(seconds / 60);

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);

  if (days < 7) {
    return `${days}d ago`;
  }

  return new Date(then).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

// The notepad guestbook: anyone at the desk can pin a note for everyone else.
export default function NotesPanel() {
  const [notes, setNotes] = useState<DeskNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [body, setBody] = useState("");
  const [author, setAuthor] = useState("");
  const [posting, setPosting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/desk-notes")
      .then(async (response) => {
        const data = (await response.json().catch(() => null)) as {
          notes?: DeskNote[];
          error?: string;
        } | null;

        if (cancelled) {
          return;
        }

        if (!response.ok || !data || !Array.isArray(data.notes)) {
          setLoadError(data?.error ?? "Couldn't reach the notepad.");
          return;
        }

        setNotes(data.notes);
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError("Couldn't reach the notepad.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const trimmedBody = body.replace(/\s+/g, " ").trim();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (posting || trimmedBody.length === 0) {
      return;
    }

    const trimmedAuthor = author.replace(/\s+/g, " ").trim();
    const optimistic: DeskNote = {
      id: `optimistic-${Date.now()}`,
      body: trimmedBody,
      author: trimmedAuthor || null,
      createdAt: new Date().toISOString()
    };

    const previousBody = body;
    const previousAuthor = author;

    setPosting(true);
    setFormError(null);
    setNotes((prev) => [optimistic, ...prev]);
    setBody("");
    setAuthor("");

    let failureMessage: string | null = null;

    try {
      const response = await fetch("/api/desk-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: trimmedBody,
          ...(trimmedAuthor ? { author: trimmedAuthor } : {})
        })
      });

      const data = (await response.json().catch(() => null)) as {
        note?: DeskNote;
        error?: string;
      } | null;

      if (!response.ok || !data?.note) {
        failureMessage = data?.error ?? FALLBACK_POST_ERROR;
      } else {
        const saved = data.note;
        setNotes((prev) =>
          prev.map((note) => (note.id === optimistic.id ? saved : note))
        );
      }
    } catch {
      failureMessage = FALLBACK_POST_ERROR;
    }

    if (failureMessage) {
      // Roll back the optimistic note and hand the words back to the form.
      setNotes((prev) => prev.filter((note) => note.id !== optimistic.id));
      setBody(previousBody);
      setAuthor(previousAuthor);
      setFormError(failureMessage);
    }

    setPosting(false);
  }

  return (
    <>
      <section className="desk-panel-section">
        <p className="desk-panel-empty">
          Notes left on this desk by visitors.
        </p>
      </section>

      <section className="desk-panel-section">
        <h3 className="desk-panel-section-title">Leave a note</h3>
        <form className="desk-panel-form" onSubmit={handleSubmit}>
          <textarea
            className="desk-panel-textarea"
            value={body}
            onChange={(event) => {
              setBody(event.target.value);
              if (formError) {
                setFormError(null);
              }
            }}
            maxLength={MAX_BODY_LENGTH}
            placeholder="Something kind, something odd, something true…"
            aria-label="Your note"
          />
          <p className="desk-panel-meta" aria-live="polite">
            {body.length} / {MAX_BODY_LENGTH}
          </p>
          <input
            className="desk-panel-input"
            type="text"
            value={author}
            onChange={(event) => setAuthor(event.target.value)}
            maxLength={MAX_AUTHOR_LENGTH}
            placeholder="name (optional)"
            aria-label="Name (optional)"
          />
          <button
            type="submit"
            className="desk-panel-button"
            disabled={posting || trimmedBody.length === 0}
          >
            {posting ? "Pinning…" : "Pin it to the pad"}
          </button>
          {formError ? (
            <p className="desk-panel-empty" role="alert">
              {formError}
            </p>
          ) : null}
        </form>
      </section>

      <section className="desk-panel-section">
        <h3 className="desk-panel-section-title">On the pad</h3>
        {loading ? (
          <p className="desk-panel-empty">Reading the pad…</p>
        ) : loadError ? (
          <p className="desk-panel-empty">{loadError}</p>
        ) : notes.length === 0 ? (
          <p className="desk-panel-empty">
            No notes yet — the first one is yours.
          </p>
        ) : (
          <ul className="desk-panel-list">
            {notes.map((note) => (
              <li key={note.id}>
                <article className="desk-panel-note">
                  <p className="desk-panel-note-body">{note.body}</p>
                  <p className="desk-panel-meta">
                    — {note.author ?? "anonymous"} · {relativeTime(note.createdAt)}
                  </p>
                </article>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
