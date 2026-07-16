"use client";

// First-visit "drag to look around" nudge for touch visitors. The desk gives no
// hover cursor, so a phone user has no signal that the scene can be orbited;
// this quiet chip says so once. It appears only on coarse-pointer devices, only
// after the scene reveals, retires on the first drag/tap or after a few seconds,
// and is remembered in localStorage so it shows at most once per device.

import { useEffect, useState } from "react";
import { useCoarsePointer } from "./useCoarsePointer";

const STORAGE_KEY = "desk-drag-hint-seen";
const AUTO_DISMISS_MS = 4200;
const LEAVE_MS = 420;

export default function DragHint({ ready }: { ready: boolean }) {
  const coarse = useCoarsePointer();
  const [state, setState] = useState<"idle" | "shown" | "leaving" | "done">(
    "idle"
  );

  // Decide once whether to show: touch device, scene revealed, not seen before.
  useEffect(() => {
    if (!coarse || !ready || state !== "idle") return;
    let seen = false;
    try {
      seen = localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      // localStorage blocked (private mode) — treat as unseen; it just won't
      // persist across reloads.
    }
    setState(seen ? "done" : "shown");
  }, [coarse, ready, state]);

  // While shown: remember it, and arm both dismissals — a wall-clock timeout and
  // the first real drag/tap on the hero.
  useEffect(() => {
    if (state !== "shown") return;
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore
    }
    const leave = () => setState((s) => (s === "shown" ? "leaving" : s));
    const timer = window.setTimeout(leave, AUTO_DISMISS_MS);
    const hero = document.querySelector(".desk-hero");
    hero?.addEventListener("pointerdown", leave, { once: true });
    window.addEventListener("touchmove", leave, { once: true, passive: true });
    return () => {
      window.clearTimeout(timer);
      hero?.removeEventListener("pointerdown", leave);
      window.removeEventListener("touchmove", leave);
    };
  }, [state]);

  // Unmount after the leave animation finishes.
  useEffect(() => {
    if (state !== "leaving") return;
    const t = window.setTimeout(() => setState("done"), LEAVE_MS);
    return () => window.clearTimeout(t);
  }, [state]);

  if (!coarse || (state !== "shown" && state !== "leaving")) return null;

  return (
    <p
      className={
        state === "leaving"
          ? "desk-drag-hint desk-drag-hint-leaving"
          : "desk-drag-hint"
      }
      role="status"
    >
      <span className="desk-drag-hint-glyph" aria-hidden="true" />
      drag to look around
    </p>
  );
}
