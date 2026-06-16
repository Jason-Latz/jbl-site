"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

const STORAGE_KEY = "site-theme";

function isTheme(value: string | null): value is Theme {
  return value === "light" || value === "dark";
}

function readDocumentTheme(): Theme {
  const attr = document.documentElement.getAttribute("data-theme");
  return isTheme(attr) ? attr : "light";
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    setTheme(readDocumentTheme());
    setIsReady(true);

    // Other controls (notably the desk lamp) toggle the theme by writing the
    // data-theme attribute directly. Observe it so this button never falls out
    // of sync with the actual theme.
    const observer = new MutationObserver(() => {
      setTheme(readDocumentTheme());
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"]
    });
    return () => observer.disconnect();
  }, []);

  const toggleTheme = () => {
    const next = readDocumentTheme() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);

    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Ignore storage errors; the observer still syncs in-memory state.
    }
    // React state updates via the MutationObserver in the mount effect.
  };

  const icon = isReady
    ? theme === "dark"
      ? "☀"
      : "☾"
    : "☾";

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggleTheme}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
    >
      <span className="theme-toggle-icon" aria-hidden="true">
        {icon}
      </span>
    </button>
  );
}
