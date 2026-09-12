import "./src/lib/polyfills";
import React, { useEffect } from "react";
import { Platform, useWindowDimensions } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import * as NavigationBar from "expo-navigation-bar";
import * as ScreenOrientation from "expo-screen-orientation";
import { AppRoot } from "./src/AppRoot";
import { ThemeProvider, useTheme } from "./src/ui/PremiumColors";
import { BeautifulAlertProvider } from "./src/ui/BeautifulAlertProvider";

function ThemedStatusBar() {
  const { isDark } = useTheme();
  return <StatusBar style={isDark ? "light" : "dark"} />;
}

function useTabletOrientation() {
  const { width, height } = useWindowDimensions();
  useEffect(() => {
    const smallest = Math.min(width, height);
    const isTablet = smallest >= 600;
    if (isTablet) {
      ScreenOrientation.unlockAsync().catch(() => {});
    } else {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    }
  }, [width, height]);
}

export default function App() {
  useTabletOrientation();

  useEffect(() => {
    if (Platform.OS === "android") {
      NavigationBar.setBackgroundColorAsync("transparent");
      NavigationBar.setBehaviorAsync("overlay-swipe");
    }
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <SafeAreaProvider>
          <ThemedStatusBar />
          <BeautifulAlertProvider>
            <AppRoot />
          </BeautifulAlertProvider>
        </SafeAreaProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
