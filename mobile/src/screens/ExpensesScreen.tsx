import React, { useState, useMemo, useCallback, useEffect } from "react";
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, ScrollView, Modal,
  KeyboardAvoidingView, Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Menu, Search, Plus, Receipt, X, Calendar, DollarSign, Edit2 } from "lucide-react-native";
import { StatusBar } from "expo-status-bar";
import { apiJson, apiFetch } from "../lib/api";
import { useTheme, hexAlpha } from "../ui/PremiumColors";
import { DoneTextInput as TextInput } from "../ui/DoneTextInput";

interface Props { onOpenDrawer: () => void; companyId: number; }

function useExpenses(companyId: number) {
  const [data, setData] = useState<any[] | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchExpenses = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    apiJson<any[]>(`/api/companies/${companyId}/expenses`)
      .then((res) => { if (!cancelled) { setData(res); setLoading(false); } })
      .catch((e: any) => { if (!cancelled) { setError(e?.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [companyId]);

  useEffect(() => {
    return fetchExpenses();
  }, [fetchExpenses]);

  return { data, isLoading, error, refresh: fetchExpenses };
}

const CATEGORIES = ["Rent", "Utilities", "Salary", "Supplies", "Marketing", "Transport", "Office", "Taxes", "Maintenance", "Other"];
const emptyExpense = { description: "", amount: "", category: "Other", supplierId: null, expenseDate: new Date().toISOString() };

export function ExpensesScreen({ onOpenDrawer, companyId }: Props) {
  const insets = useSafeAreaInsets();
  const { theme: C, isDark } = useTheme();
  
  const { data: expenses, isLoading, refresh } = useExpenses(companyId);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyExpense);
  const [saving, setSaving] = useState(false);

  const totalExpenses = useMemo(() => {
    if (!expenses) return 0;
    return expenses.reduce((sum, e: any) => sum + Number(e.amount || 0), 0);
  }, [expenses]);

  const filtered = useMemo(() => {
    if (!expenses) return [];
    const q = search.toLowerCase();
    return expenses.filter((e: any) =>
      e.description?.toLowerCase().includes(q) || e.category?.toLowerCase().includes(q)
    );
  }, [expenses, search]);

  const openAdd = () => {
    setEditingId(null);
    setForm({ ...emptyExpense, expenseDate: new Date().toISOString() });
    setShowForm(true);
  };

  const openEdit = (item: any) => {
    setEditingId(item.id);
    setForm({
      description: item.description || "",
      amount: String(item.amount || ""),
      category: item.category || "Other",
      supplierId: item.supplierId || null,
      expenseDate: item.expenseDate || new Date().toISOString(),
    });
    setShowForm(true);
  };

  const handleSave = useCallback(async () => {
    if (!form.description.trim()) return Alert.alert("Error", "Description is required");
    const amt = parseFloat(form.amount);
    if (!amt || amt <= 0) return Alert.alert("Error", "Valid amount is required");
    
    setSaving(true);
    try {
      const body = {
        description: form.description.trim(),
        amount: amt,
        category: form.category,
        expenseDate: form.expenseDate,
        companyId,
        supplierId: form.supplierId,
      };
      
      const url = editingId 
        ? `/api/expenses/${editingId}`
        : `/api/companies/${companyId}/expenses`;
      
      const method = editingId ? "PATCH" : "POST";
      const res = await apiFetch(url, { method, body: JSON.stringify(body) });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(errText || `Failed to ${editingId ? "update" : "save"} expense`);
      }

      setShowForm(false);
      refresh();
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally { setSaving(false); }
  }, [form, companyId, editingId, refresh]);

  const styles = makeStyles(C, isDark, insets);

  const renderItem = ({ item }: { item: any }) => {
    const dateStr = item.expenseDate ? new Date(item.expenseDate).toLocaleDateString() : "";
    return (
      <TouchableOpacity style={styles.card} onPress={() => openEdit(item)} activeOpacity={0.7}>
        <View style={styles.cardIcon}><Receipt size={18} color={C.status.error} /></View>
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle} numberOfLines={1}>{item.description}</Text>
          <View style={{ flexDirection: "row", gap: 12, marginTop: 4 }}>
            <Text style={styles.metaText}>{item.category || "Other"}</Text>
            {dateStr && <View style={styles.metaRow}><Calendar size={10} color={C.text.secondary} /><Text style={styles.metaText}>{dateStr}</Text></View>}
          </View>
        </View>
        <View style={styles.cardRight}>
          <Text style={[styles.cardPrice, { color: C.status.error }]}>-${Number(item.amount || 0).toFixed(2)}</Text>
          <Edit2 size={12} color={C.text.secondary} style={{ marginTop: 4 }} />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={{ flex: 1 }}>
        <View style={styles.header}>
          <Text style={styles.title}>Expenses</Text>
          <TouchableOpacity onPress={openAdd} style={[styles.iconBtn, { backgroundColor: C.amber.primary }]}><Plus size={20} color="#000" /></TouchableOpacity>
        </View>

        <View style={styles.totalBar}>
          <View style={styles.totalBadge}>
             <DollarSign size={14} color={C.status.error} />
             <Text style={styles.totalLabel}>Total Outflow</Text>
          </View>
          <Text style={[styles.totalValue, { color: C.status.error }]}>${totalExpenses.toFixed(2)}</Text>
        </View>

        <View style={styles.searchRow}>
          <Search size={16} color={C.text.secondary} />
          <TextInput style={styles.searchInput} placeholder="Search expenses..." placeholderTextColor={C.text.secondary} value={search} onChangeText={setSearch} />
        </View>

        {isLoading && !expenses ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
             <ActivityIndicator color={C.amber.primary} />
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderItem}
            contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
            ListEmptyComponent={<Text style={styles.emptyText}>No expenses recorded.</Text>}
          />
        )}

        <Modal visible={showForm} transparent animationType="slide">
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{editingId ? "Edit Expense" : "Add Expense"}</Text>
                <TouchableOpacity onPress={() => setShowForm(false)} style={styles.closeBtn}><X size={20} color={C.text.primary} /></TouchableOpacity>
              </View>
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Description *</Text>
                  <TextInput style={styles.fieldInput} placeholder="e.g. Office Supplies" placeholderTextColor={C.text.secondary} value={form.description} onChangeText={(v) => setForm({ ...form, description: v })} />
                </View>
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Amount *</Text>
                  <TextInput style={styles.fieldInput} placeholder="0.00" placeholderTextColor={C.text.secondary} keyboardType="numeric" value={form.amount} onChangeText={(v) => setForm({ ...form, amount: v })} />
                </View>
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Category</Text>
                  <View style={styles.catGrid}>
                    {CATEGORIES.map((cat) => (
                      <TouchableOpacity
                        key={cat}
                        style={[styles.catChip, form.category === cat && styles.catChipActive]}
                        onPress={() => setForm({ ...form, category: cat })}
                      >
                        <Text style={[styles.catChipText, form.category === cat && styles.catChipTextActive]}>{cat}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </ScrollView>
              <View style={styles.modalFooter}>
                <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
                  {saving ? <ActivityIndicator color="#000" /> : <Text style={styles.saveBtnText}>{editingId ? "Update Expense" : "Save Expense"}</Text>}
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
  totalBar: { 
    flexDirection: "row", 
    alignItems: "center", 
    justifyContent: "space-between",
    paddingHorizontal: 16, 
    paddingVertical: 18, 
    backgroundColor: C.bg.panel, 
    borderBottomWidth: 1, 
    borderBottomColor: C.bg.glassBorder 
  },
  totalBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: hexAlpha(C.status.error, 0.08),
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  totalLabel: { color: C.status.error, fontSize: 12, fontWeight: "800", textTransform: "uppercase" },
  totalValue: { fontSize: 22, fontWeight: "900", letterSpacing: -1 },
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
    backgroundColor: hexAlpha(C.status.error, 0.08), 
    alignItems: "center", 
    justifyContent: "center",
    borderWidth: 1,
    borderColor: hexAlpha(C.status.error, 0.15),
  },
  cardInfo: { flex: 1 },
  cardTitle: { color: C.text.primary, fontSize: 15, fontWeight: "800" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { color: C.text.secondary, fontSize: 12, fontWeight: "600" },
  cardRight: { alignItems: "flex-end" },
  cardPrice: { fontSize: 17, fontWeight: "900", letterSpacing: -0.5 },
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
    maxHeight: "85%" 
  },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 24 },
  modalTitle: { color: C.text.primary, fontSize: 22, fontWeight: "900", letterSpacing: -0.5 },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: C.bg.panel,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: C.bg.glassBorder,
  },
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
  catGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  catChip: { 
    paddingHorizontal: 16, 
    paddingVertical: 10, 
    borderRadius: 12, 
    backgroundColor: C.bg.panel, 
    borderWidth: 1, 
    borderColor: C.bg.glassBorder 
  },
  catChipActive: { backgroundColor: hexAlpha(C.amber.primary, 0.1), borderColor: C.amber.primary },
  catChipText: { color: C.text.secondary, fontSize: 13, fontWeight: "700" },
  catChipTextActive: { color: C.amber.primary },
  modalFooter: { 
    paddingTop: 16, 
    borderTopWidth: 1, 
    borderTopColor: C.bg.glassBorder,
    marginTop: 8
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
});
