"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

const STORAGE_KEY = "site-theme";

function isTheme(value: string | null): value is Theme {
  return value === "light" || value === "dark";
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const rootTheme = document.documentElement.getAttribute("data-theme");
    if (isTheme(rootTheme)) {
      setTheme(rootTheme);
    }

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (isTheme(stored)) {
        setTheme(stored);
        applyTheme(stored);
      } else {
        setTheme("light");
        applyTheme("light");
      }
    } catch {
      setTheme("light");
      applyTheme("light");
    } finally {
      setIsReady(true);
    }
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
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
