"use client";

import { useEffect, useRef, useState } from "react";

type Theme = "light" | "dark";

const STORAGE_KEY = "site-theme";

function getSystemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function isTheme(value: string | null): value is Theme {
  return value === "light" || value === "dark";
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");
  const [isReady, setIsReady] = useState(false);
  const hasStoredPreferenceRef = useRef(false);

  useEffect(() => {
    const rootTheme = document.documentElement.getAttribute("data-theme");
    if (isTheme(rootTheme)) {
      setTheme(rootTheme);
    }

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (isTheme(stored)) {
        hasStoredPreferenceRef.current = true;
        setTheme(stored);
        applyTheme(stored);
      } else {
        const next = getSystemTheme();
        setTheme(next);
        applyTheme(next);
      }
    } catch {
      const next = getSystemTheme();
      setTheme(next);
      applyTheme(next);
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const syncWithSystem = (event: MediaQueryListEvent) => {
      if (hasStoredPreferenceRef.current) {
        return;
      }

      const next = event.matches ? "dark" : "light";
      setTheme(next);
      applyTheme(next);
    };

    mediaQuery.addEventListener("change", syncWithSystem);
    setIsReady(true);

    return () => {
      mediaQuery.removeEventListener("change", syncWithSystem);
    };
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    hasStoredPreferenceRef.current = true;
    setTheme(next);
    applyTheme(next);

    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Ignore storage errors and continue with in-memory theme state.
    }
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
