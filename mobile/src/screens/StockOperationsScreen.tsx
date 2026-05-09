import React, { useMemo, useState } from "react";
import {
  View, Text, TouchableOpacity, TextInput, StyleSheet, Alert, ScrollView, ActivityIndicator,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Menu, Package, ArrowRightLeft, SlidersHorizontal, ScanLine } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiFetch } from "../lib/api";
import { useBranches, useProducts } from "../hooks/usePosData";
import { useTheme, hexAlpha, Theme } from "../ui/PremiumColors";

interface Props {
  companyId: number;
  onOpenDrawer: () => void;
}

type Mode = "adjust" | "transfer";

export function StockOperationsScreen({ companyId, onOpenDrawer }: Props) {
  const insets = useSafeAreaInsets();
  const { theme: C } = useTheme();
  const styles = getStyles(C);
  const { data: products, refresh } = useProducts(companyId);
  const { data: branches } = useBranches(companyId);
  const [mode, setMode] = useState<Mode>("adjust");
  const [query, setQuery] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [fromBranchId, setFromBranchId] = useState<number | null>(null);
  const [toBranchId, setToBranchId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return (products || [])
      .filter((p: any) =>
        p.isTracked !== false &&
        (p.name?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q) || p.barcode?.toLowerCase().includes(q))
      )
      .slice(0, 8);
  }, [products, query]);

  const resetForm = () => {
    setQuery("");
    setSelectedProduct(null);
    setQuantity("");
    setReason("");
  };

  const submitAdjustment = async () => {
    if (!selectedProduct) return Alert.alert("Product", "Select a product first.");
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty === 0) return Alert.alert("Quantity", "Enter a positive or negative adjustment quantity.");
    if (reason.trim().length < 5) return Alert.alert("Reason", "Enter a clear adjustment reason.");
    setSaving(true);
    try {
      const res = await apiFetch("/api/pos/inventory/adjust", {
        method: "POST",
        headers: { "Idempotency-Key": `stock-adj-${companyId}-${selectedProduct.id}-${Date.now()}` },
        body: JSON.stringify({
          companyId,
          productId: selectedProduct.id,
          quantityChange: qty,
          type: "ADJUSTMENT",
          unitCost: selectedProduct.costPrice || 0,
          notes: reason.trim(),
        }),
      });
      if (!res.ok) throw new Error(await res.text().catch(() => "Failed to post adjustment"));
      await refresh();
      resetForm();
      Alert.alert("Posted", "Stock adjustment posted to the inventory ledger.");
    } catch (error: any) {
      Alert.alert("Error", error.message);
    } finally {
      setSaving(false);
    }
  };

  const submitTransfer = async () => {
    if (!selectedProduct) return Alert.alert("Product", "Select a product first.");
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) return Alert.alert("Quantity", "Enter a positive transfer quantity.");
    if (!fromBranchId || !toBranchId || fromBranchId === toBranchId) return Alert.alert("Branches", "Select different source and destination branches.");
    setSaving(true);
    try {
      const res = await apiFetch(`/api/companies/${companyId}/inventory/transfers`, {
        method: "POST",
        headers: { "Idempotency-Key": `stock-transfer-${companyId}-${selectedProduct.id}-${fromBranchId}-${toBranchId}-${Date.now()}` },
        body: JSON.stringify({
          fromBranchId,
          toBranchId,
          notes: reason.trim() || "Branch stock transfer",
          items: [{ productId: selectedProduct.id, quantity: qty, unitCost: selectedProduct.costPrice || 0 }],
        }),
      });
      if (!res.ok) throw new Error(await res.text().catch(() => "Failed to transfer stock"));
      await refresh();
      resetForm();
      Alert.alert("Transferred", "Branch transfer posted with an audit reference.");
    } catch (error: any) {
      Alert.alert("Error", error.message);
    } finally {
      setSaving(false);
    }
  };

  const submit = mode === "adjust" ? submitAdjustment : submitTransfer;

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) }]}>
        <TouchableOpacity onPress={onOpenDrawer} style={styles.iconBtn}><Menu size={20} color={C.text.primary} /></TouchableOpacity>
        <Text style={styles.title}>Stock Operations</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.modeRow}>
          <TouchableOpacity style={[styles.modeBtn, mode === "adjust" && styles.modeActive]} onPress={() => setMode("adjust")}>
            <SlidersHorizontal size={16} color={mode === "adjust" ? "#000" : C.text.secondary} />
            <Text style={[styles.modeText, mode === "adjust" && styles.modeTextActive]}>Adjust</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.modeBtn, mode === "transfer" && styles.modeActive]} onPress={() => setMode("transfer")}>
            <ArrowRightLeft size={16} color={mode === "transfer" ? "#000" : C.text.secondary} />
            <Text style={[styles.modeText, mode === "transfer" && styles.modeTextActive]}>Transfer</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.label}>Barcode, SKU, or Product Name</Text>
        <View style={styles.inputRow}>
          <ScanLine size={18} color={C.text.secondary} />
          <TextInput
            style={styles.inputInline}
            value={query}
            onChangeText={(value) => { setQuery(value); setSelectedProduct(null); }}
            placeholder="Scan barcode or type SKU..."
            placeholderTextColor={C.text.secondary}
          />
        </View>

        {selectedProduct ? (
          <View style={styles.selectedCard}>
            <Package size={18} color={C.amber.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.selectedTitle}>{selectedProduct.name}</Text>
              <Text style={styles.selectedSub}>SKU {selectedProduct.sku || "-"} · Branch stock {Number(selectedProduct.branchStock ?? selectedProduct.stockLevel ?? 0).toFixed(2)}</Text>
            </View>
          </View>
        ) : matches.map((item: any) => (
          <TouchableOpacity key={item.id} style={styles.matchRow} onPress={() => { setSelectedProduct(item); setQuery(`${item.sku || item.barcode || item.name}`); }}>
            <Text style={styles.matchTitle}>{item.name}</Text>
            <Text style={styles.matchSub}>{item.sku || item.barcode || "No code"}</Text>
          </TouchableOpacity>
        ))}

        {mode === "transfer" && (
          <View style={styles.branchBlock}>
            <Text style={styles.label}>From Branch</Text>
            <View style={styles.chipRow}>
              {(branches || []).map((branch: any) => (
                <TouchableOpacity key={branch.id} style={[styles.chip, fromBranchId === branch.id && styles.chipActive]} onPress={() => setFromBranchId(branch.id)}>
                  <Text style={[styles.chipText, fromBranchId === branch.id && styles.chipTextActive]}>{branch.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.label}>To Branch</Text>
            <View style={styles.chipRow}>
              {(branches || []).map((branch: any) => (
                <TouchableOpacity key={branch.id} style={[styles.chip, toBranchId === branch.id && styles.chipActive]} onPress={() => setToBranchId(branch.id)}>
                  <Text style={[styles.chipText, toBranchId === branch.id && styles.chipTextActive]}>{branch.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        <Text style={styles.label}>{mode === "adjust" ? "Adjustment Quantity" : "Transfer Quantity"}</Text>
        <TextInput style={styles.input} keyboardType="numeric" value={quantity} onChangeText={setQuantity} placeholder={mode === "adjust" ? "e.g. -2 or 5" : "e.g. 5"} placeholderTextColor={C.text.secondary} />
        <Text style={styles.label}>Reason / Reference</Text>
        <TextInput style={[styles.input, styles.notes]} multiline value={reason} onChangeText={setReason} placeholder="Required for adjustments; optional for transfers..." placeholderTextColor={C.text.secondary} />

        <TouchableOpacity style={styles.submitBtn} onPress={submit} disabled={saving}>
          {saving ? <ActivityIndicator color="#000" /> : <Text style={styles.submitText}>{mode === "adjust" ? "Post Adjustment" : "Post Transfer"}</Text>}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const getStyles = (C: Theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg.base },
  header: { paddingHorizontal: 16, paddingVertical: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: C.border.default },
  iconBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.bg.card, alignItems: "center", justifyContent: "center" },
  title: { color: C.text.primary, fontSize: 18, fontWeight: "900" },
  content: { padding: 16, paddingBottom: 90 },
  modeRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  modeBtn: { flex: 1, height: 44, borderRadius: 12, borderWidth: 1, borderColor: C.border.default, backgroundColor: C.bg.card, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  modeActive: { backgroundColor: C.amber.primary, borderColor: C.amber.primary },
  modeText: { color: C.text.secondary, fontSize: 13, fontWeight: "800" },
  modeTextActive: { color: "#000" },
  label: { color: C.text.secondary, fontSize: 12, fontWeight: "800", marginBottom: 7, marginTop: 12 },
  inputRow: { minHeight: 48, borderRadius: 14, backgroundColor: C.bg.card, borderWidth: 1, borderColor: C.border.default, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 10 },
  inputInline: { flex: 1, color: C.text.primary, fontSize: 14, minHeight: 48 },
  input: { minHeight: 48, borderRadius: 14, backgroundColor: C.bg.card, borderWidth: 1, borderColor: C.border.default, color: C.text.primary, paddingHorizontal: 12, fontSize: 14 },
  notes: { height: 82, textAlignVertical: "top", paddingTop: 12 },
  selectedCard: { marginTop: 12, padding: 12, borderRadius: 14, backgroundColor: hexAlpha(C.amber.primary, 0.08), borderWidth: 1, borderColor: hexAlpha(C.amber.primary, 0.22), flexDirection: "row", alignItems: "center", gap: 10 },
  selectedTitle: { color: C.text.primary, fontSize: 14, fontWeight: "900" },
  selectedSub: { color: C.text.secondary, fontSize: 12, marginTop: 3 },
  matchRow: { marginTop: 8, padding: 12, borderRadius: 12, backgroundColor: C.bg.card, borderWidth: 1, borderColor: C.border.default },
  matchTitle: { color: C.text.primary, fontSize: 14, fontWeight: "800" },
  matchSub: { color: C.text.secondary, fontSize: 12, marginTop: 2 },
  branchBlock: { marginTop: 4 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999, backgroundColor: C.bg.card, borderWidth: 1, borderColor: C.border.default },
  chipActive: { backgroundColor: C.amber.primary, borderColor: C.amber.primary },
  chipText: { color: C.text.secondary, fontSize: 12, fontWeight: "800" },
  chipTextActive: { color: "#000" },
  submitBtn: { marginTop: 20, height: 52, borderRadius: 14, backgroundColor: C.amber.primary, alignItems: "center", justifyContent: "center" },
  submitText: { color: "#000", fontSize: 15, fontWeight: "900" },
});
