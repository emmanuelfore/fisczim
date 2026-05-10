import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AlertTriangle, BarChart3, Banknote, Check, Landmark, Menu, Package, Receipt, Scale, TrendingUp, Users } from "lucide-react-native";
import { StatusBar } from "expo-status-bar";
import { apiJson } from "../lib/api";
import { useTheme, hexAlpha } from "../ui/PremiumColors";

type Props = {
  companyId: number;
  userName: string;
  onOpenDrawer: () => void;
  onNavigate: (screen: "pos" | "reports" | "inventory" | "stockin" | "stockops" | "cashiers" | "expenses" | "suppliers", options?: { openCashCollection?: boolean }) => void;
};

export function DashboardScreen({ companyId, userName, onOpenDrawer, onNavigate }: Props) {
  const insets = useSafeAreaInsets();
  const { theme: C } = useTheme();
  const styles = makeStyles(C, insets);
  const [financial, setFinancial] = useState<any>(null);
  const [stock, setStock] = useState<any[]>([]);
  const [abc, setAbc] = useState<any>(null);
  const [shifts, setShifts] = useState<any[]>([]);
  const [cashBalances, setCashBalances] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const monthEnd = now.toISOString();
      try {
        const [financialData, stockData, abcData, shiftData, cashBalanceData, productData, supplierData, userData] = await Promise.all([
          apiJson<any>(`/api/companies/${companyId}/reports/financial-summary?from=${monthStart}&to=${monthEnd}`).catch(() => null),
          apiJson<any[]>(`/api/companies/${companyId}/reports/stock-valuation`).catch(() => []),
          apiJson<any>(`/api/companies/${companyId}/reports/abc-analysis?from=${monthStart}&to=${monthEnd}`).catch(() => null),
          apiJson<any[]>(`/api/pos/reports/shifts?companyId=${companyId}&startDate=${monthStart}&endDate=${monthEnd}`).catch(() => []),
          apiJson<any[]>(`/api/companies/${companyId}/reports/cash-collection-balances?mode=sinceLastCollection`).catch(() => []),
          apiJson<any[]>(`/api/companies/${companyId}/products`).catch(() => []),
          apiJson<any[]>(`/api/companies/${companyId}/suppliers`).catch(() => []),
          apiJson<any[]>(`/api/companies/${companyId}/users`).catch(() => []),
        ]);
        if (!cancelled) {
          setFinancial(financialData);
          setStock(Array.isArray(stockData) ? stockData : []);
          setAbc(abcData);
          setShifts(Array.isArray(shiftData) ? shiftData : []);
          setCashBalances(Array.isArray(cashBalanceData) ? cashBalanceData : []);
          setProducts(Array.isArray(productData) ? productData : []);
          setSuppliers(Array.isArray(supplierData) ? supplierData : []);
          setUsers(Array.isArray(userData) ? userData : []);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [companyId]);

  const stockValue = useMemo(() => stock.reduce((sum, item) => sum + Number(item.stockLevel || 0) * Number(item.unitCost || 0), 0), [stock]);
  const lowStock = useMemo(() => stock.filter((item) => Number(item.stockLevel || 0) <= Number(item.lowStockThreshold || 5)).slice(0, 5), [stock]);
  const topProducts = useMemo(() => {
    const groups = [abc?.aItems, abc?.bItems, abc?.cItems].flat().filter(Boolean);
    return groups.slice(0, 5);
  }, [abc]);

  const revenue = Number(financial?.revenue || 0);
  const grossProfit = Number(financial?.grossProfit || 0);
  const netProfit = Number(financial?.netProfit || 0);
  const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
  const openShiftCount = shifts.filter((shift) => String(shift.status).toLowerCase() === "open").length;
  const unreconciledShifts = shifts.filter((shift) => String(shift.status).toLowerCase() === "closed" && !["approved", "reconciled"].includes(String(shift.reconciliationStatus || "").toLowerCase()));
  const expectedCash = cashBalances.reduce((sum, row) => sum + Number(row.expectedCash || 0), 0);
  const cashVariance = shifts.reduce((sum, shift) => sum + Number(shift.cashVariance || 0), 0);
  const hasProducts = products.some((item) => item?.isActive !== false);
  const hasSuppliers = suppliers.some((item) => item?.isActive !== false);
  const hasCashiers = users.some((item) => item?.role && !["owner", "super_admin"].includes(String(item.role).toLowerCase()));
  const checklist = [
    { label: "Add products", done: hasProducts, screen: "inventory" as const },
    { label: "Add suppliers", done: hasSuppliers, screen: "suppliers" as const },
    { label: "Add cashiers", done: hasCashiers, screen: "cashiers" as const },
  ];
  const completedSetup = checklist.filter((item) => item.done).length;

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <TouchableOpacity onPress={onOpenDrawer} style={styles.iconBtn}><Menu size={20} color={C.text.primary} /></TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.title}>Dashboard</Text>
          <Text style={styles.subtitle}>Welcome back, {userName}</Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={C.amber.primary} style={{ marginTop: 50 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.storyCard}>
            <Text style={styles.storyText}>
              You made ${revenue.toFixed(2)} sales this month, with estimated gross profit of ${grossProfit.toFixed(2)}.
            </Text>
            <Text style={styles.storySub}>
              Gross margin is {grossMargin.toFixed(1)}% and estimated net profit is ${netProfit.toFixed(2)}.
            </Text>
          </View>

          <View style={styles.grid}>
            <MetricCard label="Month Sales" value={`$${revenue.toFixed(2)}`} icon={Receipt} color={C.amber.primary} styles={styles} />
            <MetricCard label="Gross Profit" value={`$${grossProfit.toFixed(2)}`} icon={TrendingUp} color={C.status.success} styles={styles} />
            <MetricCard label="Expenses" value={`$${Number(financial?.expenses || 0).toFixed(2)}`} icon={BarChart3} color={C.status.error} styles={styles} />
            <MetricCard label="Stock Value" value={`$${stockValue.toFixed(2)}`} icon={Package} color={C.status.info} styles={styles} />
          </View>

          <View style={styles.quickRow}>
            <QuickButton label="Sell" onPress={() => onNavigate("pos")} styles={styles} />
            <QuickButton label="Create GRV" onPress={() => onNavigate("stockin")} styles={styles} />
            <QuickButton label="Adjust Stock" onPress={() => onNavigate("stockops")} styles={styles} />
            <QuickButton label="Collect Cash" onPress={() => onNavigate("pos", { openCashCollection: true })} styles={styles} />
            <QuickButton label="Cashiers" onPress={() => onNavigate("cashiers")} styles={styles} />
            <QuickButton label="Reports" onPress={() => onNavigate("reports")} styles={styles} />
          </View>

          <Section title="Track & Reconcile" styles={styles}>
            <View style={styles.ledgerGrid}>
              <LedgerCard label="Open Shifts" value={openShiftCount.toString()} icon={Landmark} color={C.amber.primary} styles={styles} />
              <LedgerCard label="Unreconciled" value={unreconciledShifts.length.toString()} icon={AlertTriangle} color={C.status.warning} styles={styles} />
              <LedgerCard label="To Collect" value={`$${expectedCash.toFixed(2)}`} icon={Banknote} color={C.status.info} styles={styles} />
              <LedgerCard label="Cash Variance" value={`$${cashVariance.toFixed(2)}`} icon={Scale} color={Math.abs(cashVariance) > 0.01 ? C.status.error : C.status.success} styles={styles} />
            </View>
            <TouchableOpacity onPress={() => onNavigate("pos", { openCashCollection: true })} style={styles.cashierLink}>
              <Banknote size={18} color={C.amber.primary} />
              <Text style={styles.cashierLinkText}>Collect cash from a selected cashier using their expected balance</Text>
            </TouchableOpacity>
            {cashBalances.slice(0, 3).map((row) => (
              <View key={row.userId || row.cashierName} style={styles.row}>
                <Text style={styles.rowMain}>{row.cashierName}</Text>
                <Text style={styles.rowValue}>${Number(row.expectedCash || 0).toFixed(2)}</Text>
              </View>
            ))}
          </Section>

          <Section title="Setup Checklist" styles={styles}>
            {checklist.map((item) => (
              <TouchableOpacity key={item.label} onPress={() => onNavigate(item.screen)} style={styles.checkRow}>
                <View style={[styles.checkDot, item.done && { backgroundColor: C.status.success, borderColor: C.status.success }]}>
                  {item.done && <Check size={10} color={C.bg.base} />}
                </View>
                <Text style={[styles.checkText, item.done && { color: C.text.secondary }]}>{item.label}</Text>
                <Text style={styles.checkAction}>{item.done ? "Done" : "Open"}</Text>
              </TouchableOpacity>
            ))}
            <Text style={styles.setupProgress}>Setup {completedSetup} of {checklist.length} complete</Text>
          </Section>

          <Section title="Top Products" styles={styles}>
            {topProducts.length === 0 ? <Text style={styles.emptyText}>No product sales yet.</Text> : topProducts.map((item: any, index: number) => (
              <View key={`${item.productId || item.id || index}`} style={styles.row}>
                <Text style={styles.rowMain}>{item.name || item.productName || "Product"}</Text>
                <Text style={styles.rowValue}>${Number(item.revenue || item.totalRevenue || 0).toFixed(2)}</Text>
              </View>
            ))}
          </Section>

          <Section title="Low Stock" styles={styles}>
            {lowStock.length === 0 ? <Text style={styles.emptyText}>No low stock alerts.</Text> : lowStock.map((item) => (
              <View key={item.productId || item.id} style={styles.row}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <AlertTriangle size={15} color={C.status.warning} />
                  <Text style={styles.rowMain}>{item.name}</Text>
                </View>
                <Text style={styles.rowValue}>{Number(item.stockLevel || 0)}</Text>
              </View>
            ))}
          </Section>

          <Section title="Cashier Performance" styles={styles}>
            <TouchableOpacity onPress={() => onNavigate("cashiers")} style={styles.cashierLink}>
              <Users size={18} color={C.amber.primary} />
              <Text style={styles.cashierLinkText}>Manage cashiers and review sales by cashier in Reports</Text>
            </TouchableOpacity>
          </Section>
        </ScrollView>
      )}
    </View>
  );
}

