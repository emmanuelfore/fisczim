import React, { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert, StatusBar, BackHandler, ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBusTicketing } from '../../hooks/useBusTicketing';
import { BusRoute, IssuedTicket, getRouteFare } from '../../types/busTicketing';
import { usePrinter } from '../../hooks/usePrinter';
import { buildBusTicketPrintData } from '../../lib/busTicketReceipt';
import { DoneTextInput as TextInput } from '../../ui/DoneTextInput';
import { type BusColors, useBusColors } from './theme';
import * as Haptics from 'expo-haptics';

interface Props { onClose: () => void; companyId?: number | null; company?: any; }

export function BusTicketIssueScreen({ onClose, companyId, company }: Props) {
  const insets = useSafeAreaInsets();
  const C = useBusColors();
  const styles = useMemo(() => makeStyles(C), [C]);
  const { routes, vehicles, activeConductor, activeTrip, tickets, issueTicket, isOnline, syncStatus, pendingTicketCount, isLoading } = useBusTicketing(companyId);
  const { config: printerConfig, print } = usePrinter();

  // Route is fixed by the active trip (chosen when the trip was started).
  const activeTripRoute = useMemo(
    () => activeTrip ? routes.find((route) => route.id === activeTrip.routeId) ?? null : null,
    [routes, activeTrip]
  );
  const activeTripVehicle = useMemo(
    () => activeTrip ? vehicles.find((vehicle) => vehicle.id === activeTrip.vehicleId) ?? null : null,
    [vehicles, activeTrip]
  );

  const [quantity, setQuantity] = useState(1);
  const [passengerName, setPassengerName] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [boardingPoint, setBoardingPoint] = useState('');
  const [dropOffPoint, setDropOffPoint] = useState('');
  const [lastTicket, setLastTicket] = useState<IssuedTicket | null>(null);
  const [issuing, setIssuing] = useState(false);
  // Cooldown to prevent accidental double-taps on Issue Ticket
  const lastIssueRef = useRef<number>(0);
  const COOLDOWN_MS = 1500;

  const cfg = activeTripRoute?.config;
  // Full ordered stop list: modern routes use config.stops, legacy routes only have dropOffPoints.
  const stops = useMemo(() => {
    const modern = cfg?.stops?.filter(Boolean);
    if (modern && modern.length >= 2) return modern as string[];
    const legacy = (cfg?.dropOffPoints || [])
      .map((point: any) => typeof point === 'string' ? point : point?.name)
      .filter(Boolean);
    const all = [activeTripRoute?.origin, ...legacy, activeTripRoute?.destination]
      .filter((value): value is string => !!value)
      .filter((value, index, list) => list.indexOf(value) === index);
    return all.length >= 2 ? all : [activeTripRoute?.origin || '', activeTripRoute?.destination || ''];
  }, [cfg, activeTripRoute]);

  const soldCount = useMemo(() => {
    if (!activeTrip) return 0;
    return tickets
      .filter((t) => t.tripId === activeTrip.id || t.tripId === activeTrip.localId)
      .reduce((sum, t) => sum + (t.quantity || 1), 0);
  }, [tickets, activeTrip]);

  const showingSync = syncStatus === 'syncing';
  const modeColor = showingSync ? C.amber : isOnline ? C.success : C.danger;
  const modeIcon = showingSync ? 'sync' : isOnline ? 'wifi' : 'wifi-off';
  const modeLabel = showingSync ? 'System syncing' : isOnline ? 'Online mode' : 'Offline mode';

  const ticketPrice = activeTripRoute
    ? getRouteFare(activeTripRoute.config, boardingPoint || activeTripRoute.origin, dropOffPoint || activeTripRoute.destination, activeTripRoute.price)
    : 0;
  const totalAmount = activeTripRoute ? parseFloat((ticketPrice * quantity).toFixed(2)) : 0;

  function getPriceForDropOff(route: BusRoute, dropOff: string): number {
    return getRouteFare(route.config, boardingPoint || route.origin, dropOff || route.destination, route.price);
  }

  const resetForm = useCallback(() => {
    setQuantity(1);
    setPassengerName('');
    setIdNumber('');
    setPhone('');
    setBoardingPoint('');
    setDropOffPoint('');
  }, []);

  useEffect(() => {
    resetForm();
    setLastTicket(null);
  }, [activeTrip?.id, resetForm]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => subscription.remove();
  }, [onClose]);

  function selectBoarding(stopName: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setBoardingPoint((prev) => {
      const next = prev === stopName ? '' : stopName;
      if (next && dropOffPoint === next) setDropOffPoint('');
      return next;
    });
  }

  async function handleIssue() {
    if (isLoading) return;
    if (!activeTrip) {
      Alert.alert('No Active Trip', 'Start a trip before issuing tickets.');
      onClose();
      return;
    }
    if (!activeTripRoute) { Alert.alert('Error', 'The active trip has no route assigned.'); return; }

    // Cooldown check to prevent accidental double-taps
    const now = Date.now();
    if (now - lastIssueRef.current < COOLDOWN_MS) {
      return;
    }
    lastIssueRef.current = now;

    // Haptic feedback on successful issue
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    setIssuing(true);
    try {
      const ticket: IssuedTicket = {
        id: 'auto',
        routeId: activeTripRoute.id,
        routeName: activeTripRoute.name,
        price: getPriceForDropOff(activeTripRoute, dropOffPoint),
        quantity,
        totalAmount,
        currency: activeTripRoute.currency,
        paymentMethod: 'Cash',
        passengerName: passengerName.trim() || undefined,
        idNumber: idNumber.trim() || undefined,
        phone: phone.trim() || undefined,
        boardingPoint: (boardingPoint || activeTripRoute.origin) || undefined,
        dropOffPoint: (dropOffPoint || activeTripRoute.destination) || undefined,
        issuedAt: new Date().toISOString(),
        conductorId: activeConductor?.id,
        conductorName: activeConductor?.name,
        tripId: activeTrip?.id,
        vehicleId: activeTrip?.vehicleId,
        tripSnapshot: activeTrip,
      };
      const issuedTicket = await issueTicket(ticket);
      setLastTicket(issuedTicket);
      resetForm();
      if (printerConfig.enabled) {
        print(buildBusTicketPrintData(issuedTicket, company)).catch((e) => {
          console.warn('[BusTicketIssue] Ticket print failed:', e?.message || e);
          Alert.alert('Print Failed', e?.message || 'Ticket was issued, but printing failed.');
        });
      }

      Alert.alert(
        '✓ Ticket Issued',
        `${issuedTicket.id}\n${activeTripRoute.name}\n${quantity} passenger(s) — ${activeTripRoute.currency} ${totalAmount.toFixed(2)}`,
        [{ text: 'OK' }]
      );
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setIssuing(false);
    }
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle={C.statusBarStyle} backgroundColor={C.bg} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={C.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Issue Ticket</Text>
        <View style={{ width: 40 }} />
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={C.amber} style={styles.loadingSpinner} />
          <Text style={styles.loadingText}>Loading trip…</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {/* Sync banner */}
        <View style={[styles.syncBanner, { borderColor: `${modeColor}66` }]}>
          <MaterialCommunityIcons name={modeIcon as any} size={16} color={modeColor} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.syncTitle, { color: modeColor }]}>{modeLabel}</Text>
            <Text style={styles.syncSub}>
              {pendingTicketCount > 0
                ? `${pendingTicketCount} sale${pendingTicketCount === 1 ? '' : 's'} ${showingSync ? 'uploading now' : 'saved for sync'}`
                : 'All bus sales synced'}
            </Text>
          </View>
        </View>

        {/* Last ticket banner */}
        {lastTicket && (
          <View style={styles.lastTicketBanner}>
            <MaterialCommunityIcons name="ticket-confirmation-outline" size={16} color={C.success} />
            <Text style={styles.lastTicketText}>
              Last: {lastTicket.id} · {lastTicket.routeName} · {lastTicket.quantity} pax
            </Text>
          </View>
        )}

        {/* Active trip card with capacity */}
        {activeTrip && (
          <View style={styles.tripCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.tripLabel}>ACTIVE TRIP</Text>
              <Text style={styles.tripTitle}>{activeTripRoute?.name || `Trip #${activeTrip.id}`}</Text>
              <Text style={styles.tripSub}>Status: {activeTrip.status.replace('_', ' ')}</Text>
              {activeTripVehicle?.capacity ? (
                <Text style={[styles.tripSub, { color: soldCount >= activeTripVehicle.capacity ? C.danger : C.success, fontWeight: '800', marginTop: 4 }]}>
                  {soldCount} / {activeTripVehicle.capacity} sold
                </Text>
              ) : null}
            </View>
            <MaterialCommunityIcons name="bus-clock" size={26} color={C.amber} />
          </View>
        )}

        {/* Conductor info */}
        {activeConductor ? (
          <View style={styles.conductorBadge}>
            <MaterialCommunityIcons name="account-tie-outline" size={14} color={C.amber} />
            <Text style={styles.conductorName}>{activeConductor.name}</Text>
          </View>
        ) : (
          <View style={[styles.conductorBadge, { backgroundColor: 'rgba(239,68,68,0.1)' }]}>
            <MaterialCommunityIcons name="alert-outline" size={14} color={C.danger} />
            <Text style={[styles.conductorName, { color: C.danger }]}>No active conductor set</Text>
          </View>
        )}

        {!activeTrip || !activeTripRoute ? (
          <View style={styles.noRoutes}>
            <MaterialCommunityIcons name="map-marker-off-outline" size={28} color={C.muted} />
            <Text style={styles.noRoutesText}>
              {!activeTrip
                ? 'Start a trip first — the route is locked to the active trip.'
                : 'The active trip has no route assigned. Edit the trip in the admin panel.'}
            </Text>
          </View>
        ) : (
          <>
            {/* Boarding point */}
            <Text style={styles.label}>Starting Point</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              {stops.map((stopName: string) => {
                const active = boardingPoint === stopName;
                return (
                  <TouchableOpacity
                    key={`b-${stopName}`}
                    style={[styles.stopChip, active && styles.stopChipActive]}
                    onPress={() => selectBoarding(stopName)}
                  >
                    <MaterialCommunityIcons name="sign-direction" size={14} color={active ? '#fff' : C.muted} />
                    <Text style={[styles.stopChipText, active && styles.stopChipTextActive]}>
                      {stopName}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Drop-off point */}
            <Text style={styles.label}>Destination / Stop</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              {stops
                .filter((stopName: string) => stopName !== (boardingPoint || activeTripRoute.origin))
                .map((stopName: string) => {
                  const active = dropOffPoint === stopName;
                  const price = getRouteFare(
                    activeTripRoute.config,
                    boardingPoint || activeTripRoute.origin,
                    stopName,
                    activeTripRoute.price,
                  );
                  return (
                    <TouchableOpacity
                      key={`d-${stopName}`}
                      style={[styles.stopChip, active && styles.stopChipActive]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setDropOffPoint(dropOffPoint === stopName ? '' : stopName);
                      }}
                    >
                      <Text style={[styles.stopChipText, active && styles.stopChipTextActive]}>
                        {stopName}
                      </Text>
                      <Text style={[styles.stopChipPrice, active && styles.stopChipPriceActive]}>
                        {activeTripRoute.currency} {price.toFixed(2)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
            </ScrollView>

            {/* Quantity */}
            <Text style={styles.label}>Number of Passengers</Text>
            <View style={styles.quickQtyRow}>
              {[1, 2, 3, 4].map((count) => (
                <TouchableOpacity
                  key={count}
                  style={[styles.quickQty, quantity === count && styles.quickQtyActive]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setQuantity(count);
                  }}
                >
                  <Text style={[styles.quickQtyText, quantity === count && styles.quickQtyTextActive]}>{count}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.quantityRow}>
              <TouchableOpacity
                style={styles.qtyBtn}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setQuantity((q) => Math.max(1, q - 1));
                }}
              >
                <MaterialCommunityIcons name="minus" size={20} color={C.white} />
              </TouchableOpacity>
              <Text style={styles.qtyValue}>{quantity}</Text>
              <TouchableOpacity
                style={styles.qtyBtn}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setQuantity((q) => Math.min(99, q + 1));
                }}
              >
                <MaterialCommunityIcons name="plus" size={20} color={C.white} />
              </TouchableOpacity>
            </View>

            {/* Optional customer fields */}
            {cfg?.passengerName && (
              <>
                <Text style={styles.label}>Passenger Name</Text>
                <TextInput
                  style={styles.input} placeholder="Full name (optional)"
                  placeholderTextColor={C.muted} value={passengerName}
                  onChangeText={setPassengerName}
                />
              </>
            )}
            {cfg?.idNumber && (
              <>
                <Text style={styles.label}>ID Number</Text>
                <TextInput
                  style={styles.input} placeholder="National ID / Passport (optional)"
                  placeholderTextColor={C.muted} value={idNumber}
                  onChangeText={setIdNumber}
                />
              </>
            )}
            {cfg?.phone && (
              <>
                <Text style={styles.label}>Phone Number</Text>
                <TextInput
                  style={styles.input} placeholder="+263 77 ... (optional)"
                  placeholderTextColor={C.muted} value={phone}
                  onChangeText={setPhone} keyboardType="phone-pad"
                />
              </>
            )}

            {/* Total */}
            <View style={styles.totalCard}>
              <Text style={styles.totalLabel}>TOTAL</Text>
              <Text style={styles.totalAmount}>
                {activeTripRoute.currency} {totalAmount.toFixed(2)}
              </Text>
              {quantity > 1 && (
                <Text style={styles.totalBreakdown}>
                  {getPriceForDropOff(activeTripRoute, dropOffPoint).toFixed(2)} ×{' '}
                  {quantity} passengers
                </Text>
              )}
              <Text style={styles.totalBreakdown}>Cash payment</Text>
            </View>

            {/* Issue button */}
            <TouchableOpacity
              style={[styles.issueBtn, issuing && { opacity: 0.7 }]}
              onPress={handleIssue}
              disabled={issuing}
            >
              <MaterialCommunityIcons name="ticket-outline" size={22} color="#000" />
              <Text style={styles.issueBtnText}>{issuing ? 'Issuing...' : 'Issue Ticket'}</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
      )}
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
  lastTicketBanner: {
    backgroundColor: 'rgba(34,197,94,0.1)', borderRadius: 10, padding: 12,
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12,
  },
  lastTicketText: { color: C.success, fontSize: 12, fontWeight: '600', flex: 1 },
  syncBanner: {
    backgroundColor: C.surface, borderRadius: 10, padding: 12,
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12,
    borderWidth: 1,
  },
  syncTitle: { fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  syncSub: { color: C.muted, fontSize: 11, fontWeight: '600', marginTop: 2 },
  conductorBadge: {
    backgroundColor: C.amberSoft, borderRadius: 10, padding: 10,
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 20,
  },
  conductorName: { color: C.amber, fontSize: 13, fontWeight: '700' },
  tripCard: {
    backgroundColor: C.surface, borderRadius: 12, padding: 14,
    flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12,
    borderWidth: 1, borderColor: `${C.amber}55`,
  },
  tripLabel: { color: C.amber, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  tripTitle: { color: C.white, fontSize: 15, fontWeight: '900', marginTop: 2 },
  tripSub: { color: C.muted, fontSize: 11, fontWeight: '600', marginTop: 2 },
  sectionLabel: { color: C.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 },
  noRoutes: { backgroundColor: C.surface, borderRadius: 10, padding: 20, alignItems: 'center', marginBottom: 20, gap: 10 },
  noRoutesText: { color: C.muted, fontSize: 13, textAlign: 'center' },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 60 },
  loadingSpinner: { width: 40, height: 40 },
  loadingText: { color: C.muted, fontSize: 14 },
  label: { color: C.muted, fontSize: 12, fontWeight: '700', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    backgroundColor: C.surface, color: C.white, borderWidth: 1, borderColor: C.border,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 16,
  },
  stopChip: {
    backgroundColor: C.surface, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
    marginRight: 8, borderWidth: 1, borderColor: C.border, alignItems: 'center', flexDirection: 'row', gap: 6,
  },
  stopChipActive: { backgroundColor: C.fire, borderColor: C.fire },
  stopChipText: { color: C.white, fontSize: 13, fontWeight: '600' },
  stopChipTextActive: { color: C.white },
  stopChipPrice: { color: C.amber, fontSize: 11, fontWeight: '600', marginTop: 2 },
  stopChipPriceActive: { color: C.white },
  quickQtyRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  quickQty: {
    minWidth: 48, height: 40, borderRadius: 12, backgroundColor: C.surface,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border,
  },
  quickQtyActive: { backgroundColor: C.amber, borderColor: C.amber },
  quickQtyText: { color: C.white, fontWeight: '900', fontSize: 15 },
  quickQtyTextActive: { color: '#000' },
  quantityRow: { flexDirection: 'row', alignItems: 'center', gap: 20, marginBottom: 20 },
  qtyBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: C.surface,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border,
  },
  qtyValue: { color: C.white, fontSize: 26, fontWeight: '900', minWidth: 40, textAlign: 'center' },
  totalCard: {
    backgroundColor: C.surface, borderRadius: 12, padding: 20,
    alignItems: 'center', marginBottom: 20, borderWidth: 1, borderColor: C.amber,
  },
  totalLabel: { color: C.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  totalAmount: { color: C.amber, fontSize: 32, fontWeight: '900', marginTop: 4 },
  totalBreakdown: { color: C.muted, fontSize: 12, marginTop: 4 },
  issueBtn: {
    backgroundColor: C.amber, borderRadius: 14, paddingVertical: 18,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
  },
  issueBtnText: { color: '#000', fontWeight: '900', fontSize: 17 },
});