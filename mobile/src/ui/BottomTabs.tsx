import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  LayoutDashboard,
  PieChart,
  Package,
  Receipt,
  Menu,
  ArrowDownToLine,
} from "lucide-react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { useTheme, hexAlpha } from "./PremiumColors";
import { normalizeBusSettings, type BusSettings } from "../lib/busSettings";
import { normalizeAppMode, type AppMode } from "../lib/appMode";

type ScreenName = "dashboard" | "pos" | "reports" | "profile" | "inventory" | "stockin" | "stockops" | "customers" | "suppliers" | "expenses" | "cashiers" | "stocktake" | "busTicketing";

interface BottomTabsProps {
  currentScreen: ScreenName;
  onNavigate: (screen: ScreenName) => void;
  onOpenDrawer: () => void;
  userRole?: string;
  userName?: string;
  busSettings?: BusSettings;
  appMode?: AppMode;
}

export function BottomTabs({
  currentScreen,
  onNavigate,
  onOpenDrawer,
  userRole = "member",
  userName = "",
  busSettings,
  appMode,
}: BottomTabsProps) {
  const insets = useSafeAreaInsets();
  const { theme: C, isDark } = useTheme();
  const styles = getStyles(C);
  const role = userRole.toLowerCase();
  const isAdmin = role === "owner" || role === "admin" || role === "superadmin" || userName === "Super Admin";
  const isCashier = role === "cashier" || role === "member";
  const normalizedBusSettings = normalizeBusSettings(busSettings);
  const mode = normalizedBusSettings.enabled ? "bus_ticketing" : normalizeAppMode(appMode);
  
  const posTabs: { icon: any; label: string; id: ScreenName | "menu"; isMCI?: boolean }[] = [
    { icon: LayoutDashboard, label: "Home", id: "dashboard" },
    { icon: Receipt, label: "Sales", id: "pos" },
    { icon: ArrowDownToLine, label: "GDN", id: "stockin" },
    { icon: Package, label: "Products", id: "inventory" },
    { icon: Receipt, label: "Expenses", id: "expenses" },
    { icon: PieChart, label: "Reports", id: "reports" },
    ...(normalizedBusSettings.enabled ? [{ icon: "bus", label: "Bus", id: "busTicketing" as ScreenName, isMCI: true }] : []),
    { icon: Menu, label: "Menu", id: "menu" },
  ];
  const restaurantTabs: typeof posTabs = [
    { icon: Receipt, label: "Orders", id: "pos" },
    { icon: PieChart, label: "Reports", id: "reports" },
    { icon: Package, label: "Menu", id: "inventory" },
    { icon: Menu, label: "Menu", id: "menu" },
  ];
  const busTabs: typeof posTabs = [
    { icon: "bus", label: "Bus", id: "busTicketing", isMCI: true },
    { icon: PieChart, label: "Trip Reports", id: "reports" },
    { icon: Menu, label: "Menu", id: "menu" },
  ];
  const allTabs = mode === "bus_ticketing" ? busTabs : mode === "restaurant" ? restaurantTabs : posTabs;

  const tabs = allTabs.filter(tab => {
    if (tab.id === "menu") return true;
    if (isAdmin) return true;
    
    if (isCashier) {
      const allowed = mode === "bus_ticketing"
        ? ["busTicketing", "reports"]
        : mode === "restaurant"
          ? ["pos", "reports"]
          : ["pos", "stockin", "reports"];
      return allowed.includes(tab.id);
    }
    
    if (role === "accountant") {
      return ["dashboard", "reports", "inventory", "expenses"].includes(tab.id);
    }
    
    return true;
  });

  return (
    <View style={[
      styles.container, 
      { 
        height: Platform.OS === "ios" ? 88 : 68 + insets.bottom,
        paddingBottom: Platform.OS === "ios" ? 28 : Math.max(insets.bottom, 8)
      }
    ]}>
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = currentScreen === tab.id;
        
        return (
          <TouchableOpacity
            key={tab.id}
            style={styles.tab}
            onPress={() => {
              if (tab.id === "menu") {
                onOpenDrawer();
              } else {
                onNavigate(tab.id as ScreenName);
              }
            }}
            activeOpacity={0.7}
          >
            <View style={[styles.iconContainer, isActive && { backgroundColor: hexAlpha(C.amber.primary, 0.15) }]}>
              {tab.isMCI ? (
                <MaterialCommunityIcons
                  name={tab.icon as any}
                  size={22}
                  color={isActive ? C.amber.primary : C.text.secondary}
                />
              ) : (
                <Icon
                  size={22}
                  color={isActive ? C.amber.primary : C.text.secondary}
                  strokeWidth={isActive ? 2.5 : 2}
                />
              )}
            </View>
            <Text style={[styles.label, isActive && styles.activeLabel]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const getStyles = (C: any) => StyleSheet.create({
  container: {
    flexDirection: "row",
    backgroundColor: C.bg.card,
    height: Platform.OS === "ios" ? 88 : 68,
    borderTopWidth: 1,
    borderTopColor: C.border.default,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: -5 },
    elevation: 10,
    paddingHorizontal: 8,
    justifyContent: "space-around",
    alignItems: "center",
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 8,
  },
  iconContainer: {
    width: 44,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },
  label: {
    fontSize: 10,
    fontWeight: "700",
    color: C.text.secondary,
    marginTop: 6,
  },
  activeLabel: {
    color: C.amber.primary,
    fontWeight: "900",
  },
});
