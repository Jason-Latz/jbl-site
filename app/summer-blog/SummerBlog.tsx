"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  AUTHORS,
  currentWeekStart,
  formatDeadline,
  formatWeekRange,
  listWeeks,
  prettyUrl,
  type SummerAuthorKey,
  type SummerEntry
} from "@/lib/summerBlog";

const PASSCODE_KEY = "summer-blog-key";

type EntryMap = Record<string, SummerEntry>;

type ApiData = { entry?: SummerEntry; error?: string; ok?: boolean };

function slotKey(weekStart: string, author: SummerAuthorKey): string {
  return `${weekStart}:${author}`;
}

async function postAction(
  payload: Record<string, unknown>
): Promise<{ ok: boolean; data: ApiData }> {
  const res = await fetch("/api/summer-blog", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = (await res.json().catch(() => ({}))) as ApiData;
  return { ok: res.ok, data };
}

export default function SummerBlog() {
  const [entries, setEntries] = useState<EntryMap | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [weeks, setWeeks] = useState<string[]>([]);
  const [currentWeek, setCurrentWeek] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [passcode, setPasscode] = useState("");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  // Compute weeks after mount so the server and first client render agree
  // (both start empty) and never mismatch across a midnight boundary.
  useEffect(() => {
    setWeeks(listWeeks());
    setCurrentWeek(currentWeekStart());
  }, []);

  const loadEntries = useCallback(async () => {
    try {
      const res = await fetch("/api/summer-blog", { cache: "no-store" });
      if (!res.ok) {
        throw new Error("load failed");
      }
      const data = (await res.json()) as { entries: SummerEntry[] };
      const map: EntryMap = {};
      for (const entry of data.entries) {
        map[slotKey(entry.weekStart, entry.author)] = entry;
      }
      setEntries(map);
      setLoadError(false);
    } catch {
      setEntries({});
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  // If a passcode was remembered, re-verify it so a rotated code doesn't leave
  // the writer "unlocked" but failing on every save.
  useEffect(() => {
    const stored = window.localStorage.getItem(PASSCODE_KEY);
    if (!stored) {
      return;
    }
    void (async () => {
      const { ok } = await postAction({ action: "unlock", passcode: stored });
      if (ok) {
        setPasscode(stored);
        setUnlocked(true);
      } else {
        window.localStorage.removeItem(PASSCODE_KEY);
      }
    })();
  }, []);

  const handleUnlock = async (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    const code = passcode.trim();
    if (!code) {
      return;
    }
    const { ok } = await postAction({ action: "unlock", passcode: code });
    if (ok) {
      window.localStorage.setItem(PASSCODE_KEY, code);
      setPasscode(code);
      setUnlocked(true);
    } else {
      setMessage("That passcode isn't right.");
    }
  };

  const handleLock = () => {
    window.localStorage.removeItem(PASSCODE_KEY);
    setUnlocked(false);
    setPasscode("");
    setEditingKey(null);
    setMessage("");
  };

  const handleSave = async (
    weekStart: string,
    author: SummerAuthorKey,
    url: string,
    title: string
  ) => {
    const key = slotKey(weekStart, author);
    setBusyKey(key);
    setMessage("");
    const { ok, data } = await postAction({
      action: "save",
      passcode,
      weekStart,
      author,
      url,
      title
    });
    setBusyKey(null);
    if (ok && data.entry) {
      const saved = data.entry;
      setEntries((prev) => ({ ...(prev ?? {}), [key]: saved }));
      setEditingKey(null);
    } else {
      setMessage(data.error ?? "The link didn't save.");
    }
  };

  const handleClear = async (weekStart: string, author: SummerAuthorKey) => {
    const key = slotKey(weekStart, author);
    setBusyKey(key);
    setMessage("");
    const { ok, data } = await postAction({
      action: "clear",
      passcode,
      weekStart,
      author
    });
    setBusyKey(null);
    if (ok) {
      setEntries((prev) => {
        const next = { ...(prev ?? {}) };
        delete next[key];
        return next;
      });
      setEditingKey(null);
    } else {
      setMessage(data.error ?? "Couldn't clear the slot.");
    }
  };

  if (entries === null || weeks.length === 0) {
    return <p className="post-meta">Loading the weeks…</p>;
  }

  return (
    <div className="summer-blog-board">
      <div className="summer-blog-unlock">
        {unlocked ? (
          <>
            <span className="summer-blog-unlock-status">Editing unlocked</span>
            <button
              type="button"
              className="summer-blog-btn-quiet"
              onClick={handleLock}
            >
              Lock
            </button>
          </>
        ) : (
          <form className="summer-blog-unlock-form" onSubmit={handleUnlock}>
            <label className="summer-blog-unlock-label" htmlFor="summer-blog-pass">
              Passcode to edit
            </label>
            <input
              id="summer-blog-pass"
              type="password"
              className="summer-blog-input"
              value={passcode}
              onChange={(event) => setPasscode(event.target.value)}
              placeholder="Enter passcode"
              autoComplete="off"
            />
            <button type="submit" className="summer-blog-btn">
              Unlock
            </button>
          </form>
        )}
      </div>

      {loadError && (
        <p className="summer-blog-message">
          Couldn&apos;t load the saved links. Reload to try again.
        </p>
      )}
      {message && <p className="summer-blog-message">{message}</p>}

      <div className="summer-blog-weeks">
        {weeks.map((weekStart) => {
          const isCurrent = weekStart === currentWeek;
          return (
            <div
              key={weekStart}
              className={`card summer-blog-week${isCurrent ? " is-current" : ""}`}
            >
              <div className="summer-blog-week-head">
                <h3>{isCurrent ? "This week" : formatWeekRange(weekStart)}</h3>
                <span className="summer-blog-week-meta">
                  {isCurrent
                    ? `${formatWeekRange(weekStart)} · due ${formatDeadline(weekStart)}`
                    : null}
                </span>
              </div>

              <div className="summer-blog-rows">
                {AUTHORS.map((author) => {
                  const key = slotKey(weekStart, author.key);
                  return (
                    <div className="summer-blog-row" key={author.key}>
                      <span className="summer-blog-author">{author.name}</span>
                      <div className="summer-blog-slot">
                        <Slot
                          entry={entries[key] ?? null}
                          unlocked={unlocked}
                          isEditing={editingKey === key}
                          busy={busyKey === key}
                          onEdit={() => {
                            setMessage("");
                            setEditingKey(key);
                          }}
                          onCancel={() => setEditingKey(null)}
                          onSave={(url, title) =>
                            handleSave(weekStart, author.key, url, title)
                          }
                          onClear={() => handleClear(weekStart, author.key)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type SlotProps = {
  entry: SummerEntry | null;
  unlocked: boolean;
  isEditing: boolean;
  busy: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (url: string, title: string) => void;
  onClear: () => void;
};

function Slot({
  entry,
  unlocked,
  isEditing,
  busy,
  onEdit,
  onCancel,
  onSave,
  onClear
}: SlotProps) {
  if (isEditing) {
    return (
      <SlotForm entry={entry} busy={busy} onSave={onSave} onCancel={onCancel} />
    );
  }

  if (entry) {
    return (
      <div className="summer-blog-filled">
        <a
          href={entry.url}
          target="_blank"
          rel="noopener noreferrer"
          className="summer-blog-link"
        >
          {entry.title || prettyUrl(entry.url)}
        </a>
        {unlocked && (
          <span className="summer-blog-slot-actions">
            <button
              type="button"
              className="summer-blog-btn-quiet"
              onClick={onEdit}
              disabled={busy}
            >
              Edit
            </button>
            <button
              type="button"
              className="summer-blog-btn-quiet"
              onClick={onClear}
              disabled={busy}
            >
              {busy ? "Clearing…" : "Clear"}
            </button>
          </span>
        )}
      </div>
    );
  }

  if (unlocked) {
    return (
      <button type="button" className="summer-blog-add" onClick={onEdit}>
        + Add link
      </button>
    );
  }

  return <span className="summer-blog-empty">Not yet</span>;
}

type SlotFormProps = {
  entry: SummerEntry | null;
  busy: boolean;
  onSave: (url: string, title: string) => void;
  onCancel: () => void;
};

function SlotForm({ entry, busy, onSave, onCancel }: SlotFormProps) {
  const [url, setUrl] = useState(entry?.url ?? "");
  const [title, setTitle] = useState(entry?.title ?? "");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!url.trim()) {
      return;
    }
    onSave(url.trim(), title.trim());
  };

  return (
    <form className="summer-blog-slotform" onSubmit={submit}>
      <input
        type="url"
        className="summer-blog-input"
        value={url}
        onChange={(event) => setUrl(event.target.value)}
        placeholder="https://your-piece.example"
        aria-label="Link to your piece"
        required
      />
      <input
        type="text"
        className="summer-blog-input"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Title (optional)"
        aria-label="Title (optional)"
        maxLength={160}
      />
      <div className="summer-blog-slotform-actions">
        <button type="submit" className="summer-blog-btn" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          className="summer-blog-btn-quiet"
          onClick={onCancel}
          disabled={busy}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
