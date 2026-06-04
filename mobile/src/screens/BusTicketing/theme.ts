import type { StatusBarStyle } from "react-native";
import { hexAlpha, useTheme, type Theme } from "../../ui/PremiumColors";

export function makeBusColors(theme: Theme, isDark = true) {
  return {
    bg: theme.bg.base,
    surface: theme.bg.card,
    surfaceAlt: theme.bg.hover,
    border: theme.border.default,
    amber: theme.amber.primary,
    amberSoft: hexAlpha(theme.amber.primary, 0.12),
    fire: theme.status.warning,
    fireSoft: hexAlpha(theme.status.warning, 0.12),
    white: theme.text.primary,
    muted: theme.text.secondary,
    success: theme.status.success,
    danger: theme.status.error,
    statusBarStyle: (isDark ? "light-content" : "dark-content") as StatusBarStyle,
  };
}

export type BusColors = ReturnType<typeof makeBusColors>;

export function useBusColors() {
  const { theme, isDark } = useTheme();
  return makeBusColors(theme, isDark);
}
