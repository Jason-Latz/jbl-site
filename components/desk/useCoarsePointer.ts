"use client";

import { useEffect, useState } from "react";

// True on touch / coarse-pointer devices (phones, tablets), false on desktops
// with a mouse. Defaults to false on the server and first client render so the
// touch-only UI (drag hint, tap affordances) never flashes on desktop — it
// resolves in an effect after mount, exactly like DeskHero's capability gate.
export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(pointer: coarse)");
    const update = () => setCoarse(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);
  return coarse;
}
