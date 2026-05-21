import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  SafeAreaView,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  LayoutDashboard,
  PieChart,
  User,
  LogOut,
  X,
  ChevronRight,
  Package,
  ArrowDownToLine,
  ArrowRightLeft,
  Users,
  Truck,
  Receipt,
  Activity,
  AlertTriangle,
  UserCog,
} from "lucide-react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { apiFetch } from "../lib/api";
import { normalizeBusSettings, type BusSettings } from "../lib/busSettings";
import { normalizeAppMode, type AppMode } from "../lib/appMode";

import { useTheme, hexAlpha } from "./PremiumColors";

type ScreenName = "dashboard" | "pos" | "reports" | "profile" | "inventory" | "stockin" | "stockops" | "customers" | "suppliers" | "expenses" | "cashiers" | "stocktake" | "busTicketing";
type MenuItem = { icon: any; label: string; id: ScreenName; isMCI?: boolean; section?: string };

interface AppDrawerProps {
  visible: boolean;
  onClose: () => void;
  currentScreen: ScreenName;
  onNavigate: (screen: ScreenName) => void;
  onLogout: () => void;
  userName: string;
  userRole?: string;
  busSettings?: BusSettings;
  appMode?: AppMode;
}

export function AppDrawer({
  visible,
  onClose,
  currentScreen,
  onNavigate,
  onLogout,
  userName,
  userRole,
  busSettings,
  appMode,
}: AppDrawerProps) {
  const insets = useSafeAreaInsets();
  const { theme: C, isDark } = useTheme();
  const [isOnline, setIsOnline] = useState<boolean | null>(null);
  const normalizedBusSettings = normalizeBusSettings(busSettings);
  const mode = normalizedBusSettings.enabled ? "bus_ticketing" : normalizeAppMode(appMode);

  useEffect(() => {
    if (!visible) return;
    apiFetch("/api/health")
      .then(res => setIsOnline(res.ok))
      .catch(() => setIsOnline(false));
  }, [visible]);

  const posMenuItems: MenuItem[] = [
    { icon: LayoutDashboard, label: "Dashboard", id: "dashboard", section: "Overview" },
    { icon: Receipt, label: "Sales", id: "pos", section: "Sales" },
    { icon: Users, label: "Customers", id: "customers", section: "Sales" },
    { icon: PieChart, label: "Reports", id: "reports", section: "Sales" },
    { icon: Package, label: "Products", id: "inventory", section: "Inventory" },
    { icon: ArrowDownToLine, label: "GDNs / GRVs", id: "stockin", section: "Inventory" },
    { icon: ArrowRightLeft, label: "Adjust / Transfer", id: "stockops", section: "Inventory" },
    { icon: Activity, label: "Physical Counts", id: "stocktake", section: "Inventory" },
    { icon: Truck, label: "Suppliers", id: "suppliers", section: "Inventory" },
    { icon: UserCog, label: "Cashiers", id: "cashiers", section: "Admin" },
    { icon: Receipt, label: "Expenses", id: "expenses", section: "Admin" },
    { icon: User, label: "Profile", id: "profile", section: "Account" },
    ...(normalizedBusSettings.enabled ? [{ icon: "bus", label: "Bus Ticketing", id: "busTicketing" as ScreenName, isMCI: true, section: "Modules" }] : []),
  ];
  const restaurantMenuItems: MenuItem[] = [
    { icon: LayoutDashboard, label: "Dashboard", id: "dashboard", section: "Overview" },
    { icon: Receipt, label: "Restaurant POS", id: "pos", section: "Service" },
    { icon: Package, label: "Menu Items", id: "inventory", section: "Service" },
    { icon: Users, label: "Customers", id: "customers", section: "Service" },
    { icon: PieChart, label: "Reports", id: "reports", section: "Reports" },
    { icon: UserCog, label: "Staff", id: "cashiers", section: "Admin" },
    { icon: Receipt, label: "Expenses", id: "expenses", section: "Admin" },
    { icon: User, label: "Profile", id: "profile", section: "Account" },
  ];
  const busMenuItems: MenuItem[] = [
    { icon: "bus", label: "Ticket Operations", id: "busTicketing", isMCI: true, section: "Operations" },
    { icon: PieChart, label: "Trip Reports", id: "reports", section: "Reports" },
    { icon: User, label: "Profile", id: "profile", section: "Account" },
  ];
  const allMenuItems = mode === "bus_ticketing" ? busMenuItems : mode === "restaurant" ? restaurantMenuItems : posMenuItems;

  const menuItems = allMenuItems.filter(item => {
    const role = (userRole || "member").toLowerCase();
    // Super-admins, owners, and admins see everything
    if (role === "owner" || role === "admin" || role === "superadmin" || (userName === "Super Admin")) return true;

    // Cashiers/Members are restricted
    if (role === "cashier" || role === "member") {
      const allowed = mode === "bus_ticketing"
        ? ["busTicketing", "reports", "profile"]
        : mode === "restaurant"
          ? ["pos", "reports", "profile"]
          : ["pos", "stockin", "customers", "profile", "reports"];
      return allowed.includes(item.id);
    }

    // Accountants see reports and expenses but maybe not POS?
    if (role === "accountant") {
      const allowed = mode === "bus_ticketing"
        ? ["busTicketing", "reports", "profile"]
        : ["dashboard", "reports", "inventory", "stockin", "stockops", "suppliers", "expenses", "profile", "busTicketing"];
      return allowed.includes(item.id);
    }

    return true; // Default to showing if unsure
  });
  const menuSections = menuItems.reduce<Array<{ title: string; items: MenuItem[] }>>((sections, item) => {
    const title = item.section || "Menu";
    const section = sections.find((entry) => entry.title === title);
    if (section) {
      section.items.push(item);
    } else {
      sections.push({ title, items: [item] });
    }
    return sections;
  }, []);

  const styles = getStyles(C);

  return (
    <Modal visible={visible} transparent animationType="none">
      <View style={styles.overlay}>
        <TouchableOpacity
          activeOpacity={1}
          onPress={onClose}
          style={styles.backdrop}
        />
        <View style={styles.drawerContainer}>
          <LinearGradient
            colors={[C.bg.card, C.bg.base]}
            style={styles.drawer}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <SafeAreaView style={{ flex: 1 }}>
              <View style={[styles.header, { borderBottomColor: C.border.default }]}>
                <Text style={styles.brand}>FieldPOS</Text>
                <TouchableOpacity onPress={onClose} style={[styles.closeBtn, { backgroundColor: C.bg.hover }]}>
                  <X size={20} color={C.text.primary} />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.menu}>
                {menuSections.map((section) => (
                  <View key={section.title} style={styles.menuSection}>
                    <Text style={styles.sectionLabel}>{section.title}</Text>
                    {section.items.map((item) => {
                      const isActive = currentScreen === item.id;
                      const Icon = item.icon;
                      return (
                        <TouchableOpacity
                          key={item.id}
                          onPress={() => {
                            onNavigate(item.id);
                            onClose();
                          }}
                          style={[
                            styles.menuItem,
                            isActive && { backgroundColor: isDark ? C.amber.glowLg : hexAlpha(C.amber.primary, 0.1) },
                          ]}
                        >
                          <View style={styles.menuItemLeft}>
                            {item.isMCI ? (
                              <MaterialCommunityIcons
                                name={item.icon as any}
                                size={20}
                                color={isActive ? C.amber.primary : C.text.secondary}
                              />
                            ) : (
                              <Icon
                                size={20}
                                color={isActive ? C.amber.primary : C.text.secondary}
                              />
                            )}
                            <Text
                              style={[
                                styles.menuLabel,
                                isActive && styles.menuLabelActive,
                              ]}
                            >
                              {item.label}
                            </Text>
                          </View>
                          {isActive && (
                            <ChevronRight size={16} color={C.amber.primary} />
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ))}
              </ScrollView>

              <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 24) }]}>
                <View style={styles.userInfo}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                      {userName.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View>
                    <Text style={styles.userName}>{userName}</Text>
                    <Text style={styles.userRole}>{(userRole || "member").charAt(0).toUpperCase() + (userRole || "member").slice(1)}</Text>
                  </View>
                </View>

                <View style={styles.healthInfo}>
                  <View style={[styles.healthDot, { backgroundColor: isOnline === true ? C.status.success : isOnline === false ? C.status.error : C.text.secondary }]} />
                  <Text style={styles.healthText}>
                    {isOnline === true ? "Server Online" : isOnline === false ? "Server Offline / Network Error" : "Checking Server..."}
                  </Text>
                  {isOnline === false && <AlertTriangle size={12} color={C.status.error} />}
                </View>

                <TouchableOpacity
                  onPress={onLogout}
                  style={[styles.logoutBtn, { backgroundColor: hexAlpha(C.status.error, 0.1) }]}
                >
                  <LogOut size={18} color={C.status.error} />
                  <Text style={styles.logoutText}>Sign Out</Text>
                </TouchableOpacity>
              </View>
            </SafeAreaView>
          </LinearGradient>
        </View>
      </View>
    </Modal>
  );
}

const getStyles = (C: any) => StyleSheet.create({
  overlay: {
    flex: 1,
    flexDirection: "row",
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
  },
  drawerContainer: {
    width: 280,
    height: "100%",
  },
  drawer: {
    flex: 1,
    borderRightWidth: 1,
    borderRightColor: C.border.default,
  },
  header: {
    padding: 24,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
  },
  brand: {
    color: C.amber.primary,
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -1,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  menu: {
    flex: 1,
    padding: 16,
  },
  menuSection: {
    marginBottom: 14,
  },
  sectionLabel: {
    marginBottom: 6,
    paddingHorizontal: 12,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.4,
    color: C.text.tertiary,
    textTransform: "uppercase",
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
  },
  menuItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  menuLabel: {
    color: C.text.secondary,
    fontSize: 15,
    fontWeight: "600",
  },
  menuLabelActive: {
    color: C.text.primary,
  },
  footer: {
    padding: 24,
    borderTopWidth: 1,
    borderTopColor: C.border.default,
  },
  userInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 20,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.amber.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#000",
    fontWeight: "900",
    fontSize: 16,
  },
  userName: {
    color: C.text.primary,
    fontSize: 14,
    fontWeight: "700",
  },
  userRole: {
    color: C.text.secondary,
    fontSize: 11,
  },
  healthInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 20,
    paddingHorizontal: 4
  },
  healthDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  healthText: {
    color: C.text.secondary,
    fontSize: 11,
    fontWeight: "600",
  },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 12,
  },
  logoutText: {
    color: C.status.error,
    fontSize: 14,
    fontWeight: "700",
  },
});
