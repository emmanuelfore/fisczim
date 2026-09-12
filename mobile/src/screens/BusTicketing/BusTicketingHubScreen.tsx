import React, { useMemo,  useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, StatusBar,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBusTicketing } from '../../hooks/useBusTicketing';
import { isBusFeatureEnabled, normalizeBusSettings, type BusFeatureKey, type BusSettings } from '../../lib/busSettings';

// Sub-screens
import { BusTicketIssueScreen } from './BusTicketIssueScreen';
import { BusRouteAdminScreen } from './BusRouteAdminScreen';
import { ConductorManagementScreen } from './ConductorManagementScreen';
import { ShiftSummaryScreen } from './ShiftSummaryScreen';
import { ReconciliationScreen } from './ReconciliationScreen';
import { BusDailyReportScreen } from './BusDailyReportScreen';
import { BusRangeReportScreen } from './BusRangeReportScreen';
import { BusConductorReportScreen } from './BusConductorReportScreen';
import { TripManifestScreen } from './TripManifestScreen';
import { BusFleetAdminScreen } from './BusFleetAdminScreen';
import { BusTripStartScreen } from './BusTripStartScreen';
import { PrinterSettingsModal } from '../../ui/PrinterSettingsModal';
import { usePrinter } from '../../hooks/usePrinter';
import { type BusColors, useBusColors } from './theme';

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
  | 'manifest'
  | 'fleet'
  | 'startTrip';

interface MenuCard {
  id: SubScreen;
  feature: BusFeatureKey;
  icon: string;
  label: string;
  sub: string;
  tone: 'amber' | 'fire' | 'success';
  section: 'conductor' | 'admin' | 'reports';
}

const MENU: MenuCard[] = [
  // Conductor section
  { id: 'startTrip', feature: 'tripSelection', icon: 'steering', label: 'Start Trip', sub: 'Select bus and route to start', tone: 'success', section: 'conductor' },
  { id: 'issueTicket', feature: 'ticketIssuing', icon: 'ticket-outline', label: 'Issue Ticket', sub: 'Create a new ticket for passengers', tone: 'amber', section: 'conductor' },
  { id: 'shiftSummary', feature: 'cashTracking', icon: 'flag-checkered', label: 'End Trip / Shift', sub: 'View today\'s totals & close shift', tone: 'fire', section: 'conductor' },
  { id: 'reconciliation', feature: 'cashTracking', icon: 'cash-sync', label: 'Reconcile Cash', sub: 'Compare expected vs received cash', tone: 'success', section: 'conductor' },
  // Admin section
  { id: 'fleet', feature: 'fleetManagement', icon: 'bus-multiple', label: 'Manage Fleet', sub: 'Add, edit vehicles', tone: 'amber', section: 'admin' },
  { id: 'routes', feature: 'fareMatrix', icon: 'bus-stop', label: 'Manage Routes', sub: 'Add, edit, and configure routes', tone: 'amber', section: 'admin' },
  { id: 'conductors', feature: 'conductorManagement', icon: 'account-tie-outline', label: 'Conductors', sub: 'Manage conductor profiles', tone: 'amber', section: 'admin' },
  { id: 'reconciliation', feature: 'cashTracking', icon: 'cash-check', label: 'Cash Sign-offs', sub: 'Approve pending conductor cash-ups', tone: 'success', section: 'admin' },
  // Reports section
  { id: 'dailyReport', feature: 'reports', icon: 'chart-bar', label: 'Daily Report', sub: 'Revenue & breakdown for a day', tone: 'amber', section: 'reports' },
  { id: 'rangeReport', feature: 'reports', icon: 'chart-line', label: 'Range Report', sub: 'Multi-day trend analysis', tone: 'amber', section: 'reports' },
  { id: 'conductorReport', feature: 'reports', icon: 'account-details-outline', label: 'Conductor Report', sub: 'Per-conductor performance', tone: 'amber', section: 'reports' },
  { id: 'manifest', feature: 'reports', icon: 'clipboard-list-outline', label: 'Trip Manifest', sub: 'Passenger list per trip', tone: 'amber', section: 'reports' },
];

