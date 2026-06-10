import React, { useCallback, useEffect, useState, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert, StatusBar, BackHandler,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBusTicketing } from '../../hooks/useBusTicketing';
import { BusRoute, IssuedTicket } from '../../types/busTicketing';
import { usePrinter } from '../../hooks/usePrinter';
import { buildBusTicketPrintData } from '../../lib/busTicketReceipt';
import { DoneTextInput as TextInput } from '../../ui/DoneTextInput';
import { type BusColors, useBusColors } from './theme';

type PaymentMethod = 'Cash' | 'EcoCash' | 'InnBucks' | 'Swipe';
const PAYMENT_METHODS: PaymentMethod[] = ['Cash', 'EcoCash', 'InnBucks', 'Swipe'];

interface Props { onClose: () => void; companyId?: number | null; company?: any; }

export function BusTicketIssueScreen({ onClose, companyId, company }: Props) {
  const insets = useSafeAreaInsets();
  const C = useBusColors();
  const styles = makeStyles(C);
  const { routes, activeConductor, activeTrip, issueTicket, isOnline, syncStatus, pendingTicketCount } = useBusTicketing(companyId);
  const { config: printerConfig, print } = usePrinter();

  const activeRoutes = useMemo(() => routes.filter((r) => r.isActive), [routes]);
  const activeTripRoute = useMemo(
    () => activeTrip ? activeRoutes.find((route) => route.id === activeTrip.routeId) ?? null : null,
    [activeRoutes, activeTrip]
  );

  const [selectedRoute, setSelectedRoute] = useState<BusRoute | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash');
  const [passengerName, setPassengerName] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [seatNumber, setSeatNumber] = useState('');
  const [dropOffPoint, setDropOffPoint] = useState('');
  const [lastTicket, setLastTicket] = useState<IssuedTicket | null>(null);
  const [issuing, setIssuing] = useState(false);

  const cfg = selectedRoute?.config;
  const showingSync = syncStatus === 'syncing';
  const modeColor = showingSync ? C.amber : isOnline ? C.success : C.danger;
  const modeIcon = showingSync ? 'sync' : isOnline ? 'wifi' : 'wifi-off';
  const modeLabel = showingSync ? 'System syncing' : isOnline ? 'Online mode' : 'Offline mode';

  const totalAmount = selectedRoute ? parseFloat((selectedRoute.price * quantity).toFixed(2)) : 0;

  const resetForm = useCallback(() => {
    setQuantity(1);
    setPaymentMethod('Cash');
    setPassengerName('');
    setIdNumber('');
    setPhone('');
    setSeatNumber('');
    setDropOffPoint('');
  }, []);

  const selectRoute = useCallback((route: BusRoute) => {
    setSelectedRoute(route);
    resetForm();
  }, [resetForm]);

  useEffect(() => {
    if (!selectedRoute && activeTripRoute) {
      selectRoute(activeTripRoute);
    }
  }, [activeTripRoute, selectedRoute, selectRoute]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => subscription.remove();
  }, [onClose]);

  async function handleIssue() {
    if (!activeTrip) {
      Alert.alert('No Active Trip', 'Start a trip before issuing tickets.');
      return;
    }
    if (!selectedRoute) { Alert.alert('Error', 'Please select a route.'); return; }
    if (cfg?.requirePaymentMethod && !paymentMethod) {
      Alert.alert('Error', 'Please select a payment method.');
      return;
    }

    setIssuing(true);
    try {
      const ticket: IssuedTicket = {
        id: 'auto',
        routeId: selectedRoute.id,
        routeName: selectedRoute.name,
        price: selectedRoute.price,
        quantity,
        totalAmount,
        currency: selectedRoute.currency,
        paymentMethod: paymentMethod ?? undefined,
        passengerName: passengerName.trim() || undefined,
        idNumber: idNumber.trim() || undefined,
        phone: phone.trim() || undefined,
        seatNumber: seatNumber.trim() || undefined,
        dropOffPoint: dropOffPoint || undefined,
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
      setSelectedRoute(activeTripRoute || null);
      Alert.alert(
        '✓ Ticket Issued',
        `${selectedRoute.name}\n${quantity} passenger(s) — ${selectedRoute.currency} ${totalAmount.toFixed(2)}`,
        [
          {
            text: printerConfig.enabled ? 'Print' : 'OK',
            onPress: () => {
              if (!printerConfig.enabled) return;
              print(buildBusTicketPrintData(issuedTicket, company)).catch((e) => {
                console.warn('[BusTicketIssue] Ticket print failed:', e?.message || e);
                Alert.alert('Print Failed', e?.message || 'Ticket was issued, but printing failed.');
              });
            },
          },
        ],
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

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {/* Last ticket banner */}
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

        {activeTrip && (
          <View style={styles.tripCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.tripLabel}>ACTIVE TRIP</Text>
              <Text style={styles.tripTitle}>{activeTripRoute?.name || `Trip #${activeTrip.id}`}</Text>
              <Text style={styles.tripSub}>Status: {activeTrip.status.replace('_', ' ')}</Text>
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

        {/* Route selection */}
        <Text style={styles.sectionLabel}>SELECT ROUTE</Text>
        {activeRoutes.length === 0 ? (
          <View style={styles.noRoutes}>
            <Text style={styles.noRoutesText}>No active routes. Add routes in the admin panel.</Text>
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
            {activeRoutes.map((route) => (
              <TouchableOpacity
                key={route.id}
                style={[styles.routeChip, selectedRoute?.id === route.id && styles.routeChipActive]}
                onPress={() => selectRoute(route)}
              >
                <MaterialCommunityIcons
                  name="bus" size={16}
                  color={selectedRoute?.id === route.id ? '#000' : C.muted}
                />
                <Text style={[styles.routeChipText, selectedRoute?.id === route.id && styles.routeChipTextActive]}>
                  {route.name}
                </Text>
                <Text style={[styles.routeChipPrice, selectedRoute?.id === route.id && { color: '#000' }]}>
                  {route.currency} {route.price.toFixed(2)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {selectedRoute && (
          <>
            <Text style={styles.label}>Quick Destination</Text>
            <View style={styles.quickGrid}>
              {[selectedRoute.destination, ...(cfg?.dropOffPoints || [])]
                .filter((value, index, list) => value && list.indexOf(value) === index)
                .slice(0, 6)
                .map((stop) => (
                  <TouchableOpacity
                    key={stop}
                    style={[styles.quickChip, dropOffPoint === stop && styles.quickChipActive]}
                    onPress={() => setDropOffPoint(stop)}
                  >
                    <Text style={[styles.quickChipText, dropOffPoint === stop && styles.quickChipTextActive]}>{stop}</Text>
                  </TouchableOpacity>
                ))}
            </View>

            {/* Optional fields */}
            {cfg?.passengerName && (
              <>
                <Text style={styles.label}>Passenger Name</Text>
                <TextInput
                  style={styles.input} placeholder="Full name"
                  placeholderTextColor={C.muted} value={passengerName}
                  onChangeText={setPassengerName}
                />
              </>
            )}
            {cfg?.idNumber && (
              <>
                <Text style={styles.label}>ID Number</Text>
                <TextInput
                  style={styles.input} placeholder="National ID / Passport"
                  placeholderTextColor={C.muted} value={idNumber}
                  onChangeText={setIdNumber}
                />
              </>
            )}
            {cfg?.phone && (
              <>
                <Text style={styles.label}>Phone Number</Text>
                <TextInput
                  style={styles.input} placeholder="+263 77 ..."
                  placeholderTextColor={C.muted} value={phone}
                  onChangeText={setPhone} keyboardType="phone-pad"
                />
              </>
            )}
            {cfg?.seatNumber && (
              <>
                <Text style={styles.label}>Seat Number</Text>
                <TextInput
                  style={styles.input} placeholder="e.g. 14A"
                  placeholderTextColor={C.muted} value={seatNumber}
                  onChangeText={setSeatNumber}
                />
              </>
            )}

            {/* Drop-off point */}
            {cfg?.dropOffPoint && cfg.dropOffPoints.length > 0 && (
              <>
                <Text style={styles.label}>Drop-off Point</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                  {cfg.dropOffPoints.map((stop) => (
                    <TouchableOpacity
                      key={stop}
                      style={[styles.stopChip, dropOffPoint === stop && styles.stopChipActive]}
                      onPress={() => setDropOffPoint(dropOffPoint === stop ? '' : stop)}
                    >
                      <Text style={[styles.stopChipText, dropOffPoint === stop && styles.stopChipTextActive]}>
                        {stop}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}

            {/* Payment method */}
            {cfg?.requirePaymentMethod && (
              <>
                <Text style={styles.label}>Payment Method</Text>
                <View style={styles.payRow}>
                  {PAYMENT_METHODS.map((m) => (
                    <TouchableOpacity
                      key={m}
                      style={[styles.payChip, paymentMethod === m && styles.payChipActive]}
                      onPress={() => setPaymentMethod(m)}
                    >
                      <Text style={[styles.payChipText, paymentMethod === m && styles.payChipTextActive]}>{m}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {/* Quantity */}
            {cfg?.allowMultiPassenger && (
              <>
                <Text style={styles.label}>Number of Passengers</Text>
                <View style={styles.quickQtyRow}>
                  {[1, 2, 3, 4].map((count) => (
                    <TouchableOpacity
                      key={count}
                      style={[styles.quickQty, quantity === count && styles.quickQtyActive]}
                      onPress={() => setQuantity(count)}
                    >
                      <Text style={[styles.quickQtyText, quantity === count && styles.quickQtyTextActive]}>{count}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={styles.quantityRow}>
                  <TouchableOpacity
                    style={styles.qtyBtn}
                    onPress={() => setQuantity((q) => Math.max(1, q - 1))}
                  >
                    <MaterialCommunityIcons name="minus" size={20} color={C.white} />
                  </TouchableOpacity>
                  <Text style={styles.qtyValue}>{quantity}</Text>
                  <TouchableOpacity
                    style={styles.qtyBtn}
                    onPress={() => setQuantity((q) => Math.min(99, q + 1))}
                  >
                    <MaterialCommunityIcons name="plus" size={20} color={C.white} />
                  </TouchableOpacity>
                </View>
              </>
            )}

            {/* Total */}
            <View style={styles.totalCard}>
              <Text style={styles.totalLabel}>TOTAL</Text>
              <Text style={styles.totalAmount}>
                {selectedRoute.currency} {totalAmount.toFixed(2)}
              </Text>
              {quantity > 1 && (
                <Text style={styles.totalBreakdown}>
                  {selectedRoute.price.toFixed(2)} × {quantity} passengers
                </Text>
              )}
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
  noRoutes: { backgroundColor: C.surface, borderRadius: 10, padding: 20, alignItems: 'center', marginBottom: 20 },
  noRoutesText: { color: C.muted, fontSize: 13, textAlign: 'center' },
  routeChip: {
    backgroundColor: C.surface, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12,
    marginRight: 10, gap: 6, alignItems: 'center', borderWidth: 1, borderColor: C.border,
  },
  routeChipActive: { backgroundColor: C.amber, borderColor: C.amber },
  routeChipText: { color: C.white, fontSize: 13, fontWeight: '700' },
  routeChipTextActive: { color: '#000' },
  routeChipPrice: { color: C.muted, fontSize: 11 },
  label: { color: C.muted, fontSize: 12, fontWeight: '700', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    backgroundColor: C.surface, color: C.white, borderWidth: 1, borderColor: C.border,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 16,
  },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  quickChip: {
    backgroundColor: C.surface, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11,
    borderWidth: 1, borderColor: C.border,
  },
  quickChipActive: { backgroundColor: C.fire, borderColor: C.fire },
  quickChipText: { color: C.white, fontSize: 13, fontWeight: '800' },
  quickChipTextActive: { color: C.white },
  stopChip: {
    backgroundColor: C.surface, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
    marginRight: 8, borderWidth: 1, borderColor: C.border,
  },
  stopChipActive: { backgroundColor: C.fire, borderColor: C.fire },
  stopChipText: { color: C.white, fontSize: 13, fontWeight: '600' },
  stopChipTextActive: { color: C.white },
  payRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  payChip: {
    borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10,
    borderWidth: 1, borderColor: C.border, backgroundColor: C.surface,
  },
  payChipActive: { backgroundColor: C.amber, borderColor: C.amber },
  payChipText: { color: C.white, fontWeight: '700', fontSize: 13 },
  payChipTextActive: { color: '#000' },
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
