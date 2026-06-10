import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Alert, Modal, ScrollView, TextInput, StatusBar,
  ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBusTicketing } from '../../hooks/useBusTicketing';
import { Conductor } from '../../types/busTicketing';
import { apiFetch, apiJson } from '../../lib/api';
import { type BusColors, useBusColors } from './theme';

interface Props {
  onClose: () => void;
  companyId?: number | null;
}

type CashierConductor = Conductor & {
  email?: string;
  username?: string;
  role?: string;
};

export function ConductorManagementScreen({ onClose, companyId }: Props) {
  const insets = useSafeAreaInsets();
  const C = useBusColors();
  const styles = makeStyles(C);
  const { conductors, saveConductor, setActiveConductor, activeConductor } = useBusTicketing(companyId);
  const [cashiers, setCashiers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<Conductor | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('Zimra123!');

  const syncCashierToConductor = useCallback(async (user: any) => {
    const conductor: Conductor = {
      id: String(user.id),
      name: user.name || user.username || user.email?.split('@')[0] || 'Conductor',
      phone: user.phone || undefined,
      isActive: true,
    };
    await saveConductor(conductor);
    return conductor;
  }, [saveConductor]);

  const loadCashiers = useCallback(async () => {
    if (!companyId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const users = await apiJson<any[]>(`/api/companies/${companyId}/users`);
      const nextCashiers = users.filter((user) => String(user.role || '').toLowerCase() === 'cashier');
      setCashiers(nextCashiers);
      for (const user of nextCashiers) {
        await syncCashierToConductor(user);
      }
    } catch (e: any) {
      Alert.alert('Conductors', e?.message || 'Failed to load cashier accounts.');
    } finally {
      setLoading(false);
    }
  }, [companyId, syncCashierToConductor]);

  useEffect(() => {
    loadCashiers();
  }, [loadCashiers]);

  const conductorById = useMemo(() => {
    return new Map(conductors.map((conductor) => [conductor.id, conductor]));
  }, [conductors]);

  const visibleConductors = useMemo<CashierConductor[]>(() => {
    const q = search.trim().toLowerCase();
    const fromCashiers: CashierConductor[] = cashiers.map((user) => conductorById.get(String(user.id)) ?? {
      id: String(user.id),
      name: user.name || user.username || user.email?.split('@')[0] || 'Conductor',
      phone: user.phone || undefined,
      isActive: true,
    }).map((conductor) => {
      const user = cashiers.find((item) => String(item.id) === conductor.id);
      return {
        ...conductor,
        email: user?.email,
        username: user?.username,
        role: user?.role,
      };
    });
    const localOnly: CashierConductor[] = conductors
      .filter((conductor) => !cashiers.some((user) => String(user.id) === conductor.id))
      .filter((conductor) => !conductor.id.startsWith('cashier-'));
    return [...fromCashiers, ...localOnly].filter((conductor) => {
      if (!q) return true;
      return [conductor.name, conductor.email, conductor.username, conductor.phone, conductor.id].some((value) => String(value || '').toLowerCase().includes(q));
    });
  }, [cashiers, conductorById, conductors, search]);

  function openCreate() {
    setEditing(null); setName(''); setEmail(''); setUsername(''); setPhone(''); setPassword('Zimra123!');
    setModalVisible(true);
  }

  function openEdit(c: Conductor) {
    setEditing(c); setName(c.name); setEmail(''); setUsername(''); setPhone(c.phone ?? ''); setPassword('Zimra123!');
    setModalVisible(true);
  }

  async function handleSave() {
    if (!name.trim()) { Alert.alert('Validation', 'Name is required.'); return; }
    setSaving(true);
    try {
      if (editing) {
        await saveConductor({ ...editing, name: name.trim(), phone: phone.trim() || undefined });
        setModalVisible(false);
        return;
      }
      if (!email.trim()) {
        Alert.alert('Email required', 'Enter the cashier email address for this conductor.');
        return;
      }
      if (!companyId) {
        Alert.alert('Company missing', 'Select a company before adding conductors.');
        return;
      }
      const res = await apiFetch(`/api/companies/${companyId}/users`, {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim(),
          name: name.trim(),
          username: username.trim() || email.trim().split('@')[0],
          password: password.trim() || 'Zimra123!',
          role: 'cashier',
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || 'Could not create cashier account.');
      }
      setModalVisible(false);
      setName(''); setEmail(''); setUsername(''); setPhone(''); setPassword('Zimra123!');
      await loadCashiers();
      Alert.alert('Conductor added', 'Cashier account created and added as a conductor.');
    } catch (e: any) {
      Alert.alert('Could not add conductor', e?.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSetActive(c: Conductor) {
    await setActiveConductor(c.id);
  }

  async function handleDeactivate(c: Conductor) {
    await saveConductor({ ...c, isActive: false });
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle={C.statusBarStyle} backgroundColor={C.bg} />
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={C.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Conductors</Text>
        <TouchableOpacity onPress={loadCashiers} style={styles.backBtn}>
          <MaterialCommunityIcons name="refresh" size={20} color={C.amber} />
        </TouchableOpacity>
      </View>

      <View style={styles.searchRow}>
        <MaterialCommunityIcons name="magnify" size={18} color={C.muted} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search conductors..."
          placeholderTextColor={C.muted}
        />
      </View>

      {loading ? (
        <ActivityIndicator color={C.amber} style={{ marginTop: 40 }} />
      ) : <FlatList
        data={visibleConductors}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <MaterialCommunityIcons name="account-group-outline" size={48} color={C.border} />
            <Text style={styles.emptyText}>No conductors yet</Text>
          </View>
        }
        renderItem={({ item }) => {
          const isActive = activeConductor?.id === item.id;
          return (
            <View style={[styles.row, isActive && styles.rowActive]}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.phone}>{item.email || item.username || 'Cashier account'}</Text>
                {item.username ? <Text style={styles.meta}>Username: {item.username}</Text> : null}
                {isActive && (
                  <View style={styles.activeBadge}>
                    <Text style={styles.activeBadgeText}>ACTIVE CONDUCTOR</Text>
                  </View>
                )}
              </View>
              <View style={styles.actions}>
                {!isActive && (
                  <TouchableOpacity style={styles.setActiveBtn} onPress={() => handleSetActive(item)}>
                    <Text style={styles.setActiveBtnText}>Set Active</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.editBtn} onPress={() => openEdit(item)}>
                  <MaterialCommunityIcons name="pencil-outline" size={18} color={C.muted} />
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
      />}

      <TouchableOpacity style={[styles.fab, { bottom: insets.bottom + 24 }]} onPress={openCreate}>
        <MaterialCommunityIcons name="plus" size={28} color="#000" />
      </TouchableOpacity>

      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{editing ? 'Edit Conductor' : 'Add Conductor'}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <MaterialCommunityIcons name="close" size={22} color={C.muted} />
              </TouchableOpacity>
            </View>
            <Text style={styles.label}>Full Name</Text>
            <TextInput
              style={styles.input} placeholder="e.g. John Moyo"
              placeholderTextColor={C.muted} value={name}
              onChangeText={setName}
            />
            {!editing && (
              <>
                <Text style={styles.label}>Email</Text>
                <TextInput
                  style={styles.input} placeholder="conductor@business.com"
                  placeholderTextColor={C.muted} value={email}
                  onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none"
                />
                <Text style={styles.label}>Username</Text>
                <TextInput
                  style={styles.input} placeholder="tawanda"
                  placeholderTextColor={C.muted} value={username}
                  onChangeText={setUsername} autoCapitalize="none"
                />
                <Text style={styles.label}>Initial Password</Text>
                <TextInput
                  style={styles.input} placeholder="Zimra123!"
                  placeholderTextColor={C.muted} value={password}
                  onChangeText={setPassword} secureTextEntry
                />
              </>
            )}
            <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.7 }]} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator color="#000" /> : <Text style={styles.saveBtnText}>{editing ? 'Save Changes' : 'Add Conductor'}</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const makeStyles = (C: BusColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: C.white, fontSize: 18, fontWeight: '800' },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    margin: 16, marginBottom: 0, paddingHorizontal: 14, height: 46,
    borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
  },
  searchInput: { flex: 1, color: C.white, fontSize: 14, fontWeight: '600' },
  empty: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyText: { color: C.white, fontSize: 16, fontWeight: '700' },
  row: {
    backgroundColor: C.surface, borderRadius: 12, padding: 16,
    flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 10,
    borderWidth: 1, borderColor: C.border,
  },
  rowActive: { borderColor: C.amber },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: C.amber, alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: '#000', fontWeight: '900', fontSize: 18 },
  name: { color: C.white, fontSize: 15, fontWeight: '700' },
  phone: { color: C.muted, fontSize: 12, marginTop: 2 },
  meta: { color: C.muted, fontSize: 11, marginTop: 2 },
  activeBadge: {
    marginTop: 6, backgroundColor: C.amberSoft,
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start',
  },
  activeBadgeText: { color: C.amber, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  setActiveBtn: {
    backgroundColor: C.amber, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6,
  },
  setActiveBtnText: { color: '#000', fontWeight: '800', fontSize: 12 },
  editBtn: {
    width: 34, height: 34, borderRadius: 8, backgroundColor: C.bg,
    alignItems: 'center', justifyContent: 'center',
  },
  fab: {
    position: 'absolute', right: 20, width: 56, height: 56,
    borderRadius: 28, backgroundColor: C.amber,
    alignItems: 'center', justifyContent: 'center',
    elevation: 6, shadowColor: C.amber, shadowOpacity: 0.4, shadowRadius: 10,
  },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: C.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20, paddingTop: 12,
  },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.border, alignSelf: 'center', marginBottom: 16 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  sheetTitle: { color: C.white, fontSize: 18, fontWeight: '800' },
  label: { color: C.muted, fontSize: 12, fontWeight: '700', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    backgroundColor: C.bg, color: C.white, borderWidth: 1, borderColor: C.border,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 16,
  },
  saveBtn: {
    backgroundColor: C.amber, borderRadius: 12, paddingVertical: 16,
    alignItems: 'center', marginTop: 8, marginBottom: 12,
  },
  saveBtnText: { color: '#000', fontWeight: '900', fontSize: 16 },
  cancelBtn: { alignItems: 'center', paddingVertical: 12 },
  cancelBtnText: { color: C.muted, fontSize: 14 },
});
