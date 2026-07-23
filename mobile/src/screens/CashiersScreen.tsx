import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Menu, Plus, Search, Trash2, UserCog, X } from "lucide-react-native";
import { StatusBar } from "expo-status-bar";
import { apiFetch, apiJson } from "../lib/api";
import { useTheme, hexAlpha } from "../ui/PremiumColors";

type Props = {
  onOpenDrawer: () => void;
  companyId: number;
};

const ROLES = ["cashier", "member", "admin"] as const;

export function CashiersScreen({ onOpenDrawer, companyId }: Props) {
  const insets = useSafeAreaInsets();
  const { theme: C } = useTheme();
  const styles = makeStyles(C, insets);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "cashier" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiJson<any[]>(`/api/companies/${companyId}/users`);
      setUsers(Array.isArray(data) ? data : []);
    } catch (e: any) {
      Alert.alert("Cashiers", e?.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((user) => {
      if (!q) return true;
      return [user.name, user.username, user.email, user.role].some((value) => String(value || "").toLowerCase().includes(q));
    });
  }, [search, users]);

  const createUser = async () => {
    if (!form.email.trim()) return Alert.alert("Missing email", "Enter the cashier email address.");
    setSaving(true);
    try {
      const res = await apiFetch(`/api/companies/${companyId}/users`, {
        method: "POST",
        body: JSON.stringify({
          email: form.email.trim(),
          name: form.name.trim() || form.email.split("@")[0],
          username: form.email.split("@")[0],
          password: form.password || undefined,
          role: form.role,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setShowForm(false);
      setForm({ name: "", email: "", password: "", role: "cashier" });
      await load();
    } catch (e: any) {
      Alert.alert("Could not add cashier", e?.message || "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const updateRole = async (user: any, role: string) => {
    try {
      const res = await apiFetch(`/api/companies/${companyId}/users/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      });
      if (!res.ok) throw new Error(await res.text());
      setUsers((list) => list.map((item) => item.id === user.id ? { ...item, role } : item));
    } catch (e: any) {
      Alert.alert("Role update failed", e?.message || "Please try again.");
    }
  };

  const removeUser = (user: any) => {
    Alert.alert("Remove user", `Remove ${user.name || user.email} from this company?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            const res = await apiFetch(`/api/companies/${companyId}/users/${user.id}`, { method: "DELETE" });
            if (!res.ok) throw new Error(await res.text());
            setUsers((list) => list.filter((item) => item.id !== user.id));
          } catch (e: any) {
            Alert.alert("Remove failed", e?.message || "Please try again.");
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Text style={styles.title}>Cashiers</Text>
        <TouchableOpacity onPress={() => setShowForm(true)} style={styles.iconBtn}><Plus size={20} color={C.amber.primary} /></TouchableOpacity>
      </View>

      <View style={styles.searchRow}>
        <Search size={18} color={C.text.secondary} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search cashiers..."
          placeholderTextColor={C.text.secondary}
          style={styles.searchInput}
        />
      </View>

      {loading ? (
        <ActivityIndicator color={C.amber.primary} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          {filtered.map((user) => (
            <View key={user.id} style={styles.card}>
              <View style={styles.avatar}><Text style={styles.avatarText}>{String(user.name || user.email || "?").charAt(0).toUpperCase()}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{user.name || user.username || "User"}</Text>
                <Text style={styles.email}>{user.email}</Text>
                <View style={styles.roleRow}>
                  {ROLES.map((role) => (
                    <TouchableOpacity
                      key={role}
                      onPress={() => updateRole(user, role)}
                      style={[styles.roleChip, user.role === role && styles.roleChipActive]}
                    >
                      <Text style={[styles.roleText, user.role === role && styles.roleTextActive]}>{role}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <TouchableOpacity onPress={() => removeUser(user)} style={styles.removeBtn}>
                <Trash2 size={17} color={C.status.error} />
              </TouchableOpacity>
            </View>
          ))}
          {filtered.length === 0 && <Text style={styles.emptyText}>No users found.</Text>}
        </ScrollView>
      )}

      <Modal visible={showForm} transparent animationType="slide" onRequestClose={() => setShowForm(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Cashier</Text>
              <TouchableOpacity onPress={() => setShowForm(false)} style={styles.iconBtn}><X size={20} color={C.text.primary} /></TouchableOpacity>
            </View>
            <Text style={styles.label}>Name</Text>
            <TextInput style={styles.input} value={form.name} onChangeText={(name) => setForm({ ...form, name })} placeholder="Cashier name" placeholderTextColor={C.text.secondary} />
            <Text style={styles.label}>Email *</Text>
            <TextInput style={styles.input} value={form.email} onChangeText={(email) => setForm({ ...form, email })} autoCapitalize="none" keyboardType="email-address" placeholder="cashier@business.com" placeholderTextColor={C.text.secondary} />
            <Text style={styles.label}>Temporary password</Text>
            <TextInput style={styles.input} value={form.password} onChangeText={(password) => setForm({ ...form, password })} placeholder="Defaults if empty" placeholderTextColor={C.text.secondary} secureTextEntry />
            <Text style={styles.label}>Role</Text>
            <View style={styles.formRoleRow}>
              {ROLES.map((role) => (
                <TouchableOpacity key={role} onPress={() => setForm({ ...form, role })} style={[styles.roleChip, form.role === role && styles.roleChipActive]}>
                  <Text style={[styles.roleText, form.role === role && styles.roleTextActive]}>{role}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity onPress={createUser} disabled={saving} style={styles.saveBtn}>
              {saving ? <ActivityIndicator color="#000" /> : (
                <>
                  <UserCog size={18} color="#000" />
                  <Text style={styles.saveText}>Create account</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const makeStyles = (C: any, insets: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg.base },
  header: { paddingHorizontal: 16, paddingTop: Math.max(insets.top, 12), paddingBottom: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: C.border.default },
  iconBtn: { width: 42, height: 42, borderRadius: 14, backgroundColor: C.bg.card, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.border.default },
  title: { color: C.text.primary, fontSize: 18, fontWeight: "900" },
  searchRow: { flexDirection: "row", alignItems: "center", margin: 16, marginBottom: 0, gap: 10, backgroundColor: C.bg.card, borderRadius: 16, paddingHorizontal: 14, height: 48, borderWidth: 1, borderColor: C.border.default },
  searchInput: { flex: 1, color: C.text.primary, fontSize: 14, fontWeight: "600" },
  card: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: C.bg.card, borderRadius: 16, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: C.border.default },
  avatar: { width: 42, height: 42, borderRadius: 14, backgroundColor: hexAlpha(C.amber.primary, 0.16), alignItems: "center", justifyContent: "center" },
  avatarText: { color: C.amber.primary, fontWeight: "900", fontSize: 16 },
  name: { color: C.text.primary, fontWeight: "900", fontSize: 14 },
  email: { color: C.text.secondary, fontSize: 12, marginTop: 2 },
  roleRow: { flexDirection: "row", gap: 6, marginTop: 10, flexWrap: "wrap" },
  formRoleRow: { flexDirection: "row", gap: 8, marginBottom: 18 },
  roleChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: C.bg.hover, borderWidth: 1, borderColor: C.border.default },
  roleChipActive: { backgroundColor: hexAlpha(C.amber.primary, 0.18), borderColor: C.amber.primary },
  roleText: { color: C.text.secondary, fontSize: 11, fontWeight: "800", textTransform: "uppercase" },
  roleTextActive: { color: C.amber.primary },
  removeBtn: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: hexAlpha(C.status.error, 0.08) },
  emptyText: { color: C.text.secondary, textAlign: "center", marginTop: 50, fontWeight: "700" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "flex-end" },
  modal: { backgroundColor: C.bg.base, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, borderTopWidth: 1, borderColor: C.border.default },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 18 },
  modalTitle: { color: C.text.primary, fontSize: 22, fontWeight: "900" },
  label: { color: C.text.secondary, fontSize: 12, fontWeight: "800", marginBottom: 8, marginTop: 10, textTransform: "uppercase" },
  input: { backgroundColor: C.bg.card, color: C.text.primary, borderRadius: 14, paddingHorizontal: 14, height: 50, borderWidth: 1, borderColor: C.border.default, fontSize: 15, fontWeight: "600" },
  saveBtn: { height: 56, borderRadius: 16, backgroundColor: C.amber.primary, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 10, marginTop: 10 },
  saveText: { color: "#000", fontSize: 15, fontWeight: "900", textTransform: "uppercase" },
});
