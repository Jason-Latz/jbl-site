"use client";

import { useCallback, useEffect, useState } from "react";

export type SiteTheme = "light" | "dark";

const STORAGE_KEY = "site-theme";

function isTheme(value: string | null): value is SiteTheme {
  return value === "light" || value === "dark";
}

function readDocumentTheme(): SiteTheme {
  if (typeof document === "undefined") {
    return "light";
  }
  const attr = document.documentElement.getAttribute("data-theme");
  return isTheme(attr) ? attr : "light";
}

// Bridges the site-wide theme system (data-theme attribute + localStorage,
// also driven by the header ThemeToggle) into React state the 3D scene can
// react to. Watches the attribute so all theme controls stay in sync.
export function useSiteTheme() {
  const [theme, setThemeState] = useState<SiteTheme>("light");

  useEffect(() => {
    setThemeState(readDocumentTheme());

    const observer = new MutationObserver(() => {
      setThemeState(readDocumentTheme());
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"]
    });
    return () => observer.disconnect();
  }, []);

  const setTheme = useCallback((next: SiteTheme) => {
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // In-memory theme still applies when storage is unavailable.
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(readDocumentTheme() === "dark" ? "light" : "dark");
  }, [setTheme]);

  return { theme, setTheme, toggleTheme };
}
