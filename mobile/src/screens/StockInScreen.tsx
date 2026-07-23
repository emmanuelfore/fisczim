import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import {
  View, Text, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, ScrollView, Modal,
  KeyboardAvoidingView, Platform, FlatList, Switch,
  TextInput as RNTextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Menu, Search, Package, ChevronDown, Plus, X, Users, Trash2, ClipboardList, CheckCircle2, Clock } from "lucide-react-native";
import { StatusBar } from "expo-status-bar";
import { useProducts, useSuppliers } from "../hooks/usePosData";
import { apiFetch } from "../lib/api";
import { useTheme, hexAlpha } from "../ui/PremiumColors";
import { DoneTextInput as TextInput } from "../ui/DoneTextInput";

interface Props { onOpenDrawer: () => void; onClose?: () => void; companyId: number; userRole?: string; userName?: string; }

const PRODUCT_SEARCH_LIMIT = 60;

const generateDraftGrvNumber = () => {
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `GRV-${stamp}-${suffix}`;
};

const generateDraftGdnNumber = () => {
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `GDN-${stamp}-${suffix}`;
};

async function readApiJson<T = any>(res: Response, fallbackMessage: string): Promise<T> {
  const text = await res.text();
  const trimmed = text.trim();

  if (trimmed.startsWith("<")) {
    throw new Error(`${fallbackMessage}. The server returned HTML instead of JSON, so the GDN API route may not be deployed or the API URL may be wrong.`);
  }

  if (!res.ok) {
    try {
      const parsed = text ? JSON.parse(text) : {};
      throw new Error(parsed?.message || fallbackMessage);
    } catch (error: any) {
      if (error?.message && !error.message.startsWith("Unexpected")) throw error;
      throw new Error(text || fallbackMessage);
    }
  }

  try {
    return (text ? JSON.parse(text) : null) as T;
  } catch {
    throw new Error(`${fallbackMessage}. The server returned an invalid JSON response.`);
  }
}

type ReceiveMode = "gdn" | "pending" | "grv";

