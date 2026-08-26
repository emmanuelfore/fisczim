import React, { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  StatusBar, Share, Alert,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBusTicketing } from '../../hooks/useBusTicketing';
import { isCashierUser, resolveCashierConductorId } from '../../hooks/useBusReports';
import { type BusTrip, type IssuedTicket } from '../../types/busTicketing';
import { type BusColors, useBusColors } from './theme';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmtMoney(n: number) { return `$${n.toFixed(2)}`; }
function fmtDate(d: Date) {
  return `${String(d.getDate()).padStart(2,'0')} ${MONTHS[d.getMonth()]}`;
}
function fmtTime(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
function sortSeat(a: IssuedTicket, b: IssuedTicket): number {
  const aNum = Number(String(a.seatNumber || '').replace(/\D/g, ''));
  const bNum = Number(String(b.seatNumber || '').replace(/\D/g, ''));
  if (aNum && bNum) return aNum - bNum;
  if (aNum) return 1;
  if (bNum) return -1;
  return new Date(a.issuedAt).getTime() - new Date(b.issuedAt).getTime();
}

interface Props { onClose: () => void; userRole?: string; userName?: string; userId?: string | null; }

export function TripManifestScreen({ onClose, userRole, userName, userId }: Props) {
  const insets = useSafeAreaInsets();
  const C = useBusColors();
  const styles = makeStyles(C);
  const { tickets: allTickets, trips: allTrips, routes, vehicles, activeConductor } = useBusTicketing();

  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);

  // Cashiers only see their own trips
  const restrictToOwn = isCashierUser(userRole, userName);
  const ownConductorId = activeConductor?.id ?? (restrictToOwn ? resolveCashierConductorId(userId, userName) : null);
  const trips = useMemo(() => {
    if (!restrictToOwn) return allTrips;
    return ownConductorId ? allTrips.filter((t) => t.conductorId === ownConductorId) : [];
  }, [restrictToOwn, allTrips, ownConductorId]);
  const tickets = useMemo(() => {
    if (!restrictToOwn) return allTickets;
    const myTripIds = new Set(trips.map((t) => t.id));
    return allTickets.filter((t) => t.tripId && myTripIds.has(t.tripId));
  }, [restrictToOwn, allTickets, trips]);

  const tripsWithTickets = useMemo(() => {
    const tripIds = new Set(tickets.map((t) => t.tripId).filter(Boolean));
    return trips
      .filter((t) => tripIds.has(t.id))
      .sort((a, b) => new Date(b.scheduledDeparture).getTime() - new Date(a.scheduledDeparture).getTime());
  }, [trips, tickets]);

  const selectedTrip = useMemo<BusTrip | null>(
    () => trips.find((t) => t.id === selectedTripId) ?? null,
    [trips, selectedTripId]
  );

  const routeOf = useMemo(
    () => routes.find((r) => r.id === selectedTrip?.routeId) ?? null,
    [routes, selectedTrip]
  );
  const vehicleOf = useMemo(
    () => vehicles.find((v) => v.id === selectedTrip?.vehicleId) ?? null,
    [vehicles, selectedTrip]
  );

  const manifest = useMemo(() =>
    tickets
      .filter((t) => t.tripId === selectedTripId)
      .sort(sortSeat),
    [tickets, selectedTripId]
  );

  const totals = useMemo(() => ({
    passengers: manifest.reduce((s, t) => s + t.quantity, 0),
    revenue: manifest.reduce((s, t) => s + t.totalAmount, 0),
  }), [manifest]);

  async function handleShare() {
    if (manifest.length === 0) return;
    const header = ['Ticket','Seat','Passenger','Boarding','Drop-off','Qty','Amount','Payment','Time'];
    const rows = manifest.map((t) => [
      t.id,
      t.seatNumber || '',
      t.passengerName || 'Walk-in',
      t.boardingPoint || '',
      t.dropOffPoint || '',
      t.quantity,
      t.totalAmount.toFixed(2),
      t.paymentMethod || '',
      fmtTime(t.issuedAt),
    ]);
    const csv = [header, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g,'""')}"`).join(',')).join('\n');
    try {
      await Share.share({ message: csv, title: `trip_manifest_${selectedTripId}.csv` });
    } catch (e: any) { Alert.alert('Error', e.message); }
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle={C.statusBarStyle} backgroundColor={C.bg} />
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={C.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Trip Manifest</Text>
        <TouchableOpacity onPress={handleShare} disabled={manifest.length === 0}>
          <MaterialCommunityIcons name="share-variant-outline" size={22} color={manifest.length === 0 ? C.border : C.amber} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* Trip picker */}
        <Text style={styles.sectionTitle}>SELECT TRIP</Text>
        {tripsWithTickets.length === 0 ? (
          <View style={styles.empty}>
            <MaterialCommunityIcons name="bus-clock" size={48} color={C.border} />
            <Text style={styles.emptyText}>No trips with tickets yet</Text>
          </View>
        ) : (
          tripsWithTickets.slice(0, 30).map((trip) => {
            const active = trip.id === selectedTripId;
            return (
              <TouchableOpacity
                key={trip.id}
                style={[styles.tripCard, active && { borderColor: C.amber }]}
                onPress={() => setSelectedTripId(active ? null : trip.id)}
              >
                <MaterialCommunityIcons
                  name={active ? 'checkbox-marked-circle-outline' : 'checkbox-blank-circle-outline'}
                  size={18}
                  color={active ? C.amber : C.muted}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.tripName} numberOfLines={1}>{trip.id}</Text>
                  <Text style={styles.tripSub}>
                    {fmtDate(new Date(trip.scheduledDeparture))} {fmtTime(trip.scheduledDeparture)} · {String(trip.status || '').replace('_', ' ')}
                  </Text>
                </View>
                <Text style={styles.tripTickets}>
                  {tickets.filter((t) => t.tripId === trip.id).length} tkts
                </Text>
              </TouchableOpacity>
            );
          })
        )}

        {selectedTrip && (
          <>
            {/* Trip summary */}
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle} numberOfLines={2}>
                {routeOf ? `${routeOf.name}` : `Trip ${selectedTrip.id}`}
              </Text>
              <Text style={styles.summarySub}>
                {vehicleOf?.registrationNumber || 'No vehicle'} · {fmtDate(new Date(selectedTrip.scheduledDeparture))} {fmtTime(selectedTrip.scheduledDeparture)}
              </Text>
              <View style={styles.summaryStats}>
                <View style={styles.summaryStat}>
                  <Text style={styles.summaryStatValue}>{totals.passengers}</Text>
                  <Text style={styles.summaryStatLabel}>Passengers</Text>
                </View>
                <View style={styles.summaryStat}>
                  <Text style={[styles.summaryStatValue, { color: C.amber }]}>{fmtMoney(totals.revenue)}</Text>
                  <Text style={styles.summaryStatLabel}>Revenue</Text>
                </View>
                <View style={styles.summaryStat}>
                  <Text style={styles.summaryStatValue}>{manifest.length}</Text>
                  <Text style={styles.summaryStatLabel}>Tickets</Text>
                </View>
              </View>
            </View>

            {/* Passenger list */}
            <Text style={styles.sectionTitle}>PASSENGERS</Text>
            {manifest.length === 0 ? (
              <View style={styles.empty}>
                <MaterialCommunityIcons name="seat-outline" size={48} color={C.border} />
                <Text style={styles.emptyText}>No passengers on this trip</Text>
              </View>
            ) : (
              manifest.map((t) => (
                <View key={t.id} style={styles.paxRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.paxName} numberOfLines={1}>
                      {t.passengerName || 'Walk-in'}
                    </Text>
                    <Text style={styles.paxSub} numberOfLines={1}>
                      {t.seatNumber ? `Seat ${t.seatNumber} · ` : ''}{t.id}
                    </Text>
                    {t.dropOffPoint ? (
                      <Text style={styles.paxSub} numberOfLines={1}>
                        {t.boardingPoint ? `${t.boardingPoint} → ` : ''}{t.dropOffPoint}
                      </Text>
                    ) : null}
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.paxAmount}>{fmtMoney(t.totalAmount)}</Text>
                    <Text style={styles.paxSub}>Qty {t.quantity} · {t.paymentMethod || '-'}</Text>
                  </View>
                </View>
              ))
            )}
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
  sectionTitle: { color: C.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10, marginTop: 14 },
  tripCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: C.surface, borderRadius: 10, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: C.border,
  },
  tripName: { color: C.white, fontSize: 13, fontWeight: '700' },
  tripSub: { color: C.muted, fontSize: 11, marginTop: 2 },
  tripTickets: { color: C.amber, fontSize: 12, fontWeight: '700' },
  summaryCard: {
    backgroundColor: C.surface, borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: C.border, marginTop: 14,
  },
  summaryTitle: { color: C.white, fontSize: 16, fontWeight: '900' },
  summarySub: { color: C.muted, fontSize: 12, marginTop: 4 },
  summaryStats: { flexDirection: 'row', gap: 10, marginTop: 14 },
  summaryStat: { flex: 1, alignItems: 'center' },
  summaryStatValue: { color: C.white, fontSize: 18, fontWeight: '900' },
  summaryStatLabel: { color: C.muted, fontSize: 11, fontWeight: '600', marginTop: 2 },
  paxRow: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8,
    backgroundColor: C.surface, borderRadius: 10, padding: 12, marginBottom: 8,
  },
  paxName: { color: C.white, fontSize: 13, fontWeight: '700' },
  paxSub: { color: C.muted, fontSize: 11, marginTop: 2 },
  paxAmount: { color: C.amber, fontSize: 13, fontWeight: '800' },
  empty: { alignItems: 'center', paddingTop: 40, paddingBottom: 20, gap: 10 },
  emptyText: { color: C.muted, fontSize: 14 },
});