import React, { useState, useMemo, useCallback } from "react";
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, Modal, Alert, ScrollView,
  KeyboardAvoidingView, Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Menu, Search, Plus, Truck, X, Phone, Mail, Edit2, Check } from "lucide-react-native";
import { StatusBar } from "expo-status-bar";
import { useSuppliers } from "../hooks/usePosData";
import { apiFetch } from "../lib/api";
import { useTheme, hexAlpha } from "../ui/PremiumColors";
import { DoneTextInput as TextInput } from "../ui/DoneTextInput";

interface Props { onOpenDrawer: () => void; companyId: number; }

const emptySupplier = { name: "", contactPerson: "", email: "", phone: "", address: "", tin: "", vatNumber: "", isActive: true };

export function SuppliersScreen({ onOpenDrawer, companyId }: Props) {
  const insets = useSafeAreaInsets();
  const { theme: C, isDark } = useTheme();
  
  const { data: suppliers, isLoading, refresh: refreshSuppliers } = useSuppliers(companyId);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptySupplier);
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    if (!suppliers) return [];
    const q = search.toLowerCase();
    return suppliers.filter((s: any) =>
      (s.isActive !== false) && (s.name?.toLowerCase().includes(q) || s.contactPerson?.toLowerCase().includes(q) || s.email?.toLowerCase().includes(q))
    );
  }, [suppliers, search]);

  const openEdit = (item: any) => {
    setEditingId(item.id);
    setForm({
      name: item.name || "", contactPerson: item.contactPerson || "", email: item.email || "",
      phone: item.phone || "", address: item.address || "",
      tin: item.tin || "", vatNumber: item.vatNumber || "",
      isActive: item.isActive ?? true,
    });
    setShowForm(true);
  };

  const openAdd = () => { setEditingId(null); setForm(emptySupplier); setShowForm(true); };

  const handleSave = useCallback(async () => {
    if (!form.name.trim()) return Alert.alert("Error", "Supplier name is required");
    setSaving(true);
    try {
      const body: any = {
        name: form.name.trim(),
        contactPerson: form.contactPerson || null,
        email: form.email || null,
        phone: form.phone || null,
        address: form.address || null,
        tin: form.tin || null,
        vatNumber: form.vatNumber || null,
        isActive: form.isActive,
        companyId,
      };
      const url = editingId ? `/api/suppliers/${editingId}` : `/api/companies/${companyId}/suppliers`;
      const method = editingId ? "PATCH" : "POST";
      const res = await apiFetch(url, { method, body: JSON.stringify(body) });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(errText || `Failed to ${editingId ? "update" : "create"} supplier`);
      }
      setShowForm(false);
      refreshSuppliers();
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally { setSaving(false); }
  }, [form, companyId, editingId, refreshSuppliers]);

  const styles = makeStyles(C, isDark, insets);

  const renderItem = ({ item }: { item: any }) => (
    <TouchableOpacity style={[styles.card, !item.isActive && { opacity: 0.5 }]} onPress={() => openEdit(item)} activeOpacity={0.7}>
      <View style={styles.cardIcon}><Truck size={18} color={C.amber.primary} /></View>
      <View style={styles.cardInfo}>
        <Text style={styles.cardTitle} numberOfLines={1}>{item.name}</Text>
        {item.contactPerson && <Text style={styles.cardSub}>{item.contactPerson}</Text>}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 6 }}>
          {item.phone && <View style={styles.metaRow}><Phone size={10} color={C.text.secondary} /><Text style={styles.metaText}>{item.phone}</Text></View>}
          {item.email && <View style={styles.metaRow}><Mail size={10} color={C.text.secondary} /><Text style={styles.metaText} numberOfLines={1}>{item.email}</Text></View>}
        </View>
      </View>
      <Edit2 size={14} color={C.text.secondary} />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={{ flex: 1 }}>
        <View style={styles.header}>
          <Text style={styles.title}>Suppliers</Text>
          <TouchableOpacity onPress={openAdd} style={[styles.iconBtn, { backgroundColor: C.amber.primary }]}><Plus size={20} color="#000" /></TouchableOpacity>
        </View>
        <View style={styles.searchRow}>
          <Search size={16} color={C.text.secondary} />
          <TextInput style={styles.searchInput} placeholder="Search suppliers..." placeholderTextColor={C.text.secondary} value={search} onChangeText={setSearch} />
        </View>
        {isLoading ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color={C.amber.primary} />
          </View>
        ) : (
          <FlatList data={filtered} keyExtractor={(item) => String(item.id)} renderItem={renderItem} contentContainerStyle={{ padding: 16, paddingBottom: 100 }} ListEmptyComponent={<Text style={styles.emptyText}>No suppliers found.</Text>} />
        )}

        <Modal visible={showForm} transparent animationType="slide">
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{editingId ? "Edit Supplier" : "Add Supplier"}</Text>
                <TouchableOpacity onPress={() => setShowForm(false)} style={styles.closeBtn}><X size={20} color={C.text.primary} /></TouchableOpacity>
              </View>
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
                {[
                  { label: "Name *", key: "name", kb: "default" as const },
                  { label: "Contact Person", key: "contactPerson", kb: "default" as const },
                  { label: "Email", key: "email", kb: "email-address" as const },
                  { label: "Phone", key: "phone", kb: "phone-pad" as const },
                  { label: "Address", key: "address", kb: "default" as const },
                  { label: "TIN", key: "tin", kb: "numeric" as const },
                  { label: "VAT Number", key: "vatNumber", kb: "numeric" as const },
                ].map((f) => (
                  <View key={f.key} style={styles.field}>
                    <Text style={styles.fieldLabel}>{f.label}</Text>
                    <TextInput style={styles.fieldInput} placeholderTextColor={C.text.secondary} keyboardType={f.kb} value={(form as any)[f.key]} onChangeText={(v) => setForm({ ...form, [f.key]: v })} />
                  </View>
                ))}
                
                <TouchableOpacity style={styles.toggleRow} onPress={() => setForm({ ...form, isActive: !form.isActive })}>
                  <View style={[styles.toggleBox, form.isActive && styles.toggleBoxActive]}>
                    {form.isActive && <Check size={14} color="#000" />}
                  </View>
                  <Text style={styles.toggleLabel}>Active Status</Text>
                </TouchableOpacity>
              </ScrollView>
              
              <View style={styles.modalFooter}>
                <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
                  {saving ? <ActivityIndicator color="#000" /> : <Text style={styles.saveBtnText}>{editingId ? "Update Supplier" : "Save Supplier"}</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </View>
    </View>
  );
}

