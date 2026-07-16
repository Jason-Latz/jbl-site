"use client";

// Guided-tap affordances for touch visitors: a soft coral breathing dot floats
// over each interactive object so a phone user can SEE what's tappable (the 3D
// gives no hover cursor). Rendered as drei <Html> anchored at each object's
// world position, so tapping a dot is a real DOM click (unlike the in-canvas
// R3F raycast, which can't be driven synthetically) that fires the object's own
// action. They appear only after the scene reveals, only on coarse-pointer
// devices, and fade away the moment the visitor first touches the canvas (taps
// an object, starts an orbit) — quiet jewelry, not a tutorial overlay. Shared
// by DeskScene and BakedDeskScene so both behave identically.

import { useCallback, useEffect, useState } from "react";
import { useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { useCoarsePointer } from "./useCoarsePointer";

export type AffordanceItem = {
  id: string;
  // World-space anchor (meters), lifted a touch above the object so the dot
  // floats at its interactive point rather than sinking into the desk.
  position: [number, number, number];
  // Accessible label — what tapping the dot does.
  label: string;
  onActivate: () => void;
};

// The interactive objects, with the dot lifted to each one's interactive point
// (world meters; positions mirror layout.ts PLACEMENT with a small y offset).
// Built here so DeskScene and BakedDeskScene wire IDENTICAL anchors and only
// supply their own handlers. The film camera stands in for the whole
// photography corner (its adjacent print stack routes to the same place), so
// one quiet dot serves it rather than two crowded ones.
export function buildAffordanceItems(handlers: {
  onRecords: () => void;
  onToggleLamp: () => void;
  onWork: () => void;
  onReading: () => void;
  onChess: () => void;
  onNotes: () => void;
  onPhotography: () => void;
}): AffordanceItem[] {
  return [
    {
      id: "records",
      position: [-0.58, 0.12, 0.06],
      label: "Open the record player",
      onActivate: handlers.onRecords
    },
    {
      id: "lamp",
      position: [-0.84, 0.34, -0.34],
      label: "Toggle the lamp to switch the theme",
      onActivate: handlers.onToggleLamp
    },
    {
      id: "work",
      position: [0.02, 0.07, -0.08],
      label: "See what I'm building",
      onActivate: handlers.onWork
    },
    {
      id: "notes",
      position: [-0.18, 0.03, 0.22],
      label: "Leave a note",
      onActivate: handlers.onNotes
    },
    {
      id: "reading",
      position: [0.57, 0.13, -0.36],
      label: "Open the bookshelf",
      onActivate: handlers.onReading
    },
    {
      id: "chess",
      position: [0.55, 0.07, 0.2],
      label: "Play the live chess game",
      onActivate: handlers.onChess
    },
    {
      id: "photography",
      position: [-0.13, 0.07, -0.32],
      label: "See my photography",
      onActivate: handlers.onPhotography
    }
  ];
}

const FADE_MS = 480;

export default function DeskAffordances({
  items,
  ready
}: {
  items: AffordanceItem[];
  ready: boolean;
}) {
  const coarse = useCoarsePointer();
  const { gl } = useThree();
  const [phase, setPhase] = useState<"hidden" | "shown" | "fading">("hidden");

  const dismiss = useCallback(() => {
    setPhase((p) => (p === "shown" ? "fading" : p));
  }, []);

  // Reveal once the scene is presentable AND this is a touch device.
  useEffect(() => {
    if (coarse && ready) setPhase((p) => (p === "hidden" ? "shown" : p));
  }, [coarse, ready]);

  // After the fade transition, unmount so the <Html> projections stop costing
  // per-frame work.
  useEffect(() => {
    if (phase !== "fading") return;
    const t = window.setTimeout(() => setPhase("hidden"), FADE_MS);
    return () => window.clearTimeout(t);
  }, [phase]);

  // The first canvas touch (tapping an object, starting an orbit drag) retires
  // the hints. The <Html> dots live in a portal outside the canvas element, so
  // their own taps don't trip this — they dismiss through onActivate instead.
  useEffect(() => {
    if (phase !== "shown") return;
    const el = gl.domElement;
    const onDown = () => dismiss();
    el.addEventListener("pointerdown", onDown, { once: true });
    return () => el.removeEventListener("pointerdown", onDown);
  }, [phase, gl, dismiss]);

  if (!coarse || phase === "hidden") return null;

  return (
    <>
      {items.map((it) => (
        <Html
          key={it.id}
          position={it.position}
          center
          zIndexRange={[30, 0]}
          // Constant on-screen size (no distanceFactor) so every dot reads as
          // the same small piece of jewelry regardless of depth.
          style={{ pointerEvents: "none" }}
        >
          <button
            type="button"
            className={
              phase === "fading"
                ? "desk-affordance desk-affordance-hiding"
                : "desk-affordance"
            }
            aria-label={it.label}
            onClick={(e) => {
              e.stopPropagation();
              it.onActivate();
              dismiss();
            }}
          >
            <span className="desk-affordance-dot" aria-hidden="true" />
          </button>
        </Html>
      ))}
    </>
  );
}
