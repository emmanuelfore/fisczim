import React, { useMemo,  useState, useRef } from 'react';
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
import { BusRoute, DropOffPoint, TicketFieldConfig, RouteFareMatrix } from '../../types/busTicketing';
import { DoneTextInput as TextInput } from '../../ui/DoneTextInput';
import { type BusColors, useBusColors } from './theme';
import { ZIMBABWE_CITIES } from '../../../../shared/zimbabwe-cities';

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

const DEFAULT_CONFIG: TicketFieldConfig = {
  passengerName: true,
  idNumber: false,
  phone: true,
  seatNumber: false,
  dropOffPoint: true,
  dropOffPoints: [],
  stops: [],
  fares: {},
  requirePaymentMethod: true,
  allowMultiPassenger: true,
};

function fareKey(from: string, to: string): string {
  return `${from}|${to}`;
}

// Suggest an inter-stop price by splitting basePrice across segments equally.
function suggestFare(stops: string[], basePrice: number, from: string, to: string): number {
  const n = stops.length;
  if (n < 2 || !(basePrice > 0)) return basePrice || 0;
  const i = stops.indexOf(from);
  const j = stops.indexOf(to);
  if (i < 0 || j < 0) return basePrice || 0;
  const segments = n - 1;
  return Math.round((basePrice * Math.abs(j - i) / segments) * 100) / 100;
}

function stopPairs(stops: string[]): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  for (let i = 0; i < stops.length; i++) {
    for (let j = i + 1; j < stops.length; j++) {
      pairs.push([stops[i], stops[j]]);
    }
  }
  return pairs;
}

// Ensures the stops list is well-formed: endpoints match origin/destination,
// no duplicates, at least two entries.
function ensureStopsEndpoints(stops: string[] | undefined, origin: string, destination: string): string[] {
  const src = stops && stops.length >= 2 ? stops.slice() : [origin, destination];
  src[0] = origin;
  src[src.length - 1] = destination;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const stop of src) {
    if (!stop.trim()) continue;
    if (seen.has(stop)) continue;
    seen.add(stop);
    out.push(stop);
  }
  if (out.length < 2) return [origin, destination];
  return out;
}

interface RouteFormState {
  origin: string;
  destination: string;
  price: string;
  currency: 'USD' | 'ZWG';
  config: TicketFieldConfig;
  newStop: string;
  newStopPrice: string;
  showOriginPicker: boolean;
  showDestinationPicker: boolean;
}

interface Props {
  onClose: () => void;
  companyId?: number | null;
}