interface Props {
  onClose: () => void;
  busSettings?: BusSettings;
  companyId?: number | null;
  company?: any;
  userRole?: string;
  userName?: string;
  userId?: string | null;
  view?: 'full' | 'reports';
}

export function BusTicketingHubScreen({ onClose, busSettings, companyId, company, userRole = 'member', userName = '', userId, view = 'full' }: Props) {
  const insets = useSafeAreaInsets();
  const C = useBusColors();
  const styles = useMemo(() => makeStyles(C), [C]);
  const {
    activeConductor,
    activeTrip,
    shifts,
    tickets,
    reconciliations,
    getTodaysTickets,
    routes,
    vehicles,
    refreshCloudSetup,
    syncPendingTickets,
    isOnline,
    syncStatus,
    pendingTicketCount,
    lastSyncError,
  } = useBusTicketing(companyId);
  const [activeScreen, setActiveScreen] = useState<SubScreen>(null);
  const [syncing, setSyncing] = useState(false);
  const [showPrinterSettings, setShowPrinterSettings] = useState(false);
  const { config: printerConfig } = usePrinter();
  const settings = normalizeBusSettings(busSettings);
  const role = userRole.toLowerCase();
  const isAdmin = role === 'owner' || role === 'admin' || role === 'superadmin' || userName === 'Super Admin';

  // Render sub-screens
  if (activeScreen === 'startTrip') return <BusTripStartScreen companyId={companyId} userName={userName} userRole={userRole} userId={userId} onClose={() => setActiveScreen(null)} onTripStarted={() => setActiveScreen('issueTicket')} />;
  if (activeScreen === 'issueTicket') return <BusTicketIssueScreen companyId={companyId} company={company} onClose={() => setActiveScreen(null)} />;
  if (activeScreen === 'routes') return <BusRouteAdminScreen companyId={companyId} onClose={() => setActiveScreen(null)} />;
  if (activeScreen === 'fleet') return <BusFleetAdminScreen companyId={companyId} onClose={() => setActiveScreen(null)} />;
  if (activeScreen === 'conductors') return <ConductorManagementScreen companyId={companyId} onClose={() => setActiveScreen(null)} />;
  if (activeScreen === 'shiftSummary') return (
    <ShiftSummaryScreen
      companyId={companyId}
      shiftStartTime={activeTrip?.actualDeparture ?? activeTrip?.scheduledDeparture}
      onClose={() => setActiveScreen(null)}
    />
  );
  if (activeScreen === 'reconciliation') return <ReconciliationScreen companyId={companyId} userRole={userRole} userName={userName} onClose={() => setActiveScreen(null)} />;
  if (activeScreen === 'dailyReport') return <BusDailyReportScreen userRole={userRole} userName={userName} userId={userId} onClose={() => setActiveScreen(null)} />;
  if (activeScreen === 'rangeReport') return <BusRangeReportScreen userRole={userRole} userName={userName} userId={userId} onClose={() => setActiveScreen(null)} />;
  if (activeScreen === 'conductorReport') return <BusConductorReportScreen userRole={userRole} userName={userName} userId={userId} onClose={() => setActiveScreen(null)} />;
  if (activeScreen === 'manifest') return <TripManifestScreen userRole={userRole} userName={userName} userId={userId} onClose={() => setActiveScreen(null)} />;

  const todayTickets = getTodaysTickets();

  // Filter conductor actions based on whether a trip is active
  const visibleMenu = MENU.filter((m) => isBusFeatureEnabled(settings, m.feature));
  const rawConductorSection = visibleMenu.filter((m) => m.section === 'conductor');
  const hasClosedShiftToday = shifts.some((shift) => {
    const sameConductor = !activeConductor?.id || shift.conductorId === activeConductor.id;
    return sameConductor && shift.date === new Date().toISOString().slice(0, 10);
  });
  const todayDate = new Date().toISOString().slice(0, 10);
  const todaysConductorTickets = tickets.filter((ticket) => {
    const sameDay = ticket.issuedAt.slice(0, 10) === todayDate;
    const sameConductor = !activeConductor?.id || ticket.conductorId === activeConductor.id;
    return sameDay && sameConductor;
  });
  const expectedCashToday = todaysConductorTickets.reduce((sum, ticket) => sum + ticket.totalAmount, 0);
  const hasSubmittedReconciliationToday = reconciliations.some((record) => {
    const sameConductor = !activeConductor?.id || record.conductorId === activeConductor.id;
    const openOrDone = (record.status ?? 'pending') !== 'rejected';
    return sameConductor && record.date === todayDate && openOrDone;
  });
  const isConductorReconciliationDisabled = hasSubmittedReconciliationToday || expectedCashToday <= 0;
  const getMenuSub = (item: MenuCard) => {
    if (item.id !== 'reconciliation' || item.section !== 'conductor') return item.sub;
    if (hasSubmittedReconciliationToday) return 'Reconciliation already done today';
    if (expectedCashToday <= 0) return 'No expected cash to reconcile';
    return item.sub;
  };
  const conductorSection = isAdmin
    ? []
    : activeTrip
      ? rawConductorSection.filter(m => m.id === 'issueTicket' || m.id === 'shiftSummary')
      : rawConductorSection.filter(m => m.id === 'startTrip' || (m.id === 'reconciliation' && hasClosedShiftToday));

  const adminSection = isAdmin ? visibleMenu.filter((m) => m.section === 'admin') : [];
  const reportsSection = visibleMenu.filter((m) => m.section === 'reports');
  const title = view === 'reports' ? 'Trip Reports' : 'Bus Ticketing';

  // Helpers to display active trip details
  const activeRoute = activeTrip ? routes.find(r => r.id === activeTrip.routeId) : null;
  const activeVehicle = activeTrip ? vehicles.find(v => v.id === activeTrip.vehicleId) : null;
  const showingSync = syncing || syncStatus === 'syncing';
  const modeColor = showingSync ? C.amber : isOnline ? C.success : C.danger;
  const modeIcon = showingSync ? 'sync' : isOnline ? 'wifi' : 'wifi-off';
  const modeLabel = showingSync ? 'System syncing' : isOnline ? 'Online mode' : 'Offline mode';
  const syncDetail = showingSync
    ? `${pendingTicketCount} sale${pendingTicketCount === 1 ? '' : 's'} pending`
    : pendingTicketCount > 0
      ? `${pendingTicketCount} sale${pendingTicketCount === 1 ? '' : 's'} waiting to sync`
      : 'All bus sales synced';

  async function handleSync() {
    if (syncing || !isOnline) return;
    setSyncing(true);
    try {
      await refreshCloudSetup();
      await syncPendingTickets();
    } catch (e) {
      console.warn('[BusTicketingHub] Sync failed:', e);
    } finally {
      setSyncing(false);
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
        <View style={styles.headerCenter}>
          <MaterialCommunityIcons name="bus" size={20} color={C.amber} />
          <Text style={styles.headerTitle}>{title}</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => setShowPrinterSettings(true)} style={styles.backBtn}>
            <MaterialCommunityIcons name="printer-outline" size={22} color={printerConfig.enabled ? C.success : C.muted} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleSync} style={styles.backBtn} disabled={syncing || !isOnline}>
            <MaterialCommunityIcons name={syncing ? "sync" : "cloud-sync-outline"} size={22} color={isOnline ? C.amber : C.muted} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {!settings.enabled && (
          <View style={styles.statusBar}>
            <Text style={styles.statusText}>Bus ticketing is hidden by admin settings.</Text>
          </View>
        )}

        {/* Sync Status bar */}
        {!isAdmin && (
          <View style={[styles.syncBar, { borderColor: `${modeColor}66` }]}>
            <View style={styles.statusItem}>
              <MaterialCommunityIcons name={modeIcon as any} size={18} color={modeColor} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.syncTitle, { color: modeColor }]}>{modeLabel}</Text>
                <Text style={styles.syncSub}>{lastSyncError ? `Sync issue: ${lastSyncError}` : syncDetail}</Text>
              </View>
            </View>
            <TouchableOpacity onPress={handleSync} disabled={showingSync || !isOnline} style={[styles.syncButton, (!isOnline || showingSync) && { opacity: 0.55 }]}>
              <MaterialCommunityIcons name={showingSync ? "sync" : "cloud-sync-outline"} size={16} color="#000" />
              <Text style={styles.syncButtonText}>{showingSync ? 'Syncing' : 'Sync'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Status bar */}
        {!isAdmin && (
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
        )}

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

        {view === 'full' && conductorSection.length > 0 && (
          <>
            {/* Conductor actions */}
            <Text style={styles.sectionLabel}>CONDUCTOR</Text>
            <View style={styles.grid}>
              {conductorSection.map((item) => {
                const itemColor = C[item.tone];
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      styles.card,
                      item.id === 'issueTicket' && styles.cardPrimary,
                      item.id === 'reconciliation' && isConductorReconciliationDisabled && styles.cardDisabled,
                    ]}
                    onPress={() => {
                      if (item.id === 'reconciliation' && isConductorReconciliationDisabled) return;
                      setActiveScreen(item.id);
                    }}
                    disabled={item.id === 'reconciliation' && isConductorReconciliationDisabled}
                    activeOpacity={0.8}
                  >
                    <View style={[
                      styles.cardIcon,
                      { backgroundColor: item.id === 'issueTicket' ? C.amber : C.amberSoft },
                      item.id === 'reconciliation' && isConductorReconciliationDisabled && styles.cardIconDisabled,
                    ]}>
                      <MaterialCommunityIcons
                        name={item.icon as any}
                        size={24}
                        color={item.id === 'reconciliation' && isConductorReconciliationDisabled ? C.muted : item.id === 'issueTicket' ? '#000' : itemColor}
                      />
                    </View>
                    <Text style={[styles.cardLabel, item.id === 'reconciliation' && isConductorReconciliationDisabled && { color: C.muted }]}>{item.label}</Text>
                    <Text style={styles.cardSub}>{getMenuSub(item)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        {view === 'full' && adminSection.length > 0 && (
          <>
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
          </>
        )}

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
      <PrinterSettingsModal visible={showPrinterSettings} onClose={() => setShowPrinterSettings(false)} />
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
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { color: C.white, fontSize: 18, fontWeight: '900' },
  statusBar: {
    backgroundColor: C.surface, borderRadius: 12,
    flexDirection: 'row', alignItems: 'center', padding: 14,
    marginBottom: 24, borderWidth: 1, borderColor: C.border,
  },
  syncBar: {
    backgroundColor: C.surface, borderRadius: 12,
    flexDirection: 'row', alignItems: 'center', padding: 14,
    marginBottom: 12, borderWidth: 1,
  },
  statusItem: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusText: { color: C.muted, fontSize: 12, fontWeight: '600', flex: 1 },
  syncTitle: { fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  syncSub: { color: C.muted, fontSize: 11, fontWeight: '600', marginTop: 2 },
  syncButton: {
    backgroundColor: C.amber, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8,
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  syncButtonText: { color: '#000', fontSize: 12, fontWeight: '900' },
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
  cardDisabled: { opacity: 0.55, borderColor: C.border },
  cardPrimary: { borderColor: C.amber },
  cardIcon: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: C.amberSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  cardIconDisabled: { backgroundColor: C.surfaceAlt },
  cardLabel: { color: C.white, fontSize: 14, fontWeight: '800' },
  cardSub: { color: C.muted, fontSize: 11, lineHeight: 16 },
  listRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: C.surface, borderRadius: 12, padding: 16, marginBottom: 10,
    borderWidth: 1, borderColor: C.border,
  },
  listIcon: {
    width: 40, height: 40, borderRadius: 10,
    backgroundColor: C.amberSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  listLabel: { color: C.white, fontSize: 14, fontWeight: '700' },
  listSub: { color: C.muted, fontSize: 12, marginTop: 2 },
});
