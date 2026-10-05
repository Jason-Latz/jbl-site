"use client";

import { useEffect, useRef } from "react";

export default function DeskEntry() {
  const link = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    function enter(event: KeyboardEvent) {
      if (event.code !== "Space" || event.repeat || event.defaultPrevented ||
          event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.isComposing) return;

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
    <div className="landing-desk-entry">
      <a ref={link} className="landing-desk-action" href="/desk" aria-keyshortcuts="Space">
        Enter the desk <span aria-hidden="true">→</span>
      </a>
      <span className="landing-desk-shortcut">or press <kbd>Space</kbd> to enter</span>
    </div>
  );
}
