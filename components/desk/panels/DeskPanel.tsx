"use client";

import { type ReactNode } from "react";

export type DeskPanelProps = {
  eyebrow: string;
  title: string;
  onClose: () => void;
  children: ReactNode;
};

// Shared shell for the focus panels (records / work / reading / notes):
// a dark-glass column that slides over the right side of the scene while
// the camera holds its close-up. Plain DOM, never inside the canvas.
export default function DeskPanel({
  eyebrow,
  title,
  onClose,
  children
}: DeskPanelProps) {
  return (
    <aside
      className="desk-panel"
      role="dialog"
      aria-modal="false"
      aria-label={title}
    >
      <header className="desk-panel-head">
        <div>
          <p className="desk-panel-eyebrow">{eyebrow}</p>
          <h2 className="desk-panel-title">{title}</h2>
        </div>
        <button
          type="button"
          className="desk-panel-close"
          onClick={onClose}
          aria-label="Close panel and return to the desk"
        >
          ←<span className="desk-panel-close-label"> back to the desk</span>
        </button>
      </header>
      <div className="desk-panel-body">{children}</div>
    </aside>
  );
}
