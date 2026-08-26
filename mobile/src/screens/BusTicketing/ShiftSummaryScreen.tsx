import React, { useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert, Share, StatusBar, TextInput, Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBusTicketing } from '../../hooks/useBusTicketing';
import { getDailySummary, formatAsCSV, formatAsWhatsAppText } from '../../hooks/useBusReports';
import { ShiftRecord } from '../../types/busTicketing';
import { type BusColors, useBusColors } from './theme';

function fmtMoney(n: number) { return `$${n.toFixed(2)}`; }
function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}
function fmtTime24(d: Date) {
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

interface Props { onClose: () => void; companyId?: number | null; shiftStartTime?: string; }

export function ShiftSummaryScreen({ onClose, companyId, shiftStartTime }: Props) {
  const insets = useSafeAreaInsets();
  const C = useBusColors();
  const styles = makeStyles(C);
  const { activeConductor, activeTrip, closeShift, getTodaysTickets } = useBusTicketing(companyId);

  const today = new Date();
  const todayTickets = getTodaysTickets().filter((ticket) => !activeTrip?.id || ticket.tripId === activeTrip.id);
  const summary = useMemo(() => getDailySummary(todayTickets, today), [todayTickets]);
  const [closing, setClosing] = useState(false);
  const [showCashModal, setShowCashModal] = useState(false);
  const [cashReceived, setCashReceived] = useState<string>('');

  async function handleCloseShift() {
    if (!activeTrip) {
      Alert.alert('No Active Trip', 'There is no active trip to end.');
      return;
    }
    // Show cash reconciliation modal
    setCashReceived(summary.totalRevenue.toFixed(2));
    setShowCashModal(true);
  }

  async function confirmCloseShift() {
    const cashReceivedNum = parseFloat(cashReceived) || 0;
    const expectedCash = summary.totalRevenue;
    const gap = cashReceivedNum - expectedCash;

    if (Math.abs(gap) > 0.01) {
      const confirm = await new Promise<boolean>((resolve) => {
        Alert.alert(
          'Cash Mismatch',
          `Expected: ${fmtMoney(expectedCash)}\nReceived: ${fmtMoney(cashReceivedNum)}\nGap: ${fmtMoney(gap)}${gap > 0 ? ' (over)' : ' (short)'}\n\nProceed anyway?`,
          [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Proceed', style: 'destructive', onPress: () => resolve(true) },
          ]
        );
      });
      if (!confirm) return;
    }

    setShowCashModal(false);
    setClosing(true);
    try {
      if (!activeTrip) {
        Alert.alert('No Active Trip', 'There is no active trip to end.');
        setClosing(false);
        return;
      }
      const now = new Date();
      const startTime = shiftStartTime
        ? fmtTime24(new Date(shiftStartTime))
        : fmtTime24(activeTrip!.actualDeparture ? new Date(activeTrip!.actualDeparture) : today);
      const record: ShiftRecord = {
        id: uuid(),
        conductorId: activeConductor?.id,
        conductorName: activeConductor?.name,
        date: today.toISOString().slice(0, 10),
        shiftStart: startTime,
        shiftEnd: fmtTime24(now),
        vehicleId: activeTrip!.vehicleId,
        tripId: activeTrip!.id,
        routeId: activeTrip!.routeId,
        totalTickets: summary.totalTickets,
        totalPassengers: summary.totalPassengers,
        totalRevenue: summary.totalRevenue,
        closedAt: now.toISOString(),
        // Add cash reconciliation fields
        expectedCash: expectedCash,
        cashReceived: cashReceivedNum,
        gap: gap,
      };
      await closeShift(record);
      Alert.alert('Shift Closed', 'Shift has been recorded successfully.');
      onClose();
    } catch (e: any) {
      Alert.alert('Trip Not Closed', e?.message || 'The trip could not be closed. Please try again while online.');
    } finally {
      setClosing(false);
    }
  }

  async function handleShareCSV() {
    try {
      const csv = formatAsCSV(todayTickets);
      await Share.share({ message: csv, title: `tickets_${today.toISOString().slice(0,10)}.csv` });
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  }

  async function handleShareWhatsApp() {
    const text = formatAsWhatsAppText(summary, activeConductor?.name ?? 'Unknown');
    await Share.share({ message: text });
  }

  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const dateLabel = `${String(today.getDate()).padStart(2,'0')} ${months[today.getMonth()]} ${today.getFullYear()}`;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle={C.statusBarStyle} backgroundColor={C.bg} />

      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={C.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Shift Summary</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* Conductor + Date */}
        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>CONDUCTOR</Text>
            <Text style={styles.metaValue}>{activeConductor?.name ?? '—'}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>DATE</Text>
            <Text style={styles.metaValue}>{dateLabel}</Text>
          </View>
        </View>

        {/* KPI cards */}
        <View style={styles.kpiRow}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiValue}>{summary.totalTickets}</Text>
            <Text style={styles.kpiLabel}>Tickets</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiValue}>{summary.totalPassengers}</Text>
            <Text style={styles.kpiLabel}>Passengers</Text>
          </View>
          <View style={[styles.kpiCard, { borderColor: C.amber }]}>
            <Text style={[styles.kpiValue, { color: C.amber }]}>{fmtMoney(summary.totalRevenue)}</Text>
            <Text style={styles.kpiLabel}>Revenue</Text>
          </View>
        </View>

        {/* Route breakdown */}
        {summary.byRoute.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>BY ROUTE</Text>
            {summary.byRoute.map((rb) => (
              <View key={rb.routeId} style={styles.tableRow}>
                <Text style={styles.tableRouteName} numberOfLines={1}>{rb.routeName}</Text>
                <Text style={styles.tableTickets}>{rb.ticketCount} tkts</Text>
                <Text style={styles.tableRevenue}>{fmtMoney(rb.revenue)}</Text>
              </View>
            ))}
          </>
        )}

        {/* Payment breakdown */}
        {summary.byPaymentMethod.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>PAYMENT METHOD</Text>
            <View style={styles.payRow}>
              {summary.byPaymentMethod.map((pb) => (
                <View key={pb.method} style={styles.payCard}>
                  <Text style={styles.payMethod}>{pb.method}</Text>
                  <Text style={styles.payAmount}>{fmtMoney(pb.amount)}</Text>
                  <Text style={styles.payPct}>{pb.percentage}%</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Share buttons */}
        <View style={styles.shareRow}>
          <TouchableOpacity style={styles.shareBtn} onPress={handleShareCSV}>
            <MaterialCommunityIcons name="file-delimited-outline" size={18} color={C.amber} />
            <Text style={styles.shareBtnText}>Export CSV</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.shareBtn} onPress={handleShareWhatsApp}>
            <MaterialCommunityIcons name="whatsapp" size={18} color={C.success} />
            <Text style={styles.shareBtnText}>WhatsApp</Text>
          </TouchableOpacity>
        </View>

        {/* Close shift */}
        <TouchableOpacity
          style={[styles.closeShiftBtn, closing && { opacity: 0.7 }]}
          onPress={handleCloseShift}
          disabled={closing}
        >
          <MaterialCommunityIcons name="flag-checkered" size={20} color={C.white} />
          <Text style={styles.closeShiftBtnText}>{closing ? 'Closing...' : 'Close Shift'}</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Cash Reconciliation Modal */}
      <Modal visible={showCashModal} animationType="slide" transparent={false}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalContainer}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Cash Reconciliation</Text>
            </View>
            <View style={styles.modalBody}>
              <View style={styles.cashRow}>
                <Text style={styles.cashLabel}>Expected Cash</Text>
                <Text style={styles.cashValueExpected}>{fmtMoney(summary.totalRevenue)}</Text>
              </View>
              <View style={styles.cashRow}>
                <Text style={styles.cashLabel}>Cash Received</Text>
                <TextInput
                  style={styles.cashInput}
                  value={cashReceived}
                  onChangeText={setCashReceived}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  autoFocus
                />
              </View>
              <View style={styles.cashRow}>
                <Text style={styles.cashLabel}>Gap</Text>
                <Text style={[
                  styles.cashValueGap,
                  { color: (parseFloat(cashReceived) || 0) - summary.totalRevenue > 0 ? C.success : C.danger }
                ]}>
                  {fmtMoney((parseFloat(cashReceived) || 0) - summary.totalRevenue)}
                </Text>
              </View>
            </View>
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setShowCashModal(false)}>
                <Text style={styles.modalBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalBtnConfirm} onPress={confirmCloseShift} disabled={closing}>
                <Text style={styles.modalBtnTextConfirm}>{closing ? 'Closing...' : 'Confirm & Close Shift'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
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
  metaRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    backgroundColor: C.surface, borderRadius: 12, padding: 16, marginBottom: 16,
  },
  metaItem: { gap: 4 },
  metaLabel: { color: C.muted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  metaValue: { color: C.white, fontSize: 14, fontWeight: '700' },
  kpiRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  kpiCard: {
    flex: 1, backgroundColor: C.surface, borderRadius: 12, padding: 14,
    alignItems: 'center', borderWidth: 1, borderColor: C.border,
  },
  kpiValue: { color: C.white, fontSize: 22, fontWeight: '900' },
  kpiLabel: { color: C.muted, fontSize: 11, fontWeight: '600', marginTop: 4 },
  sectionTitle: { color: C.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10, marginTop: 4 },
  tableRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.surface, borderRadius: 10, padding: 12,
    marginBottom: 8, gap: 8,
  },
  tableRouteName: { flex: 1, color: C.white, fontSize: 13, fontWeight: '600' },
  tableTickets: { color: C.muted, fontSize: 12 },
  tableRevenue: { color: C.amber, fontSize: 13, fontWeight: '700', minWidth: 60, textAlign: 'right' },
  payRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  payCard: {
    backgroundColor: C.surface, borderRadius: 10, padding: 12, minWidth: 80,
    alignItems: 'center', borderWidth: 1, borderColor: C.border,
  },
  payMethod: { color: C.white, fontSize: 12, fontWeight: '700' },
  payAmount: { color: C.amber, fontSize: 14, fontWeight: '900', marginTop: 4 },
  payPct: { color: C.muted, fontSize: 10, marginTop: 2 },
  shareRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  shareBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: C.surface, borderRadius: 12, paddingVertical: 14,
    borderWidth: 1, borderColor: C.border,
  },
  shareBtnText: { color: C.white, fontWeight: '700', fontSize: 14 },
  closeShiftBtn: {
    backgroundColor: C.fire, borderRadius: 14, paddingVertical: 18,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
  },
  closeShiftBtnText: { color: C.white, fontWeight: '900', fontSize: 17 },
  // Modal styles
  modalContainer: { flex: 1, backgroundColor: C.bg, justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: C.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 30, maxHeight: '80%',
  },
  modalHeader: { borderBottomWidth: 1, borderBottomColor: C.border, paddingBottom: 16, marginBottom: 16 },
  modalTitle: { color: C.white, fontSize: 18, fontWeight: '800' },
  modalBody: { gap: 16, marginBottom: 24 },
  cashRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cashLabel: { color: C.muted, fontSize: 14, fontWeight: '600' },
  cashValueExpected: { color: C.amber, fontSize: 18, fontWeight: '800' },
  cashInput: {
    backgroundColor: C.bg, color: C.white, borderWidth: 1, borderColor: C.border,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 18,
    fontWeight: '700', textAlign: 'right', minWidth: 100,
  },
  cashValueGap: { fontSize: 18, fontWeight: '800' },
  modalButtons: { flexDirection: 'row', gap: 12 },
  modalBtnCancel: {
    flex: 1, backgroundColor: C.surface, borderRadius: 12, paddingVertical: 14,
    alignItems: 'center', borderWidth: 1, borderColor: C.border,
  },
  modalBtnConfirm: {
    flex: 1, backgroundColor: C.fire, borderRadius: 12, paddingVertical: 14,
    alignItems: 'center',
  },
  modalBtnText: { color: C.white, fontWeight: '700', fontSize: 15 },
  modalBtnTextConfirm: { color: C.white, fontWeight: '800', fontSize: 15 },
});