const makeStyles = (C: any, isDark: boolean, insets: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg.base },
  header: { 
    paddingHorizontal: 16, 
    paddingTop: Math.max(insets.top, 12), 
    paddingBottom: 16, 
    flexDirection: "row", 
    alignItems: "center", 
    justifyContent: "space-between",
    backgroundColor: C.bg.base,
    borderBottomWidth: 1,
    borderBottomColor: C.bg.glassBorder,
  },
  iconBtn: { 
    width: 44, 
    height: 44, 
    borderRadius: 14, 
    backgroundColor: C.bg.panel, 
    alignItems: "center", 
    justifyContent: "center", 
    shadowColor: "#000", 
    shadowOpacity: 0.1, 
    shadowRadius: 8, 
    shadowOffset: { width: 0, height: 4 }, 
    elevation: 4,
    borderWidth: 1,
    borderColor: C.bg.glassBorder,
  },
  title: { color: C.text.primary, fontSize: 18, fontWeight: "900", letterSpacing: -0.5 },
  searchRow: { 
    flexDirection: "row", 
    alignItems: "center", 
    backgroundColor: C.bg.panel, 
    margin: 16, 
    borderRadius: 16, 
    paddingHorizontal: 14, 
    borderWidth: 1.5, 
    borderColor: C.bg.glassBorder, 
    gap: 12 
  },
  searchInput: { flex: 1, color: C.text.primary, height: 50, fontSize: 15, fontWeight: "600" },
  card: { 
    flexDirection: "row", 
    alignItems: "center", 
    backgroundColor: C.bg.panel, 
    padding: 16, 
    borderRadius: 20, 
    borderWidth: 1, 
    borderColor: C.bg.glassBorder, 
    marginBottom: 12, 
    gap: 14,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  cardIcon: { 
    width: 48, 
    height: 48, 
    borderRadius: 14, 
    backgroundColor: hexAlpha(C.amber.primary, 0.08), 
    alignItems: "center", 
    justifyContent: "center",
    borderWidth: 1,
    borderColor: hexAlpha(C.amber.primary, 0.15),
  },
  cardInfo: { flex: 1 },
  cardTitle: { color: C.text.primary, fontSize: 15, fontWeight: "800" },
  cardSub: { color: C.text.secondary, fontSize: 13, marginTop: 2, fontWeight: "600" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { color: C.text.secondary, fontSize: 12, fontWeight: "500" },
  emptyText: { color: C.text.secondary, textAlign: "center", marginTop: 60, fontSize: 14, fontWeight: "600" },
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.8)" },
  modalContent: { 
    backgroundColor: C.bg.base, 
    borderTopLeftRadius: 32, 
    borderTopRightRadius: 32, 
    paddingHorizontal: 24, 
    paddingTop: 24,
    paddingBottom: Math.max(insets.bottom, 24), 
    borderTopWidth: 1, 
    borderColor: C.bg.glassBorder, 
    maxHeight: "90%" 
  },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 24 },
  modalTitle: { color: C.text.primary, fontSize: 22, fontWeight: "900", letterSpacing: -0.5 },
  closeBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.bg.panel, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.bg.glassBorder },
  field: { marginBottom: 20 },
  fieldLabel: { color: C.text.primary, fontSize: 13, fontWeight: "700", marginBottom: 10, opacity: 0.6 },
  fieldInput: { 
    backgroundColor: C.bg.panel, 
    color: C.text.primary, 
    borderRadius: 14, 
    paddingHorizontal: 16, 
    height: 52, 
    borderWidth: 1.5, 
    borderColor: C.bg.glassBorder, 
    fontSize: 15,
    fontWeight: "600",
  },
  saveBtn: { 
    backgroundColor: C.amber.primary, 
    borderRadius: 16, 
    paddingVertical: 16, 
    alignItems: "center", 
    shadowColor: C.amber.primary, 
    shadowOpacity: 0.35, 
    shadowRadius: 15, 
    shadowOffset: { width: 0, height: 8 }, 
    elevation: 8 
  },
  saveBtnText: { color: "#000", fontWeight: "900", fontSize: 16, letterSpacing: 0.5 },
  modalFooter: { paddingTop: 16, borderTopWidth: 1, borderTopColor: C.bg.glassBorder, marginTop: 8 },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12, marginTop: 4 },
  toggleBox: { width: 24, height: 24, borderRadius: 8, borderWidth: 2, borderColor: C.text.secondary, alignItems: "center", justifyContent: "center" },
  toggleBoxActive: { backgroundColor: C.amber.primary, borderColor: C.amber.primary },
  toggleLabel: { color: C.text.primary, fontSize: 14, fontWeight: "700" },
});