export function StockInScreen({ onOpenDrawer, onClose, companyId, userRole = "member", userName = "" }: Props) {
  const insets = useSafeAreaInsets();
  const { theme: C, isDark } = useTheme();
  const quantityInputRef = useRef<RNTextInput>(null);
  
  const { data: products, isLoading, refresh: refreshProducts } = useProducts(companyId);
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
  const [grvNumber, setGrvNumber] = useState(generateDraftGrvNumber);
  const [gdnNumber, setGdnNumber] = useState(generateDraftGdnNumber);
  const [addNextEnabled, setAddNextEnabled] = useState(true);
  const [postedGrvNumber, setPostedGrvNumber] = useState("");
  const [postedGdnNumber, setPostedGdnNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [importCompleted, setImportCompleted] = useState(false);
  const isAdmin = ["owner", "admin", "superadmin"].includes(String(userRole || "").toLowerCase()) || userName === "Super Admin";
  const [mode, setMode] = useState<ReceiveMode>(isAdmin ? "pending" : "grv");
  const [pendingGdns, setPendingGdns] = useState<any[]>([]);
  const [loadingGdns, setLoadingGdns] = useState(false);
  const [confirmingGdn, setConfirmingGdn] = useState<any | null>(null);
  const isGdnMode = mode === "gdn";
  const isPendingMode = mode === "pending";
  const isConfirmingGdn = mode === "grv" && !!confirmingGdn;
  const hasDraftLineEntry = !importCompleted && !!selectedProduct && quantity.trim().length > 0;

  useEffect(() => {
    if (!isAdmin && mode !== "grv") setMode("grv");
  }, [isAdmin, mode]);

  const loadPendingGdns = useCallback(async () => {
    if (!isAdmin) return;
    setLoadingGdns(true);
    try {
      const res = await apiFetch(`/api/companies/${companyId}/gdns?status=PENDING`);
      const data = await readApiJson<any[]>(res, "Failed to load pending GDNs");
      setPendingGdns(Array.isArray(data) ? data : []);
    } catch (e: any) {
      Alert.alert("Pending GDNs", e.message || "Could not load pending GDNs.");
    } finally {
      setLoadingGdns(false);
    }
  }, [companyId, isAdmin]);

  useEffect(() => {
    if (mode === "pending") loadPendingGdns();
  }, [loadPendingGdns, mode]);

  const filteredSuppliers = (suppliers || []).filter((s: any) => {
    if (s.isActive === false) return false;
    if (!supplierSearch) return true;
    const searchLower = supplierSearch.toLowerCase();
    return s.name?.toLowerCase().includes(searchLower) || s.email?.toLowerCase().includes(searchLower);
  });

  const grvProductIds = useMemo(
    () => new Set(grvItems.map((item) => item.product.id)),
    [grvItems]
  );

  const searchableProducts = useMemo(() => {
    return (products || [])
      .filter((p: any) => p?.isActive !== false && p?.isTracked !== false)
      .map((p: any) => ({
        ...p,
        _search: `${p.name || ""} ${p.sku || ""} ${p.barcode || ""}`.toLowerCase(),
      }));
  }, [products]);

  const productMatches = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    const matches: any[] = [];

    for (const product of searchableProducts) {
      if (grvProductIds.has(product.id)) continue;
      const exactCode = q && (product.sku?.toLowerCase() === q || product.barcode?.toLowerCase() === q);
      if (!q || exactCode || product._search.includes(q)) {
        matches.push(product);
        if (matches.length >= PRODUCT_SEARCH_LIMIT) break;
      }
    }

    return matches;
  }, [grvProductIds, productSearch, searchableProducts]);

  const selectProduct = (product: any) => {
    setSelectedProduct(product);
    setShowPicker(false);
    setProductSearch("");
    setUnitCost(String(product.costPrice || ""));
    setTimeout(() => quantityInputRef.current?.focus(), 150);
  };

  const handleSubmit = useCallback(async () => {
    if (importCompleted) return;
    if (!selectedSupplier) return Alert.alert("Error", "Please select a supplier.");
    if (grvItems.length === 0) return Alert.alert("Error", `Add at least one product line to the ${isGdnMode ? "GDN" : "GRV"}.`);
    if (isGdnMode) {
      const cleanGdnNumber = gdnNumber.trim();
      if (!cleanGdnNumber) return Alert.alert("GDN Number", "Enter a GDN number.");

      setSaving(true);
      try {
        const res = await apiFetch(`/api/companies/${companyId}/gdns`, {
          method: "POST",
          body: JSON.stringify({
            gdnNumber: cleanGdnNumber,
            supplierId: selectedSupplier?.id,
            notes: notes.trim() || undefined,
            items: grvItems.map((item) => ({
              productId: item.product.id,
              quantity: item.quantity,
            })),
          }),
        });
        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          throw new Error(errText || "Failed to record GDN");
        }
        setPostedGdnNumber(cleanGdnNumber);
        setImportCompleted(true);
        Alert.alert("GDN Recorded", `Delivery note ${cleanGdnNumber} was saved for admin confirmation. Stock has not been posted yet.`, [
          { text: "Close", onPress: () => { if (onClose) onClose(); } }
        ]);
      } catch (e: any) {
        Alert.alert("Error", e.message);
      } finally { setSaving(false); }
      return;
    }

    const cleanGrvNumber = grvNumber.trim();
    if (!cleanGrvNumber) return Alert.alert("GRV Number", "Enter a GRV number.");

    setSaving(true);
    try {
      const endpoint = isConfirmingGdn
        ? `/api/companies/${companyId}/gdns/${confirmingGdn.id}/confirm`
        : `/api/companies/${companyId}/inventory/batch-stock-in`;
      const res = await apiFetch(endpoint, {
        method: "POST",
        headers: isConfirmingGdn ? undefined : { "Idempotency-Key": `grv-${companyId}-${Date.now()}` },
        body: JSON.stringify({
          items: grvItems.map((item) => ({
            productId: item.product.id,
            quantity: item.quantity,
            unitCost: item.unitCost,
            landedCost: item.landedCost || 0,
          })),
          supplierId: selectedSupplier?.id,
          grvNumber: cleanGrvNumber,
          landedCosts: Number(landedCosts || 0),
          allocationMethod,
          notes: notes.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(errText || "Failed to record stock in");
      }
      const result = await readApiJson<any>(res, "Failed to record stock in").catch(() => ({}));
      const finalGrvNumber = result?.grvNumber || cleanGrvNumber;
      setPostedGrvNumber(finalGrvNumber);
      setImportCompleted(true);
      await refreshProducts?.();
      Alert.alert("GRV Recorded", `Goods received voucher ${finalGrvNumber} was posted with ${grvItems.length} line${grvItems.length === 1 ? "" : "s"}.`, [
        { text: "Close", onPress: () => { if (onClose) onClose(); } }
      ]);
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally { setSaving(false); }
  }, [allocationMethod, confirmingGdn, grvItems, grvNumber, gdnNumber, landedCosts, selectedSupplier, notes, companyId, importCompleted, isConfirmingGdn, isGdnMode, onClose, refreshProducts]);

  const currentStock = Number(selectedProduct?.branchStock ?? selectedProduct?.stockLevel ?? 0);
  const baseTotal = grvItems.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitCost || 0), 0);
  const landedTotal = Number(landedCosts || 0);
  const effectiveLandedTotal = allocationMethod === "manual"
    ? grvItems.reduce((sum, item) => sum + Number(item.landedCost || 0), 0)
    : landedTotal;
  const grvTotal = baseTotal + effectiveLandedTotal;
  const addLine = () => {
    if (!selectedProduct) return Alert.alert("Product", "Select a product first.");
    if (grvProductIds.has(selectedProduct.id)) return Alert.alert("Product already added", `This product is already on the ${isGdnMode ? "GDN" : "GRV"}. Remove the existing line first if you need to replace it.`);
    const qty = parseFloat(quantity);
    if (!qty || qty <= 0) return Alert.alert("Quantity", "Enter a valid quantity.");
    const cost = isGdnMode ? 0 : parseFloat(unitCost);
    if (!isGdnMode && (!Number.isFinite(cost) || cost < 0)) return Alert.alert("Unit cost", "Enter a valid unit cost.");
    setGrvItems((items) => [
      ...items,
      { product: selectedProduct, quantity: qty, unitCost: cost, landedCost: 0 },
    ]);
    setSelectedProduct(null);
    setQuantity("");
    setUnitCost("");
    if (isGdnMode && addNextEnabled) {
      setTimeout(() => setShowPicker(true), 150);
    }
  };

  const editLine = (index: number) => {
    if (importCompleted) return;
    const item = grvItems[index];
    if (!item) return;
    setSelectedProduct(item.product);
    setQuantity(String(item.quantity || ""));
    setUnitCost(String(item.unitCost || ""));
    setGrvItems((rows) => rows.filter((_, i) => i !== index));
    setTimeout(() => quantityInputRef.current?.focus(), 150);
  };
  const lineAllocatedCost = (item: any) => {
    if (allocationMethod === "manual") return Number(item.landedCost || 0);
    if (allocationMethod === "quantity") {
      const totalQty = grvItems.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
      return totalQty > 0 ? landedTotal * (Number(item.quantity || 0) / totalQty) : 0;
    }
    return baseTotal > 0 ? landedTotal * ((Number(item.quantity || 0) * Number(item.unitCost || 0)) / baseTotal) : 0;
  };
  const startNewGrv = () => {
    setSelectedProduct(null);
    setSelectedSupplier(null);
    setQuantity("");
    setUnitCost("");
    setGrvItems([]);
    setLandedCosts("");
    setAllocationMethod("value");
    setNotes("");
    setPostedGrvNumber("");
    setPostedGdnNumber("");
    setGrvNumber(generateDraftGrvNumber());
    setGdnNumber(generateDraftGdnNumber());
    setConfirmingGdn(null);
    setImportCompleted(false);
  };
  const beginConfirmGdn = (gdn: any) => {
    const supplier = (suppliers || []).find((item: any) => item.id === gdn.supplierId) || (gdn.supplierId ? { id: gdn.supplierId, name: gdn.supplierName } : null);
    setConfirmingGdn(gdn);
    setSelectedSupplier(supplier);
    setNotes(gdn.notes || `Confirmed from GDN ${gdn.gdnNumber}`);
    setGrvNumber(generateDraftGrvNumber());
    setLandedCosts("");
    setAllocationMethod("value");
    setPostedGrvNumber("");
    setImportCompleted(false);
    setSelectedProduct(null);
    setQuantity("");
    setUnitCost("");
    setGrvItems((gdn.items || []).map((item: any) => {
      const product = (products || []).find((p: any) => p.id === item.productId) || {
        id: item.productId,
        name: item.productName,
        sku: item.sku,
        costPrice: item.costPrice,
      };
      return {
        product,
        quantity: Number(item.quantityReceived || 0),
        unitCost: Number(product?.costPrice ?? item.costPrice ?? 0),
        landedCost: 0,
      };
    }));
    setMode("grv");
  };
  const styles = makeStyles(C, isDark, insets);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={{ flex: 1 }}>
        <View style={styles.header}>
          <Text style={styles.title}>{isGdnMode ? "Create GDN" : isPendingMode ? "Pending GDNs" : isConfirmingGdn ? "Confirm GDN" : "Create GRV"}</Text>
          <View style={{ width: 44 }} />
        </View>
        <View style={styles.modeTabs}>
          {isAdmin && (
            <TouchableOpacity style={[styles.modeTab, mode === "pending" && styles.modeTabActive]} onPress={() => { startNewGrv(); setMode("pending"); }}>
              <Clock size={16} color={mode === "pending" ? C.amber.primary : C.text.secondary} />
              <Text style={[styles.modeTabText, mode === "pending" && styles.modeTabTextActive]}>Pending</Text>
            </TouchableOpacity>
          )}
          {isAdmin && (
            <TouchableOpacity style={[styles.modeTab, mode === "grv" && !confirmingGdn && styles.modeTabActive]} onPress={() => { startNewGrv(); setMode("grv"); }}>
              <CheckCircle2 size={16} color={mode === "grv" && !confirmingGdn ? C.amber.primary : C.text.secondary} />
              <Text style={[styles.modeTabText, mode === "grv" && !confirmingGdn && styles.modeTabTextActive]}>GRV</Text>
            </TouchableOpacity>
          )}
        </View>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
          {isPendingMode ? (
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
            <TouchableOpacity style={styles.addLineBtn} onPress={loadPendingGdns}>
              <Search size={18} color={C.amber.primary} />
              <Text style={styles.addLineText}>Refresh pending GDNs</Text>
            </TouchableOpacity>
            {loadingGdns ? (
              <ActivityIndicator color={C.amber.primary} style={{ padding: 40 }} />
            ) : pendingGdns.length > 0 ? (
              pendingGdns.map((gdn) => (
                <TouchableOpacity key={gdn.id} style={styles.pendingCard} onPress={() => beginConfirmGdn(gdn)}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.summaryTitle}>{gdn.gdnNumber}</Text>
                    <Text style={styles.summaryLabel}>{gdn.supplierName || "N/A"} - {gdn.lineCount} line{gdn.lineCount === 1 ? "" : "s"} - Qty {Number(gdn.totalQuantity || 0)}</Text>
                    {!!gdn.notes && <Text style={[styles.summaryLabel, { marginTop: 6 }]} numberOfLines={2}>{gdn.notes}</Text>}
                  </View>
                  <ChevronDown size={18} color={C.text.secondary} />
                </TouchableOpacity>
              ))
            ) : (
              <View style={styles.summaryCard}>
                <Text style={styles.summaryTitle}>No pending GDNs</Text>
                <Text style={styles.summaryLabel}>Cashier delivery notes waiting for admin confirmation will appear here.</Text>
              </View>
            )}
          </ScrollView>
          ) : (
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
            {isConfirmingGdn && (
              <View style={styles.successBadge}>
                <Text style={styles.successBadgeText}>Confirming GDN {confirmingGdn.gdnNumber}. Enter costs, then post stock.</Text>
              </View>
            )}
            {isGdnMode ? (
              <View style={styles.quickCard}>
                <View style={styles.quickHeaderRow}>
                  <View>
                    <Text style={styles.quickTitle}>Fast GDN Entry</Text>
                    <Text style={styles.quickSub}>{grvItems.length} line{grvItems.length === 1 ? "" : "s"} ready</Text>
                  </View>
                  <Text style={styles.quickStatus}>Pending stock</Text>
                </View>
                <View style={styles.quickToggleRow}>
                  <Text style={styles.quickToggleText}>Add & Next</Text>
                  <Switch
                    value={addNextEnabled}
                    onValueChange={setAddNextEnabled}
                    trackColor={{ false: hexAlpha(C.text.secondary, 0.25), true: hexAlpha(C.amber.primary, 0.35) }}
                    thumbColor={addNextEnabled ? C.amber.primary : C.text.secondary}
                  />
                </View>

                <View style={styles.compactRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.compactLabel}>GDN No.</Text>
                    <TextInput
                      style={styles.compactInput}
                      placeholder="GDN number"
                      placeholderTextColor={C.text.secondary}
                      value={gdnNumber}
                      onChangeText={setGdnNumber}
                      autoCapitalize="characters"
                      editable={!importCompleted}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.compactLabel}>Supplier *</Text>
                    <TouchableOpacity style={[styles.compactSelector, importCompleted && { opacity: 0.6 }]} onPress={() => !importCompleted && setShowSupplierPicker(true)}>
                      <Text style={[styles.compactSelectorText, !selectedSupplier && { color: C.text.secondary }]} numberOfLines={1}>
                        {selectedSupplier?.name || "Select Supplier"}
                      </Text>
                      <ChevronDown size={16} color={C.text.secondary} />
                    </TouchableOpacity>
                  </View>
                </View>

                <Text style={styles.compactLabel}>Product</Text>
                <TouchableOpacity style={[styles.selectorCompact, importCompleted && { opacity: 0.6 }]} onPress={() => !importCompleted && setShowPicker(true)}>
                  {selectedProduct ? (
                    <View style={{ flex: 1 }}>
                      <Text style={styles.selectorText} numberOfLines={1}>{selectedProduct.name}</Text>
                      <Text style={styles.compactMeta} numberOfLines={1}>SKU {selectedProduct.sku || "-"} | Stock {currentStock}</Text>
                    </View>
                  ) : (
                    <Text style={[styles.selectorText, { color: C.text.secondary }]}>Tap to select product</Text>
                  )}
                  <ChevronDown size={18} color={C.text.secondary} />
                </TouchableOpacity>

                <View style={styles.quickLineRow}>
                  <TextInput
                    ref={quantityInputRef}
                    style={[styles.compactInput, { flex: 1 }]}
                    keyboardType="numeric"
                    placeholder="Qty"
                    placeholderTextColor={C.text.secondary}
                    value={quantity}
                    onChangeText={setQuantity}
                    editable={!importCompleted}
                  />
                  <TouchableOpacity style={styles.quickAddBtn} onPress={addLine} disabled={importCompleted}>
                    <Plus size={18} color="#000" />
                    <Text style={styles.quickAddText}>Add</Text>
                  </TouchableOpacity>
                </View>

                <TextInput
                  style={styles.compactNotes}
                  multiline
                  placeholder="Optional notes"
                  placeholderTextColor={C.text.secondary}
                  value={notes}
                  onChangeText={setNotes}
                  editable={!importCompleted}
                />
                {hasDraftLineEntry && (
                  <Text style={styles.draftWarning}>Add the current line before saving the GDN.</Text>
                )}
              </View>
            ) : (
            <>
            <Text style={styles.label}>GRV Number *</Text>
            <TextInput
              style={styles.input}
              placeholder="GRV number"
              placeholderTextColor={C.text.secondary}
              value={grvNumber}
              onChangeText={setGrvNumber}
              autoCapitalize="characters"
              editable={!importCompleted}
            />

            <Text style={styles.label}>Supplier *</Text>
            <TouchableOpacity style={[styles.selector, importCompleted && { opacity: 0.6 }]} onPress={() => !importCompleted && setShowSupplierPicker(true)}>
              {selectedSupplier ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Users size={18} color={C.amber.primary} />
                  <Text style={styles.selectorText} numberOfLines={1}>{selectedSupplier.name}</Text>
                </View>
              ) : (
                <Text style={[styles.selectorText, { color: C.text.secondary }]}>Tap to select supplier...</Text>
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
            </>
            )}

            {!isGdnMode && (
            <>
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
            </>
            )}
            
            {!isGdnMode && (
            <>
            <Text style={styles.label}>Notes</Text>
            <TextInput style={[styles.input, { height: 80, textAlignVertical: "top", paddingTop: 12 }]} multiline placeholder="Optional notes..." placeholderTextColor={C.text.secondary} value={notes} onChangeText={setNotes} editable={!importCompleted} />
            </>
            )}

            {importCompleted && (
              <View style={styles.successBadge}>
                <Text style={styles.successBadgeText}>{isGdnMode ? `GDN ${postedGdnNumber || gdnNumber} saved for admin confirmation.` : `GRV ${postedGrvNumber || grvNumber} posted successfully.`}</Text>
              </View>
            )}

            {grvItems.length > 0 ? (
              <View style={styles.summaryCard}>
                <Text style={styles.summaryTitle}>{isGdnMode ? "GDN Lines" : "GRV Lines"}</Text>
                {grvItems.map((item, index) => {
                  const allocated = lineAllocatedCost(item);
                  const effective = (Number(item.quantity) * Number(item.unitCost)) + allocated;
                  return (
                    <TouchableOpacity key={`${item.product.id}-${index}`} style={styles.grvLine} onPress={() => editLine(index)} activeOpacity={0.75}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.summaryValue}>{item.product.name}</Text>
                        <Text style={styles.summaryLabel}>
                          {isGdnMode ? `Qty received: ${item.quantity}` : `${item.quantity} x $${Number(item.unitCost).toFixed(2)} + landed $${allocated.toFixed(2)}`}
                        </Text>
                        {!importCompleted && <Text style={styles.lineEditHint}>Tap to edit</Text>}
                        {!isGdnMode && allocationMethod === "manual" && (
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
                        {!isGdnMode && <Text style={[styles.summaryValue, { color: C.amber.primary }]}>${effective.toFixed(2)}</Text>}
                        <TouchableOpacity onPress={(event) => { event.stopPropagation(); setGrvItems((rows) => rows.filter((_, i) => i !== index)); }}>
                          <Trash2 size={16} color={C.status.error} />
                        </TouchableOpacity>
                      </View>
                    </TouchableOpacity>
                  );
                })}
                <View style={styles.summaryDivider} />
                <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Products</Text><Text style={styles.summaryValue}>{grvItems.length}</Text></View>
                {isGdnMode ? (
                  <View style={styles.summaryRow}><Text style={[styles.summaryLabel, { fontWeight: "900" }]}>Stock Status</Text><Text style={[styles.summaryValue, { color: C.amber.primary, fontSize: 16 }]}>Pending admin</Text></View>
                ) : (
                <>
                <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Product Cost</Text><Text style={styles.summaryValue}>${baseTotal.toFixed(2)}</Text></View>
                <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Landed Cost</Text><Text style={styles.summaryValue}>${effectiveLandedTotal.toFixed(2)}</Text></View>
                <View style={styles.summaryRow}><Text style={[styles.summaryLabel, { fontWeight: "900" }]}>Inventory Value</Text><Text style={[styles.summaryValue, { color: C.amber.primary, fontSize: 16 }]}>${grvTotal.toFixed(2)}</Text></View>
                </>
                )}
              </View>
            ) : null}
          </ScrollView>
          )}

          {!isPendingMode && !(isGdnMode && hasDraftLineEntry) && <View style={styles.footer}>
            <TouchableOpacity style={[styles.submitBtn, importCompleted && styles.submitBtnDisabled]} onPress={handleSubmit} disabled={saving || importCompleted}>
              {saving ? <ActivityIndicator color="#000" /> : (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Plus size={20} color="#000" />
                  <Text style={styles.submitBtnText}>{importCompleted ? (isGdnMode ? "Saved" : "Posted") : isGdnMode ? "Save GDN" : isConfirmingGdn ? "Confirm & Post Stock" : "Post GRV"}</Text>
                </View>
              )}
            </TouchableOpacity>
            {importCompleted && !!onClose && (
              <TouchableOpacity style={styles.doneBtn} onPress={onClose}><Text style={styles.doneBtnText}>Close</Text></TouchableOpacity>
            )}
            {importCompleted && (
              <TouchableOpacity style={styles.doneBtn} onPress={startNewGrv}><Text style={styles.doneBtnText}>{isGdnMode ? "New GDN" : "New GRV"}</Text></TouchableOpacity>
            )}
          </View>}
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
                <>
                  <Text style={styles.resultHint}>
                    {productMatches.length >= PRODUCT_SEARCH_LIMIT
                      ? `Showing first ${PRODUCT_SEARCH_LIMIT}. Keep typing to narrow results.`
                      : `${productMatches.length} product${productMatches.length === 1 ? "" : "s"} found`}
                  </Text>
                  <FlatList
                    data={productMatches}
                    keyExtractor={(item) => String(item.id)}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    initialNumToRender={18}
                    maxToRenderPerBatch={18}
                    windowSize={7}
                    ListEmptyComponent={<Text style={styles.emptyText}>No products found.</Text>}
                    ListFooterComponent={<View style={{ height: 60 }} />}
                    renderItem={({ item }: { item: any }) => (
                    <TouchableOpacity 
                      key={item.id} 
                      style={[styles.pickerItem, selectedProduct?.id === item.id && styles.pickerItemActive]}
                      onPress={() => selectProduct(item)}
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
                    )}
                  />
                </>
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
  modeTabs: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: C.bg.base, borderBottomWidth: 1, borderBottomColor: C.bg.glassBorder },
  modeTab: { flex: 1, minHeight: 42, borderRadius: 12, backgroundColor: C.bg.panel, borderWidth: 1, borderColor: C.bg.glassBorder, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 },
  modeTabActive: { borderColor: C.amber.primary, backgroundColor: hexAlpha(C.amber.primary, 0.12) },
  modeTabText: { color: C.text.secondary, fontSize: 12, fontWeight: "900", textTransform: "uppercase" },
  modeTabTextActive: { color: C.amber.primary },
  label: { color: C.text.primary, fontSize: 13, fontWeight: "700", marginBottom: 10, marginTop: 18, opacity: 0.6 },
  input: { backgroundColor: C.bg.panel, color: C.text.primary, borderRadius: 14, paddingHorizontal: 16, height: 52, borderWidth: 1.5, borderColor: C.bg.glassBorder, fontSize: 15, fontWeight: "600" },
  selector: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: C.bg.panel, borderRadius: 16, paddingHorizontal: 16, height: 56, borderWidth: 1.5, borderColor: C.bg.glassBorder },
  quickCard: { backgroundColor: C.bg.panel, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: C.bg.glassBorder, shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
  quickHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  quickTitle: { color: C.text.primary, fontSize: 15, fontWeight: "900" },
  quickSub: { color: C.text.secondary, fontSize: 11, fontWeight: "700", marginTop: 2 },
  quickStatus: { color: C.amber.primary, fontSize: 10, fontWeight: "900", textTransform: "uppercase", backgroundColor: hexAlpha(C.amber.primary, 0.1), paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999 },
  quickToggleRow: { height: 42, borderRadius: 12, backgroundColor: C.bg.base, borderWidth: 1, borderColor: C.bg.glassBorder, paddingLeft: 12, paddingRight: 6, marginBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  quickToggleText: { color: C.text.primary, fontSize: 12, fontWeight: "900", textTransform: "uppercase" },
  compactRow: { flexDirection: "row", gap: 10, marginBottom: 10 },
  compactLabel: { color: C.text.secondary, fontSize: 10, fontWeight: "900", marginBottom: 6, textTransform: "uppercase" },
  compactInput: { backgroundColor: C.bg.base, color: C.text.primary, borderRadius: 12, paddingHorizontal: 12, height: 44, borderWidth: 1, borderColor: C.bg.glassBorder, fontSize: 14, fontWeight: "800" },
  compactSelector: { height: 44, borderRadius: 12, backgroundColor: C.bg.base, borderWidth: 1, borderColor: C.bg.glassBorder, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  compactSelectorText: { color: C.text.primary, fontSize: 13, fontWeight: "800", flex: 1 },
  selectorCompact: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: C.bg.base, borderRadius: 12, paddingHorizontal: 12, minHeight: 48, borderWidth: 1, borderColor: C.bg.glassBorder, marginBottom: 10 },
  compactMeta: { color: C.text.secondary, fontSize: 11, fontWeight: "700", marginTop: 2 },
  quickLineRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  quickAddBtn: { minWidth: 112, height: 44, borderRadius: 12, backgroundColor: C.amber.primary, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 },
  quickAddText: { color: "#000", fontWeight: "900", fontSize: 13, textTransform: "uppercase" },
  compactNotes: { marginTop: 10, backgroundColor: C.bg.base, color: C.text.primary, borderRadius: 12, paddingHorizontal: 12, paddingTop: 10, minHeight: 44, maxHeight: 72, borderWidth: 1, borderColor: C.bg.glassBorder, fontSize: 13, fontWeight: "700", textAlignVertical: "top" },
  draftWarning: { color: C.amber.primary, fontSize: 11, fontWeight: "900", marginTop: 8, textAlign: "center" },
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
  resultHint: { color: C.text.secondary, fontSize: 12, fontWeight: "700", marginBottom: 8 },
  pendingCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: C.bg.panel, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: C.bg.glassBorder, marginTop: 14 },
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
  lineEditHint: { color: C.amber.primary, fontSize: 10, fontWeight: "800", marginTop: 4, textTransform: "uppercase" },
  footer: { paddingHorizontal: 20, paddingBottom: Math.max(insets.bottom, 20), paddingTop: 16, borderTopWidth: 1, borderTopColor: C.bg.glassBorder },
  submitBtn: { backgroundColor: C.amber.primary, borderRadius: 16, paddingVertical: 18, alignItems: "center", shadowColor: C.amber.primary, shadowOpacity: 0.35, shadowRadius: 15, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: "#000", fontWeight: "900", fontSize: 16, letterSpacing: 0.5 },
  doneBtn: { marginTop: 12, backgroundColor: C.bg.panel, borderRadius: 16, paddingVertical: 15, alignItems: "center", borderWidth: 1, borderColor: C.bg.glassBorder },
  doneBtnText: { color: C.text.primary, fontWeight: "800", fontSize: 14 },
});
