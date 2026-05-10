import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, StatusBar,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBusTicketing } from '../../hooks/useBusTicketing';

// Sub-screens
import { BusTicketIssueScreen } from './BusTicketIssueScreen';
import { BusRouteAdminScreen } from './BusRouteAdminScreen';
import { ConductorManagementScreen } from './ConductorManagementScreen';
import { ShiftSummaryScreen } from './ShiftSummaryScreen';
import { ReconciliationScreen } from './ReconciliationScreen';
import { BusDailyReportScreen } from './BusDailyReportScreen';
import { BusRangeReportScreen } from './BusRangeReportScreen';
import { BusConductorReportScreen } from './BusConductorReportScreen';
import { BusFleetAdminScreen } from './BusFleetAdminScreen';
import { BusTripStartScreen } from './BusTripStartScreen';

const C = {
  bg: '#07090C', surface: '#111318', border: '#1E2128',
  amber: '#F0A500', fire: '#FF6B35', white: '#FFFFFF',
  muted: '#9CA3AF', success: '#22C55E', danger: '#EF4444',
};

type SubScreen =
  | null
  | 'issueTicket'
  | 'routes'
  | 'conductors'
  | 'shiftSummary'
  | 'reconciliation'
  | 'dailyReport'
  | 'rangeReport'
  | 'conductorReport'
  | 'fleet'
  | 'startTrip';

interface MenuCard {
  id: SubScreen;
  icon: string;
  label: string;
  sub: string;
  color: string;
  section: 'conductor' | 'admin' | 'reports';
}

const MENU: MenuCard[] = [
  // Conductor section
  { id: 'startTrip', icon: 'steering', label: 'Start Trip', sub: 'Select bus and route to start', color: C.success, section: 'conductor' },
  { id: 'issueTicket', icon: 'ticket-outline', label: 'Issue Ticket', sub: 'Create a new ticket for passengers', color: C.amber, section: 'conductor' },
  { id: 'shiftSummary', icon: 'flag-checkered', label: 'End Trip / Shift', sub: 'View today\'s totals & close shift', color: C.fire, section: 'conductor' },
  { id: 'reconciliation', icon: 'cash-sync', label: 'Reconcile Cash', sub: 'Compare expected vs received cash', color: C.success, section: 'conductor' },
  // Admin section
  { id: 'fleet', icon: 'bus-multiple', label: 'Manage Fleet', sub: 'Add, edit vehicles', color: C.amber, section: 'admin' },
  { id: 'routes', icon: 'bus-stop', label: 'Manage Routes', sub: 'Add, edit, and configure routes', color: C.amber, section: 'admin' },
  { id: 'conductors', icon: 'account-tie-outline', label: 'Conductors', sub: 'Manage conductor profiles', color: C.amber, section: 'admin' },
  // Reports section
  { id: 'dailyReport', icon: 'chart-bar', label: 'Daily Report', sub: 'Revenue & breakdown for a day', color: C.amber, section: 'reports' },
  { id: 'rangeReport', icon: 'chart-line', label: 'Range Report', sub: 'Multi-day trend analysis', color: C.amber, section: 'reports' },
  { id: 'conductorReport', icon: 'account-details-outline', label: 'Conductor Report', sub: 'Per-conductor performance', color: C.amber, section: 'reports' },
];

interface Props {
  onClose: () => void;
}

