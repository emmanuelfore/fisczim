import React, { useState, useMemo, useCallback } from "react";
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  StyleSheet, SafeAreaView, ActivityIndicator, Alert, ScrollView, Modal,
  KeyboardAvoidingView, Platform, Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Menu, Search, Plus, Package, X, Edit2, Check,
} from "lucide-react-native";
import { StatusBar } from "expo-status-bar";
import { useProducts, useTaxTypes } from "../hooks/usePosData";
import { apiFetch } from "../lib/api";
import { resolveMediaUrl } from "../lib/media";

import { PremiumColors as C } from "../ui/PremiumColors";

const PRODUCT_TYPES = [
  { value: "good", label: "Good" },
  { value: "service", label: "Service" },
];

interface Props { onOpenDrawer: () => void; companyId: number; }

const emptyProduct = {
  name: "", sku: "", barcode: "", hsCode: "0000.00.00", price: "", costPrice: "",
  category: "", ownerGroup: "", description: "", productType: "good",
  isTracked: true, stockLevel: "0", lowStockThreshold: "10",
  taxTypeId: null as number | null, isActive: true
};

export function InventoryScreen({ onOpenDrawer, companyId }: Props) {
  const insets = useSafeAreaInsets();
  const { data: products, isLoading, error, refresh: refreshProducts } = useProducts(companyId);
  const { data: taxTypes } = useTaxTypes(companyId);
  const [search, setSearch] = useState("");
  const [ownerGroupFilter, setOwnerGroupFilter] = useState<string>("all");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyProduct);
  const [saving, setSaving] = useState(false);

  const ownerGroups = useMemo(() => {
    if (!products) return [];
    const groups = new Set<string>();
    products.forEach((p: any) => {
      const group = p.ownerGroup?.trim();
      if (group) groups.add(group);
    });
    return Array.from(groups).sort((a, b) => a.localeCompare(b));
  }, [products]);

  const filtered = useMemo(() => {
    if (!products) return [];
    const q = search.toLowerCase();
    const selectedGroup = ownerGroupFilter === "all" ? null : ownerGroupFilter;
    return products.filter((p: any) =>
      (p.isActive !== false) &&
      (!selectedGroup || p.ownerGroup === selectedGroup) &&
      (
        p.name?.toLowerCase().includes(q) ||
        p.sku?.toLowerCase().includes(q) ||
        p.category?.toLowerCase().includes(q) ||
        p.ownerGroup?.toLowerCase().includes(q)
      )
    );
  }, [products, search, ownerGroupFilter]);

  const categories = useMemo(() => {
    if (!products) return [];
    const cats = new Set(products.map((p: any) => p.category).filter(Boolean));
    return Array.from(cats) as string[];
  }, [products]);

  const openEdit = (item: any) => {
    setEditingId(item.id);
    setForm({
      name: item.name || "", sku: item.sku || "", barcode: item.barcode || "",
      hsCode: item.hsCode || "0000.00.00",
      price: String(item.price || ""),
      costPrice: String(item.costPrice || ""), category: item.category || "",
      ownerGroup: item.ownerGroup || "",
      description: item.description || "", productType: item.productType || "good",
      isTracked: item.isTracked ?? true, stockLevel: String(item.stockLevel || 0),
      lowStockThreshold: String(item.lowStockThreshold || 10),
      taxTypeId: item.taxTypeId || null,
      isActive: item.isActive ?? true,
    });
    setShowForm(true);
  };

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyProduct);
    setShowForm(true);
  };

  const handleSave = useCallback(async () => {
    if (!form.name.trim()) return Alert.alert("Error", "Product name is required");
    if (!form.sku.trim()) return Alert.alert("Error", "Product Code/SKU is required");
    if (!form.price || parseFloat(form.price) < 0) return Alert.alert("Error", "Valid selling price is required");
    setSaving(true);
    try {
      const body: any = {
        name: form.name.trim(),
        sku: form.sku.trim(),
        price: form.price,
        costPrice: form.costPrice || "0",
        category: form.category || null,
        ownerGroup: form.ownerGroup?.trim() ? form.ownerGroup.trim() : null,
        description: form.description || null,
        productType: form.productType,
        isTracked: form.isTracked,
        stockLevel: form.stockLevel || "0",
        lowStockThreshold: form.lowStockThreshold || "10",
        taxTypeId: form.taxTypeId,
        barcode: form.barcode || null,
        hsCode: form.hsCode || "0000.00.00",
        isActive: form.isActive,
        companyId,
      };
      const url = editingId
        ? `/api/products/${editingId}`
        : `/api/companies/${companyId}/products`;
      const method = editingId ? "PATCH" : "POST";
      const res = await apiFetch(url, { method, body: JSON.stringify(body) });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(errText || `Failed to ${editingId ? "update" : "create"} product`);
      }
      setShowForm(false);
      refreshProducts();
      Alert.alert("Success", `Product ${editingId ? "updated" : "saved"} successfully`);
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally { setSaving(false); }
  }, [form, companyId, editingId]);

  const renderItem = ({ item }: { item: any }) => {
    const stock = Number(item.stockLevel || 0);
    const lowThreshold = Number(item.lowStockThreshold || 10);
    const isOutOfStock = stock <= 0;
    const isLowStock = stock <= lowThreshold;
    const imageUrl = resolveMediaUrl(item.imageUrl);
    return (
      <TouchableOpacity style={styles.card} onPress={() => openEdit(item)} activeOpacity={0.8}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.cardImage} />
        ) : (
          <View style={styles.cardIcon}>
            <Package size={22} color={C.text.secondary} opacity={0.6} />
          </View>
        )}
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.cardSub}>
            {item.sku || "No SKU"}
            {item.category ? ` · ${item.category}` : ""}
            {item.ownerGroup ? ` · ${item.ownerGroup}` : ""}
          </Text>
        </View>
        <View style={styles.cardRight}>
          <Text style={styles.cardPrice}>${Number(item.price || 0).toFixed(2)}</Text>
          <View style={[
            styles.stockBadge,
            { backgroundColor: isOutOfStock ? C.status.error : isLowStock ? "#fbbf24" : "#111827" }
          ]}>
            <Text style={[
              styles.stockBadgeText,
              { color: isLowStock ? "#000" : "#fff" }
            ]}>
              {item.isTracked ? (isOutOfStock ? "OUT" : `${stock} UNITS`) : "NOT TRACKED"}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={{ flex: 1 }}>
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) }]}>
          <TouchableOpacity onPress={onOpenDrawer} style={styles.iconBtn}><Menu size={20} color={C.text.primary} /></TouchableOpacity>
          <Text style={styles.title}>Inventory</Text>
          <TouchableOpacity onPress={openAdd} style={[styles.iconBtn, { backgroundColor: C.amber.primary }]}><Plus size={20} color="#000" /></TouchableOpacity>
        </View>
        <View style={styles.searchRow}>
          <Package size={14} color={C.text.secondary} />
          <TextInput style={styles.searchInput} placeholder="Search products..." placeholderTextColor={C.text.secondary} value={search} onChangeText={setSearch} />
        </View>
        {ownerGroups.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterChipsRow}
          >
            <TouchableOpacity
              style={[styles.filterChip, ownerGroupFilter === "all" && styles.filterChipActive]}
              onPress={() => setOwnerGroupFilter("all")}
            >
              <Text style={[styles.filterChipText, ownerGroupFilter === "all" && styles.filterChipTextActive]}>All Cost Centers</Text>
            </TouchableOpacity>
            {ownerGroups.map((group) => (
              <TouchableOpacity
                key={group}
                style={[styles.filterChip, ownerGroupFilter === group && styles.filterChipActive]}
                onPress={() => setOwnerGroupFilter(group)}
              >
                <Text style={[styles.filterChipText, ownerGroupFilter === group && styles.filterChipTextActive]}>{group}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
        {isLoading ? (
          <ActivityIndicator size="small" color={C.amber.primary} style={{ marginVertical: 10 }} />
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : (
          <FlatList data={filtered} keyExtractor={(item) => String(item.id)} renderItem={renderItem} contentContainerStyle={{ padding: 16, paddingBottom: 80 }} ListEmptyComponent={<Text style={styles.emptyText}>No products found.</Text>} />
        )}

        <Modal visible={showForm} transparent animationType="slide">
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.modalOverlay}
          >
            <View style={[styles.modalContent, { paddingBottom: Math.max(insets.bottom, 24) }]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{editingId ? "Edit Product" : "Add Product"}</Text>
                <TouchableOpacity onPress={() => setShowForm(false)}><X size={20} color={C.text.primary} /></TouchableOpacity>
              </View>
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
                {/* Name */}
                <View style={styles.field}><Text style={styles.fieldLabel}>Product Name *</Text>
                  <TextInput style={styles.fieldInput} value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} placeholderTextColor={C.text.secondary} /></View>
                {/* Barcode */}
                <View style={styles.field}><Text style={styles.fieldLabel}>Barcode</Text>
                  <TextInput style={styles.fieldInput} value={form.barcode} onChangeText={(v) => setForm({ ...form, barcode: v })} placeholder="Optional" placeholderTextColor={C.text.secondary} /></View>
                {/* HS Code */}
                <View style={styles.field}><Text style={styles.fieldLabel}>HS Code</Text>
                  <TextInput style={styles.fieldInput} value={form.hsCode} onChangeText={(v) => setForm({ ...form, hsCode: v })} placeholder="0000.00.00" placeholderTextColor={C.text.secondary} /></View>
                {/* SKU */}
                <View style={styles.field}><Text style={styles.fieldLabel}>Code / SKU *</Text>
                  <TextInput style={styles.fieldInput} value={form.sku} onChangeText={(v) => setForm({ ...form, sku: v })} placeholderTextColor={C.text.secondary} /></View>
                {/* Category */}
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Category</Text>
                  <TextInput style={styles.fieldInput} value={form.category} onChangeText={(v) => setForm({ ...form, category: v })} placeholder="e.g. Beverages, Electronics" placeholderTextColor={C.text.secondary} />
                  {categories.length > 0 && (
                    <View style={styles.chipRow}>
                      {categories.slice(0, 6).map((cat) => (
                        <TouchableOpacity key={cat} style={[styles.chip, form.category === cat && styles.chipActive]} onPress={() => setForm({ ...form, category: cat })}>
                          <Text style={[styles.chipText, form.category === cat && styles.chipTextActive]}>{cat}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
                {/* Owner Group */}
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Owner Group (for separate reports)</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={form.ownerGroup}
                    onChangeText={(v) => setForm({ ...form, ownerGroup: v })}
                    placeholder="e.g. Beauty or Mother"
                    placeholderTextColor={C.text.secondary}
                  />
                </View>
                {/* Tax Type */}
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Tax Type</Text>
                  <View style={styles.chipRow}>
                    {taxTypes?.map((t: any) => (
                      <TouchableOpacity key={t.id} style={[styles.chip, form.taxTypeId === t.id && styles.chipActive]} onPress={() => setForm({ ...form, taxTypeId: t.id })}>
                        <Text style={[styles.chipText, form.taxTypeId === t.id && styles.chipTextActive]}>{t.name} ({t.rate}%)</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                {/* Prices */}
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <View style={[styles.field, { flex: 1 }]}><Text style={styles.fieldLabel}>Selling Price *</Text>
                    <TextInput style={styles.fieldInput} keyboardType="numeric" value={form.price} onChangeText={(v) => setForm({ ...form, price: v })} placeholderTextColor={C.text.secondary} /></View>
                  <View style={[styles.field, { flex: 1 }]}><Text style={styles.fieldLabel}>Cost Price</Text>
                    <TextInput style={styles.fieldInput} keyboardType="numeric" value={form.costPrice} onChangeText={(v) => setForm({ ...form, costPrice: v })} placeholderTextColor={C.text.secondary} /></View>
                </View>
                {/* Track inventory toggle */}
                <TouchableOpacity style={styles.toggleRow} onPress={() => setForm({ ...form, isTracked: !form.isTracked })}>
                  <View style={[styles.toggleBox, form.isTracked && styles.toggleBoxActive]}>
                    {form.isTracked && <Check size={14} color="#000" />}
                  </View>
                  <Text style={styles.toggleLabel}>Track Inventory</Text>
                </TouchableOpacity>
                {form.isTracked && (
                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <View style={[styles.field, { flex: 1 }]}><Text style={styles.fieldLabel}>Opening Stock</Text>
                      <TextInput style={styles.fieldInput} keyboardType="numeric" value={form.stockLevel} onChangeText={(v) => setForm({ ...form, stockLevel: v })} placeholderTextColor={C.text.secondary} /></View>
                    <View style={[styles.field, { flex: 1 }]}><Text style={styles.fieldLabel}>Low Stock Alert</Text>
                      <TextInput style={styles.fieldInput} keyboardType="numeric" value={form.lowStockThreshold} onChangeText={(v) => setForm({ ...form, lowStockThreshold: v })} placeholderTextColor={C.text.secondary} /></View>
                  </View>
                )}
                {/* Description */}
                <View style={styles.field}><Text style={styles.fieldLabel}>Description</Text>
                  <TextInput style={[styles.fieldInput, { height: 70, textAlignVertical: "top" }]} multiline value={form.description} onChangeText={(v) => setForm({ ...form, description: v })} placeholderTextColor={C.text.secondary} /></View>

                {/* Active Status */}
                <TouchableOpacity style={styles.toggleRow} onPress={() => setForm({ ...form, isActive: !form.isActive })}>
                  <View style={[styles.toggleBox, form.isActive && styles.toggleBoxActive]}>
                    {form.isActive && <Check size={14} color="#000" />}
                  </View>
                  <Text style={styles.toggleLabel}>Active Status</Text>
                </TouchableOpacity>
              </ScrollView>

              <View style={{ paddingTop: 16, borderTopWidth: 1, borderTopColor: C.border.default, marginTop: 10 }}>
                <TouchableOpacity style={[styles.saveBtn, { marginTop: 0, marginBottom: 0 }]} onPress={handleSave} disabled={saving}>
                  {saving ? <ActivityIndicator color="#000" /> : <Text style={styles.saveBtnText}>{editingId ? "Update Product" : "Save Product"}</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg.base },
  header: { paddingHorizontal: 16, paddingVertical: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: C.border.default },
  iconBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: C.bg.card, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  title: { color: C.text.primary, fontSize: 18, fontWeight: "800" },
  searchRow: { flexDirection: "row", alignItems: "center", backgroundColor: C.bg.hover, margin: 16, marginBottom: 0, borderRadius: 16, paddingHorizontal: 16, height: 48, shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3, gap: 10 },
  filterChipsRow: { paddingHorizontal: 16, paddingTop: 10, gap: 8 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: C.bg.hover, borderWidth: 1, borderColor: C.border.default },
  filterChipActive: { backgroundColor: `${C.amber.primary}20`, borderColor: C.amber.primary },
  filterChipText: { color: C.text.secondary, fontSize: 12, fontWeight: "700" },
  filterChipTextActive: { color: C.amber.primary },
  searchInput: { flex: 1, color: C.text.primary, height: 48, fontSize: 15 },
  card: { flexDirection: "row", alignItems: "center", backgroundColor: C.bg.card, padding: 12, borderRadius: 18, marginBottom: 12, gap: 12, shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 5 },
  cardImage: { width: 44, height: 44, borderRadius: 14, backgroundColor: C.bg.hover },
  cardIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: C.bg.hover, alignItems: "center", justifyContent: "center" },
  cardInfo: { flex: 1, justifyContent: "center" },
  cardTitle: { color: C.text.primary, fontSize: 15, fontWeight: "800", marginBottom: 3 },
  cardSub: { color: C.text.secondary, fontSize: 12, fontWeight: "500" },
  cardRight: { alignItems: "flex-end", marginRight: 2 },
  cardPrice: { color: C.text.primary, fontSize: 15, fontWeight: "900", marginBottom: 4 },
  stockBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  stockBadgeText: { fontSize: 9, fontWeight: "900", letterSpacing: 0.5 },
  errorText: { color: C.status.error, textAlign: "center", marginTop: 40 },
  emptyText: { color: C.text.secondary, textAlign: "center", marginTop: 40 },
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.7)" },
  modalContent: { backgroundColor: C.bg.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, borderWidth: 1, borderColor: C.border.default, maxHeight: "90%" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { color: C.text.primary, fontSize: 18, fontWeight: "800" },
  field: { marginBottom: 12 },
  fieldLabel: { color: C.text.secondary, fontSize: 11, fontWeight: "600", marginBottom: 5 },
  fieldInput: { backgroundColor: C.bg.hover, color: C.text.primary, borderRadius: 10, paddingHorizontal: 14, height: 42, borderWidth: 1, borderColor: C.border.default, fontSize: 14 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: C.bg.card, shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  chipActive: { backgroundColor: `${C.amber.primary}20`, shadowColor: C.amber.primary, shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 5 },
  chipText: { color: C.text.secondary, fontSize: 11, fontWeight: "600" },
  chipTextActive: { color: C.amber.primary },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12, marginTop: 4 },
  toggleBox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: C.text.secondary, alignItems: "center", justifyContent: "center" },
  toggleBoxActive: { backgroundColor: C.amber.primary, borderColor: C.amber.primary },
  toggleLabel: { color: C.text.primary, fontSize: 13, fontWeight: "600" },
  saveBtn: { backgroundColor: C.amber.primary, borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 8, marginBottom: 20, shadowColor: C.amber.primary, shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  saveBtnText: { color: "#000", fontWeight: "800", fontSize: 15 },
});
