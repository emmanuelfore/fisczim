// PremiumColors.ts — single source of truth for all theme tokens and hooks.
// Previously split between .ts and .tsx; now fully consolidated here.

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ── Palettes ──────────────────────────────────────────────────────────────────

export const DarkTheme = {
  amber: {
    primary: "#FF9100", // User-specified Orange
    light: "#FFA733",
    glowLg: "rgba(255, 145, 0, 0.08)",
    glowExtreme: "rgba(255, 145, 0, 0.04)",
    brown: "#412301",
    primarySoft: "#412301",
    primaryPressed: "#E68200",
    iconOnPrimary: "#000000",
  },
  bg: {
    base: "#080604", // Deep brown-black base
    primary: "#14100B",
    card: "#24170A", // Layered depth
    hover: "#412301", 
    panel: "rgba(20, 16, 11, 0.82)", // Glassmorphic panel base
    panel2: "rgba(36, 23, 10, 0.45)", // Lighter glass layer
    glassBorder: "rgba(255, 145, 0, 0.12)",
  },
  text: {
    primary: "#F8FAFC",
    secondary: "#A1A1AA",
    muted: "#A1A1AA",
  },
  border: {
    default: "#3A2612", 
    soft: "#4A2D0F",
    vibrant: "rgba(255, 145, 0, 0.35)",
  },
  status: {
    success: "#00d084",
    error: "#F87171",
    warning: "#FF9100",
    info: "#3b9eff",
  },
};

export const LightTheme = {
  amber: {
    primary: "#E68200", 
    light: "#FF9100",
    glowLg: "rgba(230, 130, 0, 0.04)",
    glowExtreme: "rgba(230, 130, 0, 0.02)",
    brown: "#FFF7ED",
    primarySoft: "#FFF7ED",
    primaryPressed: "#E68200",
    iconOnPrimary: "#000000",
  },
  bg: {
    base: "#F9FAFB",
    primary: "#F3F4F6",
    card: "#FFFFFF",
    hover: "#F3F4F6",
    panel: "rgba(255, 255, 255, 0.9)", 
    panel2: "rgba(249, 250, 251, 0.5)",
    glassBorder: "rgba(230, 130, 0, 0.25)", // More visible in Light Mode
  },
  text: {
    primary: "#111827",
    secondary: "#6B7280",
    muted: "#6B7280",
  },
  border: {
    default: "#D1D5DB", 
    soft: "#E5E7EB",
    vibrant: "rgba(230, 130, 0, 0.4)",
  },
  status: {
    success: "#059669",
    error: "#DC2626",
    warning: "#D97706",
    info: "#2563EB",
  },
};

export const hexAlpha = (hex: string, alpha: number): string => {
  if (!hex || hex.length < 7) return `rgba(0,0,0,${alpha})`;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};

// ── Types ─────────────────────────────────────────────────────────────────────

export type ThemeMode = "light" | "dark" | "system";
export type Theme = typeof DarkTheme;

const THEME_PREF_KEY = "@fiscalstack_theme_pref";

// ── Context ───────────────────────────────────────────────────────────────────

interface ThemeContextValue {
  theme: Theme;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  isDark: boolean;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: DarkTheme,
  mode: "system",
  setMode: () => {},
  isDark: true,
  toggleTheme: () => {},
});

// ── Provider ──────────────────────────────────────────────────────────────────

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>("light"); // Default to light as requested

  useEffect(() => {
    AsyncStorage.getItem(THEME_PREF_KEY).then((val) => {
      if (val === "light" || val === "dark" || val === "system") {
        setModeState(val);
      }
    });
  }, []);

  const setMode = useCallback(async (newMode: ThemeMode) => {
    setModeState(newMode);
    await AsyncStorage.setItem(THEME_PREF_KEY, newMode);
  }, []);

  const isDark =
    mode === "dark" || (mode === "system" && systemScheme !== "light");
  const toggleTheme = useCallback(() => {
    setMode(isDark ? "light" : "dark");
  }, [isDark, setMode]);

  const theme: Theme = isDark ? DarkTheme : LightTheme;

  return (
    <ThemeContext.Provider value={{ theme, mode, setMode, isDark, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

export function useTheme() {
  return useContext(ThemeContext);
}

// Backward-compat static export — screens not yet migrated to useTheme() use this.
// It always returns the dark palette, which is still the default.
export const PremiumColors = DarkTheme;
