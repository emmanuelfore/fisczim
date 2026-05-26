import React, { useMemo, useState } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView, ActivityIndicator,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Menu, Package, ArrowRightLeft, SlidersHorizontal, ScanLine } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiFetch } from "../lib/api";
import { useBranches, useProducts } from "../hooks/usePosData";
import { useTheme, hexAlpha, Theme } from "../ui/PremiumColors";
import { DoneTextInput as TextInput } from "../ui/DoneTextInput";

interface Props {
  companyId: number;
  onOpenDrawer: () => void;
}

type Mode = "adjust" | "transfer";
type AdjustmentItem = {
  productId: number;
  name: string;
  sku?: string | null;
  systemQuantity: number;
  actualQuantity: string;
  costPrice?: string | number;
};

export function StockOperationsScreen({ companyId, onOpenDrawer }: Props) {
  const insets = useSafeAreaInsets();
  const { theme: C } = useTheme();
  const styles = getStyles(C);
  const { data: products, refresh } = useProducts(companyId);
  const { data: branches } = useBranches(companyId);
  const [mode, setMode] = useState<Mode>("adjust");
  const [query, setQuery] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [adjustmentItems, setAdjustmentItems] = useState<AdjustmentItem[]>([]);
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [fromBranchId, setFromBranchId] = useState<number | null>(null);
  const [toBranchId, setToBranchId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (products || [])
      .filter((p: any) =>
        p.isTracked !== false &&
        (!q || p.name?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q) || p.barcode?.toLowerCase().includes(q))
      )
      .slice(0, 30);
  }, [products, query]);

  const resetForm = () => {
    setQuery("");
    setSelectedProduct(null);
    setAdjustmentItems([]);
    setQuantity("");
    setReason("");
  };

  const systemQuantity = Number(selectedProduct?.branchStock ?? selectedProduct?.stockLevel ?? 0);
  const enteredQuantity = Number(quantity);
  const adjustmentDelta = quantity.trim() && Number.isFinite(enteredQuantity) ? enteredQuantity - systemQuantity : null;

  const submitAdjustment = async () => {
    if (adjustmentItems.length === 0) return Alert.alert("Products", "Select one or more products first.");
    if (reason.trim().length < 5) return Alert.alert("Reason", "Enter a clear adjustment reason.");
    const changes = adjustmentItems.map((item) => {
      const actualQty = Number(item.actualQuantity);
      const quantityChange = actualQty - item.systemQuantity;
      return { ...item, actualQty, quantityChange };
    }).filter((item) => Number.isFinite(item.actualQty) && item.actualQty >= 0 && item.quantityChange !== 0);
    if (changes.length === 0) return Alert.alert("No Changes", "Enter actual quantities that differ from system quantities.");
    setSaving(true);
    try {
      for (const item of changes) {
        const res = await apiFetch("/api/pos/inventory/adjust", {
          method: "POST",
          headers: { "Idempotency-Key": `stock-adj-${companyId}-${item.productId}-${Date.now()}` },
          body: JSON.stringify({
            companyId,
            productId: item.productId,
            quantityChange: item.quantityChange,
            type: "ADJUSTMENT",
            unitCost: item.costPrice || 0,
            notes: `${reason.trim()} (System: ${item.systemQuantity}, Actual: ${item.actualQty})`,
          }),
        });
        if (!res.ok) throw new Error(await res.text().catch(() => "Failed to post adjustment"));
      }
      await refresh();
      resetForm();
      Alert.alert("Posted", `${changes.length} stock adjustment${changes.length === 1 ? "" : "s"} posted to the inventory ledger.`);
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

  const addAdjustmentItem = (product: any) => {
    if (adjustmentItems.some((item) => item.productId === product.id)) return;
    const current = Number(product.branchStock ?? product.stockLevel ?? 0);
    setAdjustmentItems([
      {
        productId: product.id,
        name: product.name,
        sku: product.sku,
        systemQuantity: current,
        actualQuantity: current.toString(),
        costPrice: product.costPrice || 0,
      },
      ...adjustmentItems,
    ]);
  };

  const removeAdjustmentItem = (productId: number) => {
    setAdjustmentItems(adjustmentItems.filter((item) => item.productId !== productId));
  };

  const updateAdjustmentActual = (productId: number, actualQuantity: string) => {
    setAdjustmentItems(adjustmentItems.map((item) => item.productId === productId ? { ...item, actualQuantity } : item));
  };

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

        {mode === "adjust" && adjustmentItems.length > 0 ? (
          <View style={styles.adjustList}>
            {adjustmentItems.map((item) => {
              const actual = Number(item.actualQuantity);
              const delta = Number.isFinite(actual) ? actual - item.systemQuantity : null;
              return (
                <View key={item.productId} style={styles.adjustCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.selectedTitle}>{item.name}</Text>
                    <Text style={styles.selectedSub}>SKU {item.sku || "-"} - System qty {item.systemQuantity.toFixed(2)}</Text>
                    <Text style={styles.diffText}>
                      Ledger change: {delta === null ? "-" : `${delta > 0 ? "+" : ""}${delta.toFixed(2)}`}
                    </Text>
                  </View>
                  <TextInput
                    style={styles.adjustQtyInput}
                    keyboardType="numeric"
                    value={item.actualQuantity}
                    onChangeText={(value) => updateAdjustmentActual(item.productId, value)}
                    placeholder={item.systemQuantity.toFixed(2)}
                    placeholderTextColor={C.text.secondary}
                  />
                  <TouchableOpacity onPress={() => removeAdjustmentItem(item.productId)} style={styles.removeBtn}>
                    <Text style={styles.removeBtnText}>x</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
            {matches
              .filter((item: any) => !adjustmentItems.some((selected) => selected.productId === item.id))
              .map((item: any) => (
                <TouchableOpacity key={item.id} style={styles.matchRow} onPress={() => addAdjustmentItem(item)}>
                  <Text style={styles.matchTitle}>{item.name}</Text>
                  <Text style={styles.matchSub}>{item.sku || item.barcode || "No code"} - Stock {Number(item.branchStock ?? item.stockLevel ?? 0).toFixed(2)}</Text>
                </TouchableOpacity>
              ))}
          </View>
        ) : selectedProduct && mode === "transfer" ? (
          <View style={styles.selectedCard}>
            <Package size={18} color={C.amber.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.selectedTitle}>{selectedProduct.name}</Text>
              <Text style={styles.selectedSub}>SKU {selectedProduct.sku || "-"} - System qty {systemQuantity.toFixed(2)}</Text>
            </View>
          </View>
        ) : matches.map((item: any) => (
          <TouchableOpacity
            key={item.id}
            style={styles.matchRow}
            onPress={() => {
              if (mode === "adjust") {
                addAdjustmentItem(item);
                setQuery("");
              } else {
                setSelectedProduct(item);
                setQuery(`${item.sku || item.barcode || item.name}`);
              }
            }}
          >
            <Text style={styles.matchTitle}>{item.name}</Text>
            <Text style={styles.matchSub}>{item.sku || item.barcode || "No code"} - Stock {Number(item.branchStock ?? item.stockLevel ?? 0).toFixed(2)}</Text>
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

        {mode === "transfer" && (
          <>
            <Text style={styles.label}>Transfer Quantity</Text>
            <TextInput style={styles.input} keyboardType="numeric" value={quantity} onChangeText={setQuantity} placeholder="e.g. 5" placeholderTextColor={C.text.secondary} />
          </>
        )}
        {mode === "adjust" && selectedProduct && adjustmentItems.length === 0 && (
          <Text style={styles.diffText}>
            Ledger change: {adjustmentDelta === null ? "-" : `${adjustmentDelta > 0 ? "+" : ""}${adjustmentDelta.toFixed(2)}`}
          </Text>
        )}
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
  adjustList: { marginTop: 12, gap: 10 },
  adjustCard: { padding: 12, borderRadius: 14, backgroundColor: hexAlpha(C.amber.primary, 0.08), borderWidth: 1, borderColor: hexAlpha(C.amber.primary, 0.22), flexDirection: "row", alignItems: "center", gap: 10 },
  adjustQtyInput: { width: 82, minHeight: 42, borderRadius: 12, backgroundColor: C.bg.card, borderWidth: 1, borderColor: C.border.default, color: C.text.primary, paddingHorizontal: 10, fontSize: 14, fontWeight: "900", textAlign: "center" },
  removeBtn: { width: 30, height: 30, borderRadius: 10, backgroundColor: hexAlpha(C.status.error, 0.12), alignItems: "center", justifyContent: "center" },
  removeBtnText: { color: C.status.error, fontSize: 16, fontWeight: "900" },
  selectedTitle: { color: C.text.primary, fontSize: 14, fontWeight: "900" },
  selectedSub: { color: C.text.secondary, fontSize: 12, marginTop: 3 },
  diffText: { color: C.text.secondary, fontSize: 12, fontWeight: "800", marginTop: 8 },
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
