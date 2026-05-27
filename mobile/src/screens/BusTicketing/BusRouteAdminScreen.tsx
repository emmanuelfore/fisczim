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
  Platform,
  StatusBar,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBusTicketing } from '../../hooks/useBusTicketing';
import { BusRoute, TicketFieldConfig } from '../../types/busTicketing';
import { DoneTextInput as TextInput } from '../../ui/DoneTextInput';

const C = {
  bg: '#07090C',
  surface: '#111318',
  border: '#1E2128',
  amber: '#F0A500',
  fire: '#FF6B35',
  white: '#FFFFFF',
  muted: '#9CA3AF',
  success: '#22C55E',
  danger: '#EF4444',
};

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

const DEFAULT_CONFIG: TicketFieldConfig = {
  passengerName: false,
  idNumber: false,
  phone: false,
  seatNumber: false,
  dropOffPoint: false,
  dropOffPoints: [],
  requirePaymentMethod: false,
  allowMultiPassenger: false,
};

interface RouteFormState {
  origin: string;
  destination: string;
  price: string;
  currency: 'USD' | 'ZWG';
  config: TicketFieldConfig;
  newStop: string;
}

interface Props {
  onClose: () => void;
  companyId?: number | null;
}

export function BusRouteAdminScreen({ onClose, companyId }: Props) {
  const insets = useSafeAreaInsets();
  const { routes, saveRoute, updateRoute, deleteRoute, tickets } = useBusTicketing(companyId);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingRoute, setEditingRoute] = useState<BusRoute | null>(null);
  const [form, setForm] = useState<RouteFormState>({
    origin: '',
    destination: '',
    price: '',
    currency: 'USD',
    config: { ...DEFAULT_CONFIG, dropOffPoints: [] },
    newStop: '',
  });
  const swipeX = useRef<Map<string, Animated.Value>>(new Map()).current;

  function getSwipeX(id: string): Animated.Value {
    if (!swipeX.has(id)) swipeX.set(id, new Animated.Value(0));
    return swipeX.get(id)!;
  }

  function openCreate() {
    setEditingRoute(null);
    setForm({
      origin: '',
      destination: '',
      price: '',
      currency: 'USD',
      config: { ...DEFAULT_CONFIG, dropOffPoints: [] },
      newStop: '',
    });
    setModalVisible(true);
  }

  function openEdit(route: BusRoute) {
    setEditingRoute(route);
    setForm({
      origin: route.origin,
      destination: route.destination,
      price: String(route.price),
      currency: route.currency,
      config: { ...route.config, dropOffPoints: [...route.config.dropOffPoints] },
      newStop: '',
    });
    setModalVisible(true);
  }

  async function handleSave() {
    if (!form.origin.trim() || !form.destination.trim()) {
      Alert.alert('Validation', 'Origin and destination are required.');
      return;
    }
    const price = parseFloat(form.price);
    if (isNaN(price) || price <= 0) {
      Alert.alert('Validation', 'Please enter a valid price.');
      return;
    }
    const name = `${form.origin.trim()} → ${form.destination.trim()}`;
    try {
      if (editingRoute) {
        await updateRoute(editingRoute.id, {
          name,
          origin: form.origin.trim(),
          destination: form.destination.trim(),
          price,
          currency: form.currency,
          config: form.config,
        });
      } else {
        const route: BusRoute = {
          id: uuid(),
          name,
          origin: form.origin.trim(),
          destination: form.destination.trim(),
          price,
          currency: form.currency,
          isActive: true,
          config: form.config,
          createdAt: new Date().toISOString(),
        };
        await saveRoute(route);
      }
      setModalVisible(false);
    } catch (e: any) {
      Alert.alert('Route not saved', e?.message || 'Could not save route to the server.');
    }
  }

  async function handleDelete(route: BusRoute) {
    const hasTickets = tickets.some((t) => t.routeId === route.id);
    if (hasTickets) {
      Alert.alert(
        'Cannot Delete',
        `"${route.name}" has issued tickets and cannot be deleted. Deactivate it instead.`
      );
      return;
    }
    Alert.alert('Delete Route', `Delete "${route.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteRoute(route.id);
          } catch (e: any) {
            Alert.alert('Error', e.message);
          }
        },
      },
    ]);
  }

  function setConfigField(key: keyof TicketFieldConfig, value: boolean | string[]) {
    setForm((prev) => ({ ...prev, config: { ...prev.config, [key]: value } }));
  }

  function addStop() {
    const stop = form.newStop.trim();
    if (!stop) return;
    if (form.config.dropOffPoints.includes(stop)) return;
    setConfigField('dropOffPoints', [...form.config.dropOffPoints, stop]);
    setForm((prev) => ({ ...prev, newStop: '' }));
  }

  function removeStop(stop: string) {
    setConfigField('dropOffPoints', form.config.dropOffPoints.filter((s) => s !== stop));
  }

  const routeName = form.origin && form.destination
    ? `${form.origin} → ${form.destination}`
    : form.origin || 'Route Name';

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={C.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Bus Routes</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Route list */}
      <FlatList
        data={routes}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <MaterialCommunityIcons name="bus-stop" size={48} color={C.border} />
            <Text style={styles.emptyText}>No routes yet</Text>
            <Text style={styles.emptyHint}>Tap + to create your first route</Text>
          </View>
        }
        renderItem={({ item }) => {
          const swipe = getSwipeX(item.id);
          return (
            <View style={styles.rowWrapper}>
              {/* Delete revealed on slide */}
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
                  <View style={{ flex: 1 }}>
                    <Text style={styles.routeName}>{item.name}</Text>
                    <Text style={styles.routePrice}>
                      {item.currency} {item.price.toFixed(2)} per ticket
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      // Reset swipe first
                      Animated.spring(swipe, { toValue: 0, useNativeDriver: true }).start();
                    }}
                    activeOpacity={0.7}
                  >
                    <Switch
                      value={item.isActive}
                      onValueChange={(v) => updateRoute(item.id, { isActive: v })}
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

      {/* Route Form Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>
                {editingRoute ? 'Edit Route' : 'New Route'}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <MaterialCommunityIcons name="close" size={22} color={C.muted} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Route name preview */}
              <Text style={styles.routeNamePreview}>{routeName}</Text>

              <Text style={styles.label}>Origin</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Harare"
                placeholderTextColor={C.muted}
                value={form.origin}
                onChangeText={(v) => setForm((p) => ({ ...p, origin: v }))}
              />

              <Text style={styles.label}>Destination</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Bulawayo"
                placeholderTextColor={C.muted}
                value={form.destination}
                onChangeText={(v) => setForm((p) => ({ ...p, destination: v }))}
              />

              <Text style={styles.label}>Price</Text>
              <View style={styles.priceRow}>
                <TextInput
                  style={[styles.input, { flex: 1, marginBottom: 0 }]}
                  placeholder="0.00"
                  placeholderTextColor={C.muted}
                  keyboardType="decimal-pad"
                  value={form.price}
                  onChangeText={(v) => setForm((p) => ({ ...p, price: v }))}
                />
                <TouchableOpacity
                  style={[styles.pill, form.currency === 'USD' && styles.pillActive]}
                  onPress={() => setForm((p) => ({ ...p, currency: 'USD' }))}
                >
                  <Text style={[styles.pillText, form.currency === 'USD' && styles.pillTextActive]}>USD</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.pill, form.currency === 'ZWG' && styles.pillActive]}
                  onPress={() => setForm((p) => ({ ...p, currency: 'ZWG' }))}
                >
                  <Text style={[styles.pillText, form.currency === 'ZWG' && styles.pillTextActive]}>ZWG</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.sectionHeader}>OPTIONAL FIELDS</Text>
              <Text style={styles.sectionHint}>Toggle which details conductors must collect per ticket</Text>

              {([
                ['passengerName', 'Passenger Name', 'account-outline'],
                ['idNumber', 'ID Number', 'card-account-details-outline'],
                ['phone', 'Phone Number', 'phone-outline'],
                ['seatNumber', 'Seat Number', 'seat-outline'],
                ['dropOffPoint', 'Drop-off Point', 'map-marker-outline'],
                ['requirePaymentMethod', 'Require Payment Method', 'credit-card-outline'],
                ['allowMultiPassenger', 'Allow Multiple Passengers', 'account-group-outline'],
              ] as [keyof TicketFieldConfig, string, string][]).map(([key, label, icon]) => (
                <View key={key}>
                  <View style={styles.toggleRow}>
                    <View style={styles.toggleLeft}>
                      <MaterialCommunityIcons name={icon as any} size={20} color={C.muted} />
                      <Text style={styles.toggleLabel}>{label}</Text>
                    </View>
                    <Switch
                      value={Boolean(form.config[key])}
                      onValueChange={(v) => setConfigField(key, v)}
                      trackColor={{ false: C.border, true: C.amber }}
                      thumbColor={form.config[key] ? '#FFF' : C.muted}
                    />
                  </View>

                  {/* Drop-off sub-section */}
                  {key === 'dropOffPoint' && form.config.dropOffPoint && (
                    <View style={styles.subSection}>
                      {form.config.dropOffPoints.map((stop) => (
                        <View key={stop} style={styles.stopChip}>
                          <Text style={styles.stopChipText}>{stop}</Text>
                          <TouchableOpacity onPress={() => removeStop(stop)}>
                            <MaterialCommunityIcons name="close" size={14} color={C.muted} />
                          </TouchableOpacity>
                        </View>
                      ))}
                      <View style={styles.addStopRow}>
                        <TextInput
                          style={[styles.input, { flex: 1, marginBottom: 0, height: 40 }]}
                          placeholder="Add stop name"
                          placeholderTextColor={C.muted}
                          value={form.newStop}
                          onChangeText={(v) => setForm((p) => ({ ...p, newStop: v }))}
                          onSubmitEditing={addStop}
                          returnKeyType="done"
                        />
                        <TouchableOpacity style={styles.addStopBtn} onPress={addStop}>
                          <Text style={styles.addStopBtnText}>Add</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              ))}

              <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
                <Text style={styles.saveBtnText}>
                  {editingRoute ? 'Save Changes' : 'Create Route'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </ScrollView>
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
  rowContent: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  routeName: { color: C.white, fontSize: 15, fontWeight: '700', marginBottom: 4 },
  routePrice: { color: C.amber, fontSize: 13, fontWeight: '600' },
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
    paddingHorizontal: 20, paddingTop: 12, maxHeight: '92%',
  },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.border, alignSelf: 'center', marginBottom: 16 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  sheetTitle: { color: C.white, fontSize: 18, fontWeight: '800' },
  routeNamePreview: {
    color: C.amber, fontSize: 16, fontWeight: '700', textAlign: 'center',
    marginBottom: 20, backgroundColor: 'rgba(240,165,0,0.1)',
    paddingVertical: 10, borderRadius: 10,
  },
  label: { color: C.muted, fontSize: 12, fontWeight: '700', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    backgroundColor: C.bg, color: C.white, borderWidth: 1, borderColor: C.border,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, marginBottom: 16,
  },
  priceRow: { flexDirection: 'row', gap: 8, marginBottom: 16, alignItems: 'center' },
  pill: {
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10,
    borderWidth: 1, borderColor: C.border,
  },
  pillActive: { backgroundColor: C.amber, borderColor: C.amber },
  pillText: { color: C.muted, fontWeight: '700', fontSize: 13 },
  pillTextActive: { color: '#000' },
  sectionHeader: {
    color: C.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1.2,
    marginTop: 8, marginBottom: 4, textTransform: 'uppercase',
  },
  sectionHint: { color: C.muted, fontSize: 12, marginBottom: 16 },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  toggleLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  toggleLabel: { color: C.white, fontSize: 14, fontWeight: '600' },
  subSection: {
    backgroundColor: C.bg, borderRadius: 10, padding: 12, marginVertical: 8,
    marginLeft: 20, gap: 8,
  },
  stopChip: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: C.surface, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
  },
  stopChipText: { color: C.white, fontSize: 13 },
  addStopRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  addStopBtn: {
    backgroundColor: C.amber, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10,
  },
  addStopBtnText: { color: '#000', fontWeight: '800', fontSize: 13 },
  saveBtn: {
    backgroundColor: C.amber, borderRadius: 12, paddingVertical: 16,
    alignItems: 'center', marginTop: 24, marginBottom: 12,
  },
  saveBtnText: { color: '#000', fontWeight: '900', fontSize: 16 },
  cancelBtn: { alignItems: 'center', paddingVertical: 12 },
  cancelBtnText: { color: C.muted, fontSize: 14 },
});
