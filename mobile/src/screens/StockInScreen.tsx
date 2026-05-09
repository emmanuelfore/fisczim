import React, { useState, useCallback } from "react";
import {
  View, Text, TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator, Alert, ScrollView, Modal,
  KeyboardAvoidingView, Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Menu, Search, Package, ChevronDown, Plus, X, Users, Trash2 } from "lucide-react-native";
import { StatusBar } from "expo-status-bar";
import { useProducts, useSuppliers } from "../hooks/usePosData";
import { apiFetch } from "../lib/api";
import { useTheme, hexAlpha } from "../ui/PremiumColors";

interface Props { onOpenDrawer: () => void; onClose?: () => void; companyId: number; }

export function StockInScreen({ onOpenDrawer, onClose, companyId }: Props) {
  const insets = useSafeAreaInsets();
  const { theme: C, isDark } = useTheme();
  
  const { data: products, isLoading } = useProducts(companyId);
  const { data: suppliers, isLoading: loadingSuppliers } = useSuppliers(companyId);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [selectedSupplier, setSelectedSupplier] = useState<any>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [showSupplierPicker, setShowSupplierPicker] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [supplierSearch, setSupplierSearch] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [grvItems, setGrvItems] = useState<any[]>([]);
  const [landedCosts, setLandedCosts] = useState("");
  const [allocationMethod, setAllocationMethod] = useState<"value" | "quantity" | "manual">("value");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [importCompleted, setImportCompleted] = useState(false);

  const filteredSuppliers = (suppliers || []).filter((s: any) => {
    if (s.isActive === false) return false;
    if (!supplierSearch) return true;
    const searchLower = supplierSearch.toLowerCase();
    return s.name?.toLowerCase().includes(searchLower) || s.email?.toLowerCase().includes(searchLower);
  });

  const filteredProducts = (products || []).filter((p: any) => {
    if (p.isActive === false) return false;
    if (!p.isTracked) return false;
    if (!productSearch) return true;
    const searchLower = productSearch.toLowerCase();
    return (p.name?.toLowerCase().includes(searchLower) ?? false) ||
      (p.sku?.toLowerCase().includes(searchLower) ?? false) ||
      (p.barcode?.toLowerCase().includes(searchLower) ?? false);
  });

  const handleSubmit = useCallback(async () => {
    if (importCompleted) return;
    if (grvItems.length === 0) return Alert.alert("Error", "Add at least one product line to the GRV.");

    setSaving(true);
    try {
      const res = await apiFetch(`/api/companies/${companyId}/inventory/batch-stock-in`, {
        method: "POST",
        headers: { "Idempotency-Key": `grv-${companyId}-${Date.now()}` },
        body: JSON.stringify({
          items: grvItems.map((item) => ({
            productId: item.product.id,
            quantity: item.quantity,
            unitCost: item.unitCost,
            landedCost: item.landedCost || 0,
          })),
          supplierId: selectedSupplier?.id,
          landedCosts: Number(landedCosts || 0),
          allocationMethod,
          notes: notes.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(errText || "Failed to record stock in");
      }
      setImportCompleted(true);
      Alert.alert("Success", "Stock imported successfully.", [
        { text: "Close", onPress: () => { if (onClose) onClose(); } }
      ]);
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally { setSaving(false); }
  }, [allocationMethod, grvItems, landedCosts, selectedSupplier, notes, companyId, importCompleted, onClose]);

  const currentStock = Number(selectedProduct?.branchStock ?? selectedProduct?.stockLevel ?? 0);
  const baseTotal = grvItems.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitCost || 0), 0);
  const landedTotal = Number(landedCosts || 0);
  const effectiveLandedTotal = allocationMethod === "manual"
    ? grvItems.reduce((sum, item) => sum + Number(item.landedCost || 0), 0)
    : landedTotal;
  const grvTotal = baseTotal + effectiveLandedTotal;
  const addLine = () => {
    if (!selectedProduct) return Alert.alert("Product", "Select a product first.");
    const qty = parseFloat(quantity);
    if (!qty || qty <= 0) return Alert.alert("Quantity", "Enter a valid quantity.");
    const cost = parseFloat(unitCost);
    if (!Number.isFinite(cost) || cost < 0) return Alert.alert("Unit cost", "Enter a valid unit cost.");
    setGrvItems((items) => [
      ...items,
      { product: selectedProduct, quantity: qty, unitCost: cost, landedCost: 0 },
    ]);
    setSelectedProduct(null);
    setQuantity("");
    setUnitCost("");
  };
  const lineAllocatedCost = (item: any) => {
    if (allocationMethod === "manual") return Number(item.landedCost || 0);
    if (allocationMethod === "quantity") {
      const totalQty = grvItems.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
      return totalQty > 0 ? landedTotal * (Number(item.quantity || 0) / totalQty) : 0;
    }
    return baseTotal > 0 ? landedTotal * ((Number(item.quantity || 0) * Number(item.unitCost || 0)) / baseTotal) : 0;
  };
  const styles = makeStyles(C, isDark, insets);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={{ flex: 1 }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onOpenDrawer} style={styles.iconBtn}><Menu size={20} color={C.text.primary} /></TouchableOpacity>
          <Text style={styles.title}>Create GRV</Text>
          <View style={{ width: 44 }} />
        </View>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
            <Text style={styles.label}>Supplier</Text>
            <TouchableOpacity style={[styles.selector, importCompleted && { opacity: 0.6 }]} onPress={() => !importCompleted && setShowSupplierPicker(true)}>
              {selectedSupplier ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Users size={18} color={C.amber.primary} />
                  <Text style={styles.selectorText} numberOfLines={1}>{selectedSupplier.name}</Text>
                </View>
              ) : (
                <Text style={[styles.selectorText, { color: C.text.secondary }]}>Tap to select supplier (optional)...</Text>
              )}
              <ChevronDown size={18} color={C.text.secondary} />
            </TouchableOpacity>

            <Text style={styles.label}>Add Product Line</Text>
            <TouchableOpacity style={[styles.selector, importCompleted && { opacity: 0.6 }]} onPress={() => !importCompleted && setShowPicker(true)}>
              {selectedProduct ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Package size={18} color={C.amber.primary} />
                  <Text style={styles.selectorText} numberOfLines={1}>{selectedProduct.name} ({selectedProduct.sku})</Text>
                </View>
              ) : (
                <Text style={[styles.selectorText, { color: C.text.secondary }]}>Tap to select product...</Text>
              )}
              <ChevronDown size={18} color={C.text.secondary} />
            </TouchableOpacity>

            <View style={{ flexDirection: "row", gap: 12, marginTop: 4 }}>
               <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Quantity *</Text>
                  <TextInput style={styles.input} keyboardType="numeric" placeholder="0" placeholderTextColor={C.text.secondary} value={quantity} onChangeText={setQuantity} editable={!importCompleted} />
               </View>
               <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Unit Cost *</Text>
                  <TextInput style={styles.input} keyboardType="numeric" placeholder="0.00" placeholderTextColor={C.text.secondary} value={unitCost} onChangeText={setUnitCost} editable={!importCompleted} />
               </View>
            </View>
            <TouchableOpacity style={styles.addLineBtn} onPress={addLine} disabled={importCompleted}>
              <Plus size={18} color={C.amber.primary} />
              <Text style={styles.addLineText}>Add product to GRV</Text>
            </TouchableOpacity>

            <Text style={styles.label}>Landed Costs</Text>
            <TextInput style={styles.input} keyboardType="numeric" placeholder="Transport, duty, handling..." placeholderTextColor={C.text.secondary} value={landedCosts} onChangeText={setLandedCosts} editable={!importCompleted} />
            <View style={styles.methodRow}>
              {(["value", "quantity", "manual"] as const).map((method) => (
                <TouchableOpacity
                  key={method}
                  onPress={() => setAllocationMethod(method)}
                  style={[styles.methodChip, allocationMethod === method && styles.methodChipActive]}
                >
                  <Text style={[styles.methodText, allocationMethod === method && styles.methodTextActive]}>{method}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {allocationMethod === "manual" && grvItems.length > 0 && (
              <Text style={styles.hintText}>Manual allocation uses each line's landed cost value below.</Text>
            )}
            
            <Text style={styles.label}>Notes</Text>
            <TextInput style={[styles.input, { height: 80, textAlignVertical: "top", paddingTop: 12 }]} multiline placeholder="Optional notes..." placeholderTextColor={C.text.secondary} value={notes} onChangeText={setNotes} editable={!importCompleted} />

            {importCompleted && (
              <View style={styles.successBadge}>
                <Text style={styles.successBadgeText}>Import completed successfully.</Text>
              </View>
            )}

            {grvItems.length > 0 ? (
              <View style={styles.summaryCard}>
                <Text style={styles.summaryTitle}>GRV Lines</Text>
                {grvItems.map((item, index) => {
                  const allocated = lineAllocatedCost(item);
                  const effective = (Number(item.quantity) * Number(item.unitCost)) + allocated;
                  return (
                    <View key={`${item.product.id}-${index}`} style={styles.grvLine}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.summaryValue}>{item.product.name}</Text>
                        <Text style={styles.summaryLabel}>{item.quantity} x ${Number(item.unitCost).toFixed(2)} + landed ${allocated.toFixed(2)}</Text>
                        {allocationMethod === "manual" && (
                          <TextInput
                            style={[styles.input, { height: 42, marginTop: 8 }]}
                            keyboardType="numeric"
                            placeholder="Line landed cost"
                            placeholderTextColor={C.text.secondary}
                            value={String(item.landedCost || "")}
                            onChangeText={(value) => setGrvItems((rows) => rows.map((row, i) => i === index ? { ...row, landedCost: Number(value || 0) } : row))}
                          />
                        )}
                      </View>
                      <View style={{ alignItems: "flex-end", gap: 8 }}>
                        <Text style={[styles.summaryValue, { color: C.amber.primary }]}>${effective.toFixed(2)}</Text>
                        <TouchableOpacity onPress={() => setGrvItems((rows) => rows.filter((_, i) => i !== index))}>
                          <Trash2 size={16} color={C.status.error} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
                <View style={styles.summaryDivider} />
                <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Products</Text><Text style={styles.summaryValue}>{grvItems.length}</Text></View>
                <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Product Cost</Text><Text style={styles.summaryValue}>${baseTotal.toFixed(2)}</Text></View>
                <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Landed Cost</Text><Text style={styles.summaryValue}>${effectiveLandedTotal.toFixed(2)}</Text></View>
                <View style={styles.summaryRow}><Text style={[styles.summaryLabel, { fontWeight: "900" }]}>Inventory Value</Text><Text style={[styles.summaryValue, { color: C.amber.primary, fontSize: 16 }]}>${grvTotal.toFixed(2)}</Text></View>
              </View>
            ) : null}
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity style={[styles.submitBtn, importCompleted && styles.submitBtnDisabled]} onPress={handleSubmit} disabled={saving || importCompleted}>
              {saving ? <ActivityIndicator color="#000" /> : (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Plus size={20} color="#000" />
                  <Text style={styles.submitBtnText}>{importCompleted ? "Posted" : "Post GRV"}</Text>
                </View>
              )}
            </TouchableOpacity>
            {importCompleted && !!onClose && (
              <TouchableOpacity style={styles.doneBtn} onPress={onClose}><Text style={styles.doneBtnText}>Close</Text></TouchableOpacity>
            )}
          </View>
        </KeyboardAvoidingView>

        {/* Product Picker Modal */}
        <Modal visible={showPicker} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select Product</Text>
                <TouchableOpacity onPress={() => setShowPicker(false)} style={styles.closeBtn}><X size={20} color={C.text.primary} /></TouchableOpacity>
              </View>
              <View style={styles.searchBar}>
                <Search size={18} color={C.text.secondary} />
                <TextInput style={styles.searchInput} placeholder="Scan barcode, name, or SKU..." placeholderTextColor={C.text.secondary} value={productSearch} onChangeText={setProductSearch} />
              </View>
              {isLoading ? (
                <ActivityIndicator color={C.amber.primary} style={{ padding: 40 }} />
              ) : (
                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  {filteredProducts.map((item: any) => (
                    <TouchableOpacity 
                      key={item.id} 
                      style={[styles.pickerItem, selectedProduct?.id === item.id && styles.pickerItemActive]}
                      onPress={() => { setSelectedProduct(item); setShowPicker(false); setProductSearch(""); setUnitCost(String(item.costPrice || "")); }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.pickerItemText}>{item.name}</Text>
                        <Text style={styles.pickerItemSub}>SKU: {item.sku}</Text>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={styles.pickerStockText}>Branch stock: {Number(item.branchStock ?? item.stockLevel ?? 0)}</Text>
                        <Text style={styles.pickerPriceText}>Cost: ${Number(item.costPrice || 0).toFixed(2)}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                  {filteredProducts.length === 0 && <Text style={styles.emptyText}>No products found.</Text>}
                  <View style={{ height: 60 }} />
                </ScrollView>
              )}
            </View>
          </View>
        </Modal>

        {/* Supplier Picker Modal */}
        <Modal visible={showSupplierPicker} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select Supplier</Text>
                <TouchableOpacity onPress={() => setShowSupplierPicker(false)} style={styles.closeBtn}><X size={20} color={C.text.primary} /></TouchableOpacity>
              </View>
              <View style={styles.searchBar}>
                <Search size={18} color={C.text.secondary} />
                <TextInput style={styles.searchInput} placeholder="Search suppliers..." placeholderTextColor={C.text.secondary} value={supplierSearch} onChangeText={setSupplierSearch} />
              </View>
              {loadingSuppliers ? (
                <ActivityIndicator color={C.amber.primary} style={{ padding: 40 }} />
              ) : (
                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  {filteredSuppliers.map((item: any) => (
                    <TouchableOpacity 
                      key={item.id} 
                      style={[styles.pickerItem, selectedSupplier?.id === item.id && styles.pickerItemActive]}
                      onPress={() => { setSelectedSupplier(item); setShowSupplierPicker(false); setSupplierSearch(""); }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.pickerItemText}>{item.name}</Text>
                        <Text style={styles.pickerItemSub}>{item.email || "No email"}</Text>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={styles.pickerItemSub}>{item.phone || ""}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                  {filteredSuppliers.length === 0 && <Text style={styles.emptyText}>No suppliers found.</Text>}
                  <View style={{ height: 60 }} />
                </ScrollView>
              )}
            </View>
          </View>
        </Modal>
      </View>
    </View>
  );
}

const makeStyles = (C: any, isDark: boolean, insets: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg.base },
  header: { paddingHorizontal: 16, paddingTop: Math.max(insets.top, 12), paddingBottom: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: C.bg.base, borderBottomWidth: 1, borderBottomColor: C.bg.glassBorder },
  iconBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: C.bg.panel, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4, borderWidth: 1, borderColor: C.bg.glassBorder },
  title: { color: C.text.primary, fontSize: 18, fontWeight: "900", letterSpacing: -0.5 },
  label: { color: C.text.primary, fontSize: 13, fontWeight: "700", marginBottom: 10, marginTop: 18, opacity: 0.6 },
  input: { backgroundColor: C.bg.panel, color: C.text.primary, borderRadius: 14, paddingHorizontal: 16, height: 52, borderWidth: 1.5, borderColor: C.bg.glassBorder, fontSize: 15, fontWeight: "600" },
  selector: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: C.bg.panel, borderRadius: 16, paddingHorizontal: 16, height: 56, borderWidth: 1.5, borderColor: C.bg.glassBorder },
  selectorText: { color: C.text.primary, fontSize: 15, flex: 1, fontWeight: "600" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.8)", justifyContent: "flex-end" },
  modalContent: { backgroundColor: C.bg.base, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, height: "88%", borderTopWidth: 1, borderColor: C.bg.glassBorder },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  modalTitle: { color: C.text.primary, fontSize: 22, fontWeight: "900", letterSpacing: -0.5 },
  closeBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.bg.panel, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.bg.glassBorder },
  searchBar: { flexDirection: "row", alignItems: "center", backgroundColor: C.bg.panel, borderRadius: 16, paddingHorizontal: 14, height: 50, borderWidth: 1, borderColor: C.bg.glassBorder, gap: 10, marginBottom: 16 },
  searchInput: { flex: 1, color: C.text.primary, fontSize: 15, fontWeight: "600" },
  pickerItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: C.bg.glassBorder },
  pickerItemActive: { backgroundColor: hexAlpha(C.amber.primary, 0.08) },
  pickerItemText: { color: C.text.primary, fontSize: 15, fontWeight: "700" },
  pickerItemSub: { color: C.text.secondary, fontSize: 12, marginTop: 2, fontWeight: "600" },
  pickerStockText: { color: C.amber.primary, fontSize: 13, fontWeight: "800" },
  pickerPriceText: { color: C.text.secondary, fontSize: 12, marginTop: 2, fontWeight: "600" },
  emptyText: { color: C.text.secondary, textAlign: "center", marginTop: 40, fontSize: 14, fontWeight: "600" },
  summaryCard: { backgroundColor: C.bg.panel, borderRadius: 24, padding: 20, borderWidth: 1, borderColor: C.bg.glassBorder, marginTop: 24, shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
  summaryTitle: { color: C.text.primary, fontWeight: "900", fontSize: 16, marginBottom: 16, letterSpacing: -0.2 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  summaryLabel: { color: C.text.secondary, fontSize: 14, fontWeight: "600" },
  summaryValue: { color: C.text.primary, fontSize: 14, fontWeight: "700" },
  summaryDivider: { height: 1, backgroundColor: C.bg.glassBorder, marginVertical: 10 },
  successBadge: { marginTop: 16, backgroundColor: hexAlpha(C.status.success, 0.08), borderWidth: 1, borderColor: hexAlpha(C.status.success, 0.2), padding: 14, borderRadius: 12 },
  successBadgeText: { color: C.status.success, fontSize: 13, fontWeight: "800", textAlign: "center" },
  addLineBtn: { marginTop: 14, height: 48, borderRadius: 14, borderWidth: 1, borderColor: C.amber.primary, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, backgroundColor: hexAlpha(C.amber.primary, 0.08) },
  addLineText: { color: C.amber.primary, fontWeight: "900", fontSize: 13, textTransform: "uppercase" },
  methodRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  methodChip: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 12, backgroundColor: C.bg.panel, borderWidth: 1, borderColor: C.bg.glassBorder },
  methodChipActive: { borderColor: C.amber.primary, backgroundColor: hexAlpha(C.amber.primary, 0.12) },
  methodText: { color: C.text.secondary, fontSize: 11, fontWeight: "900", textTransform: "uppercase" },
  methodTextActive: { color: C.amber.primary },
  hintText: { color: C.text.secondary, fontSize: 12, fontWeight: "600", marginTop: 8 },
  grvLine: { flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.bg.glassBorder },
  footer: { paddingHorizontal: 20, paddingBottom: Math.max(insets.bottom, 20), paddingTop: 16, borderTopWidth: 1, borderTopColor: C.bg.glassBorder },
  submitBtn: { backgroundColor: C.amber.primary, borderRadius: 16, paddingVertical: 18, alignItems: "center", shadowColor: C.amber.primary, shadowOpacity: 0.35, shadowRadius: 15, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: "#000", fontWeight: "900", fontSize: 16, letterSpacing: 0.5 },
  doneBtn: { marginTop: 12, backgroundColor: C.bg.panel, borderRadius: 16, paddingVertical: 15, alignItems: "center", borderWidth: 1, borderColor: C.bg.glassBorder },
  doneBtnText: { color: C.text.primary, fontWeight: "800", fontSize: 14 },
});