export function BusTicketingHubScreen({ onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { activeConductor, activeTrip, getTodaysTickets, routes, vehicles } = useBusTicketing();
  const [activeScreen, setActiveScreen] = useState<SubScreen>(null);

  // Render sub-screens
  if (activeScreen === 'startTrip') return <BusTripStartScreen onClose={() => setActiveScreen(null)} />;
  if (activeScreen === 'issueTicket') return <BusTicketIssueScreen onClose={() => setActiveScreen(null)} />;
  if (activeScreen === 'routes') return <BusRouteAdminScreen onClose={() => setActiveScreen(null)} />;
  if (activeScreen === 'fleet') return <BusFleetAdminScreen onClose={() => setActiveScreen(null)} />;
  if (activeScreen === 'conductors') return <ConductorManagementScreen onClose={() => setActiveScreen(null)} />;
  if (activeScreen === 'shiftSummary') return <ShiftSummaryScreen onClose={() => setActiveScreen(null)} />;
  if (activeScreen === 'reconciliation') return <ReconciliationScreen onClose={() => setActiveScreen(null)} />;
  if (activeScreen === 'dailyReport') return <BusDailyReportScreen onClose={() => setActiveScreen(null)} />;
  if (activeScreen === 'rangeReport') return <BusRangeReportScreen onClose={() => setActiveScreen(null)} />;
  if (activeScreen === 'conductorReport') return <BusConductorReportScreen onClose={() => setActiveScreen(null)} />;

  const todayTickets = getTodaysTickets();

  // Filter conductor actions based on whether a trip is active
  const rawConductorSection = MENU.filter((m) => m.section === 'conductor');
  const conductorSection = activeTrip
    ? rawConductorSection.filter(m => m.id !== 'startTrip')
    : rawConductorSection.filter(m => m.id === 'startTrip' || m.id === 'shiftSummary' || m.id === 'reconciliation');

  const adminSection = MENU.filter((m) => m.section === 'admin');
  const reportsSection = MENU.filter((m) => m.section === 'reports');

  // Helpers to display active trip details
  const activeRoute = activeTrip ? routes.find(r => r.id === activeTrip.routeId) : null;
  const activeVehicle = activeTrip ? vehicles.find(v => v.id === activeTrip.vehicleId) : null;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={C.white} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <MaterialCommunityIcons name="bus" size={20} color={C.amber} />
          <Text style={styles.headerTitle}>Bus Ticketing</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* Status bar */}
        <View style={styles.statusBar}>
          <View style={styles.statusItem}>
            <MaterialCommunityIcons name="account-tie-outline" size={16} color={activeConductor ? C.amber : C.muted} />
            <Text style={[styles.statusText, activeConductor && { color: C.amber }]}>
              {activeConductor ? activeConductor.name : 'No conductor set'}
            </Text>
          </View>
          <View style={styles.statusDivider} />
          <View style={styles.statusItem}>
            <MaterialCommunityIcons name="bus" size={16} color={activeTrip ? C.amber : C.muted} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.statusText, activeTrip && { color: C.amber }]}>
                {activeVehicle ? activeVehicle.registrationNumber : 'No active trip'}
              </Text>
              {activeRoute && (
                <Text style={[styles.statusText, { fontSize: 10, marginTop: 2 }]} numberOfLines={1}>
                  {activeRoute.name}
                </Text>
              )}
            </View>
          </View>
        </View>

        {/* Tickets and Revenue Summary */}
        <View style={styles.statusBar}>
          <View style={styles.statusItem}>
            <MaterialCommunityIcons name="ticket-outline" size={16} color={C.muted} />
            <Text style={styles.statusText}>{todayTickets.length} tickets today</Text>
          </View>
          <View style={styles.statusDivider} />
          <View style={styles.statusItem}>
            <MaterialCommunityIcons name="cash" size={16} color={C.success} />
            <Text style={[styles.statusText, { color: C.success }]}>
              ${todayTickets.reduce((s, t) => s + t.totalAmount, 0).toFixed(2)}
            </Text>
          </View>
        </View>

        {/* Conductor actions */}
        <Text style={styles.sectionLabel}>CONDUCTOR</Text>
        <View style={styles.grid}>
          {conductorSection.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={[styles.card, item.id === 'issueTicket' && styles.cardPrimary]}
              onPress={() => setActiveScreen(item.id)}
              activeOpacity={0.8}
            >
              <View style={[styles.cardIcon, { backgroundColor: item.id === 'issueTicket' ? C.amber : 'rgba(240,165,0,0.15)' }]}>
                <MaterialCommunityIcons
                  name={item.icon as any}
                  size={24}
                  color={item.id === 'issueTicket' ? '#000' : item.color}
                />
              </View>
              <Text style={styles.cardLabel}>{item.label}</Text>
              <Text style={styles.cardSub}>{item.sub}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Admin */}
        <Text style={styles.sectionLabel}>ADMIN</Text>
        <View style={styles.grid}>
          {adminSection.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={styles.card}
              onPress={() => setActiveScreen(item.id)}
              activeOpacity={0.8}
            >
              <View style={styles.cardIcon}>
                <MaterialCommunityIcons name={item.icon as any} size={24} color={C.amber} />
              </View>
              <Text style={styles.cardLabel}>{item.label}</Text>
              <Text style={styles.cardSub}>{item.sub}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Reports */}
        <Text style={styles.sectionLabel}>REPORTS</Text>
        {reportsSection.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={styles.listRow}
            onPress={() => setActiveScreen(item.id)}
            activeOpacity={0.8}
          >
            <View style={styles.listIcon}>
              <MaterialCommunityIcons name={item.icon as any} size={20} color={C.amber} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.listLabel}>{item.label}</Text>
              <Text style={styles.listSub}>{item.sub}</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color={C.muted} />
          </TouchableOpacity>
        ))}
      </ScrollView>
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
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { color: C.white, fontSize: 18, fontWeight: '900' },
  statusBar: {
    backgroundColor: C.surface, borderRadius: 12,
    flexDirection: 'row', alignItems: 'center', padding: 14,
    marginBottom: 24, borderWidth: 1, borderColor: C.border,
  },
  statusItem: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusText: { color: C.muted, fontSize: 12, fontWeight: '600', flex: 1 },
  statusDivider: { width: 1, height: 20, backgroundColor: C.border, marginHorizontal: 6 },
  sectionLabel: {
    color: C.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1.2,
    textTransform: 'uppercase', marginBottom: 12, marginTop: 4,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
  card: {
    flex: 1, minWidth: '45%', backgroundColor: C.surface,
    borderRadius: 16, padding: 18, gap: 10,
    borderWidth: 1, borderColor: C.border,
  },
  cardPrimary: { borderColor: C.amber },
  cardIcon: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: 'rgba(240,165,0,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  cardLabel: { color: C.white, fontSize: 14, fontWeight: '800' },
  cardSub: { color: C.muted, fontSize: 11, lineHeight: 16 },
  listRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: C.surface, borderRadius: 12, padding: 16, marginBottom: 10,
    borderWidth: 1, borderColor: C.border,
  },
  listIcon: {
    width: 40, height: 40, borderRadius: 10,
    backgroundColor: 'rgba(240,165,0,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  listLabel: { color: C.white, fontSize: 14, fontWeight: '700' },
  listSub: { color: C.muted, fontSize: 12, marginTop: 2 },
});
