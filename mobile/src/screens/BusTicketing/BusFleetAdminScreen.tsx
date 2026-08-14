import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  ScrollView,
  Switch,
  Animated,
  StatusBar,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBusTicketing } from '../../hooks/useBusTicketing';
import { BusVehicle } from '../../types/busTicketing';
import { DoneTextInput as TextInput } from '../../ui/DoneTextInput';
import { type BusColors, useBusColors } from './theme';

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

interface Props {
  onClose: () => void;
  companyId?: number | null;
}

export function BusFleetAdminScreen({ onClose, companyId }: Props) {
  const insets = useSafeAreaInsets();
  const C = useBusColors();
  const styles = makeStyles(C);
  const { vehicles, trips, saveVehicle, updateVehicle, deleteVehicle } = useBusTicketing(companyId);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<BusVehicle | null>(null);
  
  const [regNo, setRegNo] = useState('');
  const [model, setModel] = useState('');
  const [fleetNumber, setFleetNumber] = useState('');
  const [capacity, setCapacity] = useState('');
  const [isActive, setIsActive] = useState(true);

  const swipeX = useRef<Map<string, Animated.Value>>(new Map()).current;

  function getSwipeX(id: string): Animated.Value {
    if (!swipeX.has(id)) swipeX.set(id, new Animated.Value(0));
    return swipeX.get(id)!;
  }

  function openCreate() {
    setEditingVehicle(null);
    setRegNo('');
    setModel('');
    setFleetNumber('');
    setCapacity('');
    setIsActive(true);
    setModalVisible(true);
  }

  function openEdit(vehicle: BusVehicle) {
    setEditingVehicle(vehicle);
    setRegNo(vehicle.registrationNumber);
    setModel(vehicle.model ?? '');
    setFleetNumber(vehicle.fleetNumber ?? '');
    setCapacity(vehicle.capacity ? String(vehicle.capacity) : '');
    setIsActive(vehicle.isActive);
    setModalVisible(true);
  }

  async function handleSave() {
    const reg = regNo.trim().toUpperCase();
    if (!reg) {
      Alert.alert('Validation', 'Registration number is required.');
      return;
    }
    
    const cap = parseInt(capacity, 10);
    if (isNaN(cap) || cap <= 0) {
      Alert.alert('Validation', 'Seating capacity must be a positive number.');
      return;
    }

    try {
      if (editingVehicle) {
        await updateVehicle(editingVehicle.id, {
          registrationNumber: reg,
          model: model.trim() || undefined,
          fleetNumber: fleetNumber.trim() || undefined,
          capacity: cap,
          isActive,
        });
      } else {
        const vehicle: BusVehicle = {
          id: uuid(),
          registrationNumber: reg,
          model: model.trim() || undefined,
          fleetNumber: fleetNumber.trim() || undefined,
          capacity: cap,
          isActive,
          createdAt: new Date().toISOString(),
        };
        await saveVehicle(vehicle);
      }
      setModalVisible(false);
    } catch (e: any) {
      Alert.alert('Vehicle not saved', e?.message || 'Could not save vehicle to the server.');
    }
  }

  async function handleDelete(vehicle: BusVehicle) {
    const hasTrips = trips.some((t) => t.vehicleId === vehicle.id);
    if (hasTrips) {
      Alert.alert(
        'Cannot Delete',
        `${vehicle.registrationNumber} has associated trips and cannot be deleted. Deactivate it instead.`
      );
      return;
    }
    
    Alert.alert('Delete Vehicle', `Delete ${vehicle.registrationNumber}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteVehicle(vehicle.id);
          } catch (e: any) {
            Alert.alert('Error', e.message);
          }
        },
      },
    ]);
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle={C.statusBarStyle} backgroundColor={C.bg} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={C.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Bus Fleet</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Vehicle list */}
      <FlatList
        data={vehicles}
        keyExtractor={(v) => v.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <MaterialCommunityIcons name="bus-multiple" size={48} color={C.border} />
            <Text style={styles.emptyText}>No vehicles yet</Text>
            <Text style={styles.emptyHint}>Tap + to add a vehicle to your fleet</Text>
          </View>
        }
        renderItem={({ item }) => {
          const swipe = getSwipeX(item.id);
          return (
            <View style={styles.rowWrapper}>
              <TouchableOpacity
                style={styles.deleteSlide}
                onPress={() => handleDelete(item)}
              >
                <MaterialCommunityIcons name="trash-can-outline" size={22} color={C.white} />
                <Text style={styles.deleteSlideText}>Delete</Text>
              </TouchableOpacity>

              <Animated.View
                style={[styles.row, { transform: [{ translateX: swipe }], borderLeftColor: item.isActive ? C.amber : C.border }]}
              >
                <TouchableOpacity
                  style={styles.rowContent}
                  onPress={() => openEdit(item)}
                  onLongPress={() => {
                    Animated.spring(swipe, { toValue: -80, useNativeDriver: true }).start();
                  }}
                  activeOpacity={0.8}
                >
                  <View style={styles.iconBox}>
                    <MaterialCommunityIcons name="bus" size={24} color={item.isActive ? C.amber : C.muted} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.regText, !item.isActive && { color: C.muted }]}>
                      {item.registrationNumber}
                    </Text>
                    <Text style={styles.subText}>
                      {[item.model, item.fleetNumber ? `Fleet ${item.fleetNumber}` : null].filter(Boolean).join(' · ')}
                    </Text>
                    <Text style={styles.subText}>
                      Capacity: {item.capacity ? `${item.capacity} seats` : 'Not set'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      Animated.spring(swipe, { toValue: 0, useNativeDriver: true }).start();
                    }}
                    activeOpacity={0.7}
                  >
                    <Switch
                      value={item.isActive}
                      onValueChange={(v) => updateVehicle(item.id, { isActive: v })}
                      trackColor={{ false: C.border, true: C.amber }}
                      thumbColor={item.isActive ? '#FFF' : C.muted}
                    />
                  </TouchableOpacity>
                </TouchableOpacity>
              </Animated.View>
            </View>
          );
        }}
      />

      {/* FAB */}
      <TouchableOpacity style={[styles.fab, { bottom: insets.bottom + 24 }]} onPress={openCreate}>
        <MaterialCommunityIcons name="plus" size={28} color="#000" />
      </TouchableOpacity>

      {/* Form Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>
                {editingVehicle ? 'Edit Vehicle' : 'Add Vehicle'}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <MaterialCommunityIcons name="close" size={22} color={C.muted} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.label}>Registration Number</Text>
              <TextInput
                style={[styles.input, { textTransform: 'uppercase' }]}
                placeholder="e.g. AB123 CD"
                placeholderTextColor={C.muted}
                value={regNo}
                onChangeText={setRegNo}
                autoCapitalize="characters"
              />

              <Text style={styles.label}>Model</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Marcopolo Paradiso"
                placeholderTextColor={C.muted}
                value={model}
                onChangeText={setModel}
              />

              <Text style={styles.label}>Fleet Number</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. FL-042"
                placeholderTextColor={C.muted}
                value={fleetNumber}
                onChangeText={setFleetNumber}
              />

              <Text style={styles.label}>Seating Capacity</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 64"
                placeholderTextColor={C.muted}
                keyboardType="number-pad"
                value={capacity}
                onChangeText={setCapacity}
              />
              
              <View style={styles.toggleRow}>
                <View style={styles.toggleLeft}>
                  <MaterialCommunityIcons name="check-circle-outline" size={20} color={C.muted} />
                  <Text style={styles.toggleLabel}>Active Status</Text>
                </View>
                <Switch
                  value={isActive}
                  onValueChange={setIsActive}
                  trackColor={{ false: C.border, true: C.amber }}
                  thumbColor={isActive ? '#FFF' : C.muted}
                />
              </View>

              <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
                <Text style={styles.saveBtnText}>
                  {editingVehicle ? 'Save Changes' : 'Add Vehicle'}
                </Text>
              </TouchableOpacity>
            </ScrollView>
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
  empty: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyText: { color: C.white, fontSize: 16, fontWeight: '700' },
  emptyHint: { color: C.muted, fontSize: 13 },
  rowWrapper: { marginBottom: 10, position: 'relative' },
  deleteSlide: {
    position: 'absolute', right: 0, top: 0, bottom: 0, width: 80,
    backgroundColor: C.fire, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  deleteSlideText: { color: C.white, fontSize: 11, fontWeight: '700', marginTop: 2 },
  row: {
    backgroundColor: C.surface, borderRadius: 12,
    borderLeftWidth: 4, overflow: 'hidden',
  },
  rowContent: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14 },
  iconBox: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: C.surfaceAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  regText: { color: C.white, fontSize: 16, fontWeight: '800', marginBottom: 4 },
  subText: { color: C.muted, fontSize: 13, fontWeight: '500' },
  fab: {
    position: 'absolute', right: 20, width: 56, height: 56,
    borderRadius: 28, backgroundColor: C.amber,
    alignItems: 'center', justifyContent: 'center',
    elevation: 6, shadowColor: C.amber, shadowOpacity: 0.4, shadowRadius: 10,
  },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20, paddingTop: 12, maxHeight: '90%',
  },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.border, alignSelf: 'center', marginBottom: 16 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  sheetTitle: { color: C.white, fontSize: 18, fontWeight: '800' },
  label: { color: C.muted, fontSize: 12, fontWeight: '700', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    backgroundColor: C.bg, color: C.white, borderWidth: 1, borderColor: C.border,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 14,
    fontSize: 16, marginBottom: 20, fontWeight: '600'
  },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, borderTopWidth: 1, borderTopColor: C.border, marginTop: 4
  },
  toggleLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  toggleLabel: { color: C.white, fontSize: 15, fontWeight: '600' },
  saveBtn: {
    backgroundColor: C.amber, borderRadius: 12, paddingVertical: 16,
    alignItems: 'center', marginTop: 30, marginBottom: 12,
  },
  saveBtnText: { color: '#000', fontWeight: '900', fontSize: 16 },
});
