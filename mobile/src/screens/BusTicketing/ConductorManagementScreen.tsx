import React, { useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Alert, Modal, ScrollView, TextInput, StatusBar,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBusTicketing } from '../../hooks/useBusTicketing';
import { Conductor } from '../../types/busTicketing';

const C = {
  bg: '#07090C', surface: '#111318', border: '#1E2128',
  amber: '#F0A500', fire: '#FF6B35', white: '#FFFFFF',
  muted: '#9CA3AF', success: '#22C55E', danger: '#EF4444',
};

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

interface Props { onClose: () => void; }

export function ConductorManagementScreen({ onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { conductors, saveConductor, setActiveConductor, activeConductor } = useBusTicketing();
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<Conductor | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  function openCreate() {
    setEditing(null); setName(''); setPhone('');
    setModalVisible(true);
  }

  function openEdit(c: Conductor) {
    setEditing(c); setName(c.name); setPhone(c.phone ?? '');
    setModalVisible(true);
  }

  async function handleSave() {
    if (!name.trim()) { Alert.alert('Validation', 'Name is required.'); return; }
    const conductor: Conductor = {
      id: editing?.id ?? uuid(),
      name: name.trim(),
      phone: phone.trim() || undefined,
      isActive: editing?.isActive ?? true,
    };
    await saveConductor(conductor);
    setModalVisible(false);
  }

  async function handleSetActive(c: Conductor) {
    await setActiveConductor(c.id);
  }

  async function handleDeactivate(c: Conductor) {
    await saveConductor({ ...c, isActive: false });
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={C.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Conductors</Text>
        <View style={{ width: 40 }} />
      </View>

      <FlatList
        data={conductors}
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
                {item.phone ? <Text style={styles.phone}>{item.phone}</Text> : null}
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
      />

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
            <Text style={styles.label}>Phone (optional)</Text>
            <TextInput
              style={styles.input} placeholder="+263 77 123 4567"
              placeholderTextColor={C.muted} value={phone}
              onChangeText={setPhone} keyboardType="phone-pad"
            />
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
              <Text style={styles.saveBtnText}>{editing ? 'Save Changes' : 'Add Conductor'}</Text>
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: C.white, fontSize: 18, fontWeight: '800' },
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
  activeBadge: {
    marginTop: 6, backgroundColor: 'rgba(240,165,0,0.15)',
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