export function BusRouteAdminScreen({ onClose, companyId }: Props) {
  const insets = useSafeAreaInsets();
  const C = useBusColors();
  const styles = useMemo(() => makeStyles(C), [C]);
  const { routes, saveRoute, updateRoute, deleteRoute, tickets } = useBusTicketing(companyId);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingRoute, setEditingRoute] = useState<BusRoute | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<RouteFormState>({
    origin: '',
    destination: '',
    price: '',
    currency: 'USD',
    config: { ...DEFAULT_CONFIG, dropOffPoints: [] },
    newStop: '',
    newStopPrice: '',
    showOriginPicker: false,
    showDestinationPicker: false,
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
      config: { ...DEFAULT_CONFIG, stops: [], fares: {} },
      newStop: '',
      newStopPrice: '',
      showOriginPicker: false,
      showDestinationPicker: false,
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
      config: {
        ...route.config,
        dropOffPoints: Array.isArray(route.config.dropOffPoints)
          ? route.config.dropOffPoints.map((stop: any) =>
              typeof stop === 'string' ? { name: stop, price: route.price } : stop
            )
          : [],
        stops: Array.isArray(route.config.stops) && route.config.stops.length >= 2
          ? route.config.stops.map((s: any) => String(s))
          : [route.origin, route.destination],
        fares: route.config.fares && typeof route.config.fares === 'object'
          ? route.config.fares as RouteFareMatrix
          : {},
      },
      newStop: '',
      newStopPrice: '',
      showOriginPicker: false,
      showDestinationPicker: false,
    });
    setModalVisible(true);
  }

  async function handleSave() {
    if (saving) return;
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
    
    // Check for duplicate routes (only for new routes, not edits)
    if (!editingRoute) {
      const isDuplicate = routes.some(
        (route) =>
          (route.origin === form.origin.trim() && route.destination === form.destination.trim()) ||
          (route.origin === form.destination.trim() && route.destination === form.origin.trim())
      );
      
      if (isDuplicate) {
        Alert.alert('Duplicate Route', 'A route between these cities already exists.');
        return;
      }
    }
    
    const stops = ensureStopsEndpoints(form.config.stops, form.origin.trim(), form.destination.trim());
    const fares: RouteFareMatrix = {};
    for (const [from, to] of stopPairs(stops)) {
      const value = form.config.fares?.[fareKey(from, to)] ?? form.config.fares?.[fareKey(to, from)];
      if (typeof value === 'number' && Number.isFinite(value)) {
        fares[fareKey(from, to)] = value;
      }
    }
    // Derive legacy dropOffPoints for backward compatibility with older screens.
    const dropOffPoints = stops.slice(1).map((stop) => ({
      name: stop,
      price: fares[fareKey(stops[0], stop)] ?? price,
    }));
    const config: TicketFieldConfig = {
      ...form.config,
      stops,
      fares,
      dropOffPoints,
    };
    
    setSaving(true);
    try {
      if (editingRoute) {
        await updateRoute(editingRoute.id, {
          name,
          origin: form.origin.trim(),
          destination: form.destination.trim(),
          price,
          currency: form.currency,
          config,
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
          config,
          createdAt: new Date().toISOString(),
        };
        await saveRoute(route);
      }
      setModalVisible(false);
    } catch (e: any) {
      Alert.alert('Route not saved', e?.message || 'Could not save route to the server.');
    } finally {
      setSaving(false);
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

  function setConfigField(key: keyof TicketFieldConfig, value: boolean | string[] | DropOffPoint[] | RouteFareMatrix | undefined) {
    setForm((prev) => ({ ...prev, config: { ...prev.config, [key]: value } }));
  }

  function addStop() {
    const stop = form.newStop.trim();
    if (!stop) return;
    const stops = ensureStopsEndpoints(form.config.stops, form.origin, form.destination);
    if (stops.includes(stop)) return;
    const updated = [...stops];
    updated.splice(updated.length - 1, 0, stop);
    setConfigField('stops', updated);
    setForm((prev) => ({ ...prev, newStop: '' }));
  }

  function removeStop(stopName: string) {
    const stops = ensureStopsEndpoints(form.config.stops, form.origin, form.destination);
    const updated = stops.filter((s: string) => s !== stopName);
    if (updated.length < 2) return;
    setConfigField('stops', ensureStopsEndpoints(updated, form.origin, form.destination));
    const fares: RouteFareMatrix = {};
    for (const key of Object.keys(form.config.fares || {})) {
      const [from, to] = key.split('|');
      if (from !== stopName && to !== stopName) fares[key] = form.config.fares![key];
    }
    setConfigField('fares', fares);
  }

  function setFare(from: string, to: string, value: string) {
    const parsed = parseFloat(value);
    const fares: RouteFareMatrix = { ...(form.config.fares || {}) };
    if (value === '' || isNaN(parsed)) {
      delete fares[fareKey(from, to)];
      delete fares[fareKey(to, from)];
    } else {
      fares[fareKey(from, to)] = parsed;
    }
    setConfigField('fares', fares);
  }

  function autoFillFares() {
    const stops = ensureStopsEndpoints(form.config.stops, form.origin, form.destination);
    const price = parseFloat(form.price) || 0;
    const fares: RouteFareMatrix = {};
    for (const [from, to] of stopPairs(stops)) {
      fares[fareKey(from, to)] = suggestFare(stops, price, from, to);
    }
    setConfigField('stops', stops);
    setConfigField('fares', fares);
  }

  function fareFor(from: string, to: string): number | undefined {
    const value = form.config.fares?.[fareKey(from, to)] ?? form.config.fares?.[fareKey(to, from)];
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  }

  const routeName = form.origin && form.destination
    ? `${form.origin} → ${form.destination}`
    : form.origin || 'Route Name';

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle={C.statusBarStyle} backgroundColor={C.bg} />

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
              <TouchableOpacity
                style={styles.input}
                onPress={() => setForm((p) => ({ ...p, showOriginPicker: true }))}
              >
                <Text style={[styles.inputText, form.origin ? styles.inputTextActive : styles.inputTextPlaceholder]}>
                  {form.origin || 'Select origin city'}
                </Text>
                <MaterialCommunityIcons name="chevron-down" size={20} color={C.muted} />
              </TouchableOpacity>

              <Text style={styles.label}>Destination</Text>
              <TouchableOpacity
                style={styles.input}
                onPress={() => setForm((p) => ({ ...p, showDestinationPicker: true }))}
              >
                <Text style={[styles.inputText, form.destination ? styles.inputTextActive : styles.inputTextPlaceholder]}>
                  {form.destination || 'Select destination city'}
                </Text>
                <MaterialCommunityIcons name="chevron-down" size={20} color={C.muted} />
              </TouchableOpacity>

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

                  {/* Drop-off sub-section: ordered stops + fare matrix */}
                  {key === 'dropOffPoint' && (
                    <View style={styles.subSection}>
                      <Text style={styles.stopSectionLabel}>Stops in order</Text>
                      {ensureStopsEndpoints(form.config.stops, form.origin, form.destination).map((stop: string, idx: number, list: string[]) => {
                        const isEndpoint = idx === 0 || idx === list.length - 1;
                        return (
                          <View key={`${stop}-${idx}`} style={styles.stopChip}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.stopChipText}>
                                {isEndpoint ? (idx === 0 ? '🚌 ' : '🏁 ') : '📍 '}{stop}
                              </Text>
                              {!isEndpoint && form.config.fares?.[fareKey(list[0], stop)] !== undefined && (
                                <Text style={styles.stopPriceText}>
                                  {form.currency} {form.config.fares![fareKey(list[0], stop)].toFixed(2)} from origin
                                </Text>
                              )}
                            </View>
                            {!isEndpoint && (
                              <TouchableOpacity onPress={() => removeStop(stop)}>
                                <MaterialCommunityIcons name="close" size={14} color={C.muted} />
                              </TouchableOpacity>
                            )}
                          </View>
                        );
                      })}
                      <View style={styles.addStopRow}>
                        <TextInput
                          style={[styles.input, { flex: 1, marginBottom: 0, height: 40 }]}
                          placeholder="Add intermediate stop"
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

                      <View style={styles.fareHeaderRow}>
                        <Text style={styles.stopSectionLabel}>Fares between stops</Text>
                        <TouchableOpacity onPress={autoFillFares}>
                          <Text style={styles.autoFillText}>Auto-fill</Text>
                        </TouchableOpacity>
                      </View>
                      {stopPairs(ensureStopsEndpoints(form.config.stops, form.origin, form.destination)).map(([from, to]) => (
                        <View key={fareKey(from, to)} style={styles.fareRow}>
                          <Text style={styles.fareLabel}>{from} → {to}</Text>
                          <TextInput
                            style={styles.fareInput}
                            placeholder={suggestFare(ensureStopsEndpoints(form.config.stops, form.origin, form.destination), parseFloat(form.price) || 0, from, to).toFixed(2)}
                            placeholderTextColor={C.muted}
                            keyboardType="decimal-pad"
                            value={fareFor(from, to) !== undefined ? String(fareFor(from, to)) : ''}
                            onChangeText={(v) => setFare(from, to, v)}
                          />
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              ))}

              <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.7 }]} onPress={handleSave} disabled={saving}>
                <Text style={styles.saveBtnText}>
                  {saving ? 'Saving...' : (editingRoute ? 'Save Changes' : 'Create Route')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Origin City Picker Modal */}
      <Modal visible={form.showOriginPicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Select Origin</Text>
              <TouchableOpacity onPress={() => setForm((p) => ({ ...p, showOriginPicker: false }))}>
                <MaterialCommunityIcons name="close" size={22} color={C.muted} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <TextInput
                style={styles.customCityInput}
                placeholder="Type a custom location"
                placeholderTextColor={C.muted}
                defaultValue={form.origin && !ZIMBABWE_CITIES.includes(form.origin) ? form.origin : ''}
                onSubmitEditing={(e) => {
                  const value = e.nativeEvent.text.trim();
                  if (value) setForm((p) => ({ ...p, origin: value, showOriginPicker: false }));
                }}
                returnKeyType="done"
              />
              {ZIMBABWE_CITIES.map((city) => (
                <TouchableOpacity
                  key={city}
                  style={[styles.cityItem, form.origin === city && styles.cityItemActive]}
                  onPress={() => setForm((p) => ({ ...p, origin: city, showOriginPicker: false }))}
                >
                  <Text style={[styles.cityText, form.origin === city && styles.cityTextActive]}>{city}</Text>
                  {form.origin === city && (
                    <MaterialCommunityIcons name="check" size={20} color={C.amber} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Destination City Picker Modal */}
      <Modal visible={form.showDestinationPicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Select Destination</Text>
              <TouchableOpacity onPress={() => setForm((p) => ({ ...p, showDestinationPicker: false }))}>
                <MaterialCommunityIcons name="close" size={22} color={C.muted} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <TextInput
                style={styles.customCityInput}
                placeholder="Type a custom location"
                placeholderTextColor={C.muted}
                defaultValue={form.destination && !ZIMBABWE_CITIES.includes(form.destination) ? form.destination : ''}
                onSubmitEditing={(e) => {
                  const value = e.nativeEvent.text.trim();
                  if (value) setForm((p) => ({ ...p, destination: value, showDestinationPicker: false }));
                }}
                returnKeyType="done"
              />
              {ZIMBABWE_CITIES.map((city) => (
                <TouchableOpacity
                  key={city}
                  style={[styles.cityItem, form.destination === city && styles.cityItemActive]}
                  onPress={() => setForm((p) => ({ ...p, destination: city, showDestinationPicker: false }))}
                >
                  <Text style={[styles.cityText, form.destination === city && styles.cityTextActive]}>{city}</Text>
                  {form.destination === city && (
                    <MaterialCommunityIcons name="check" size={20} color={C.amber} />
                  )}
                </TouchableOpacity>
              ))}
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
    marginBottom: 20, backgroundColor: C.amberSoft,
    paddingVertical: 10, borderRadius: 10,
  },
  label: { color: C.muted, fontSize: 12, fontWeight: '700', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    backgroundColor: C.bg, color: C.white, borderWidth: 1, borderColor: C.border,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, marginBottom: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  inputText: { fontSize: 15, flex: 1 },
  inputTextActive: { color: C.white },
  inputTextPlaceholder: { color: C.muted },
  cityItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 16, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  customCityInput: {
    backgroundColor: C.bg, color: C.white, borderWidth: 1, borderColor: C.amber,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, marginHorizontal: 20, marginTop: 8, marginBottom: 8,
  },
  cityItemActive: { backgroundColor: C.amberSoft },
  cityText: { fontSize: 16, fontWeight: '600', color: C.white },
  cityTextActive: { color: C.amber },
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
  stopPriceText: { color: C.amber, fontSize: 11, marginTop: 2 },
  stopSectionLabel: { color: C.white, fontSize: 12, fontWeight: '800', marginBottom: 4 },
  addStopRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 12 },
  fareHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, marginBottom: 4 },
  autoFillText: { color: C.amber, fontSize: 12, fontWeight: '800' },
  fareRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: C.surface, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, marginBottom: 6,
  },
  fareLabel: { color: C.white, fontSize: 12, flex: 1 },
  fareInput: {
    backgroundColor: C.bg, color: C.white, borderWidth: 1, borderColor: C.border,
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 14,
    width: 90, textAlign: 'right',
  },
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