function MetricCard({ label, value, icon: Icon, color, styles }: any) {
  return (
    <View style={styles.metricCard}>
      <View style={[styles.metricIcon, { backgroundColor: `${color}18` }]}><Icon size={18} color={color} /></View>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function LedgerCard({ label, value, icon: Icon, color, styles }: any) {
  return (
    <View style={styles.ledgerCard}>
      <View style={[styles.ledgerIcon, { backgroundColor: `${color}18` }]}><Icon size={16} color={color} /></View>
      <Text style={styles.ledgerLabel}>{label}</Text>
      <Text style={styles.ledgerValue}>{value}</Text>
    </View>
  );
}

function QuickButton({ label, onPress, styles }: any) {
  return <TouchableOpacity onPress={onPress} style={styles.quickButton}><Text style={styles.quickText}>{label}</Text></TouchableOpacity>;
}

function Section({ title, children, styles }: any) {
  return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text>{children}</View>;
}

const makeStyles = (C: any, insets: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg.base },
  header: { paddingHorizontal: 16, paddingTop: Math.max(insets.top, 12), paddingBottom: 16, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: C.border.default },
  iconBtn: { width: 42, height: 42, borderRadius: 14, backgroundColor: C.bg.card, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.border.default },
  title: { color: C.text.primary, fontSize: 22, fontWeight: "900" },
  subtitle: { color: C.text.secondary, fontSize: 12, fontWeight: "700", marginTop: 2 },
  content: { padding: 16, paddingBottom: 40 },
  storyCard: { backgroundColor: hexAlpha(C.amber.primary, 0.12), borderColor: hexAlpha(C.amber.primary, 0.28), borderWidth: 1, borderRadius: 18, padding: 18, marginBottom: 14 },
  storyText: { color: C.text.primary, fontSize: 17, fontWeight: "900", lineHeight: 24 },
  storySub: { color: C.text.secondary, fontSize: 13, fontWeight: "700", lineHeight: 19, marginTop: 8 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metricCard: { width: "48.5%", backgroundColor: C.bg.card, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: C.border.default },
  metricIcon: { width: 34, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  metricLabel: { color: C.text.secondary, fontSize: 11, fontWeight: "800", textTransform: "uppercase" },
  metricValue: { color: C.text.primary, fontSize: 18, fontWeight: "900", marginTop: 4 },
  ledgerGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  ledgerCard: { width: "48.5%", backgroundColor: C.bg.hover, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: C.border.default },
  ledgerIcon: { width: 30, height: 30, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  ledgerLabel: { color: C.text.secondary, fontSize: 10, fontWeight: "800", textTransform: "uppercase" },
  ledgerValue: { color: C.text.primary, fontSize: 16, fontWeight: "900", marginTop: 3 },
  quickRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginVertical: 16 },
  quickButton: { flexGrow: 1, backgroundColor: C.bg.card, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 14, borderWidth: 1, borderColor: C.border.default, alignItems: "center" },
  quickText: { color: C.amber.primary, fontSize: 12, fontWeight: "900", textTransform: "uppercase" },
  section: { backgroundColor: C.bg.card, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: C.border.default, marginBottom: 14 },
  sectionTitle: { color: C.text.primary, fontSize: 16, fontWeight: "900", marginBottom: 12 },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  checkDot: { width: 18, height: 18, borderRadius: 9, backgroundColor: C.bg.hover, borderWidth: 1, borderColor: C.border.default, alignItems: "center", justifyContent: "center" },
  checkText: { color: C.text.primary, fontSize: 14, fontWeight: "700" },
  checkAction: { color: C.amber.primary, fontSize: 12, fontWeight: "900", marginLeft: "auto", textTransform: "uppercase" },
  setupProgress: { color: C.text.secondary, fontSize: 12, fontWeight: "800", marginTop: 8 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, borderTopWidth: 1, borderTopColor: C.border.default },
  rowMain: { color: C.text.primary, fontSize: 13, fontWeight: "800" },
  rowValue: { color: C.amber.primary, fontSize: 13, fontWeight: "900" },
  emptyText: { color: C.text.secondary, fontSize: 13, fontWeight: "700" },
  cashierLink: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, backgroundColor: hexAlpha(C.amber.primary, 0.08), borderRadius: 14 },
  cashierLinkText: { color: C.text.primary, fontSize: 13, fontWeight: "700", flex: 1 },
});
