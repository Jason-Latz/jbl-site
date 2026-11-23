"use client";

import { useEffect, useRef, type CSSProperties } from "react";

export default function DeskEntry({ style }: { style?: CSSProperties }) {
  const link = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    function enter(event: KeyboardEvent) {
      if (event.code !== "Space" || event.repeat || event.defaultPrevented ||
          event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.isComposing || document.querySelector("dialog[open]")) return;

      const target = event.target;
      if (target instanceof Element && target.closest(
        "a, button, input, textarea, select, [contenteditable], [role='button'], [role='textbox'], [role='combobox']"
      )) return;

      const anchor = link.current;
      if (!anchor) return;
      const bounds = anchor.getBoundingClientRect();
      if (bounds.top < 0 || bounds.bottom > window.innerHeight) return;

      event.preventDefault();
      window.location.assign(anchor.href);
    }

    window.addEventListener("keydown", enter);
    return () => window.removeEventListener("keydown", enter);
  }, []);

  return (
    <a ref={link} className="landing-hit landing-key" style={style} href="/desk" title="Desk (Space)" aria-keyshortcuts="Space">
      <span className="sr-only">Desk</span>
    </a>
  );
}
