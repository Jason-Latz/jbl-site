"use client";

import {
  createContext,
  useContext,
  useMemo,
  useRef,
  type MutableRefObject,
  type ReactNode
} from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { SiteTheme } from "./useSiteTheme";

type DeskThemeValue = {
  theme: SiteTheme;
  // 0 = dark (lamp off), 1 = light (lamp on). Damped every frame so
  // lights/emissives can crossfade instead of snapping.
  mixRef: MutableRefObject<number>;
  toggleTheme: () => void;
};

const DeskThemeContext = createContext<DeskThemeValue | null>(null);

function ThemeMixDriver({
  theme,
  mixRef
}: {
  theme: SiteTheme;
  mixRef: MutableRefObject<number>;
}) {
  useFrame((_, delta) => {
    const target = theme === "light" ? 1 : 0;
    mixRef.current = THREE.MathUtils.damp(mixRef.current, target, 3.4, delta);
  });
  return null;
}

export function DeskThemeProvider({
  theme,
  toggleTheme,
  children
}: {
  theme: SiteTheme;
  toggleTheme: () => void;
  children: ReactNode;
}) {
  const mixRef = useRef(theme === "light" ? 1 : 0);
  const value = useMemo(
    () => ({ theme, mixRef, toggleTheme }),
    [theme, toggleTheme]
  );

  return (
    <DeskThemeContext.Provider value={value}>
      <ThemeMixDriver theme={theme} mixRef={mixRef} />
      {children}
    </DeskThemeContext.Provider>
  );
}

export function useDeskTheme(): DeskThemeValue {
  const value = useContext(DeskThemeContext);
  if (!value) {
    throw new Error("useDeskTheme must be used inside DeskThemeProvider.");
  }
  return value;
}
