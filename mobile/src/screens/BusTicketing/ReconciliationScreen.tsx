import React, { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Alert, StatusBar, Keyboard, KeyboardAvoidingView, Platform, InputAccessoryView,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBusTicketing } from '../../hooks/useBusTicketing';
import { getDailySummary } from '../../hooks/useBusReports';
import { ReconciliationRecord } from '../../types/busTicketing';

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

interface Props {
  onClose: () => void;
  companyId?: number | null;
  userRole?: string;
  userName?: string;
}

export function ReconciliationScreen({ onClose, companyId, userRole = 'member', userName = 'Admin' }: Props) {
  const insets = useSafeAreaInsets();
  const cashInputAccessoryId = 'reconciliation-cash-actions';
  const {
    tickets: allTickets,
    activeConductor,
    activeTrip,
    shifts,
    reconciliations,
    saveReconciliation,
    signOffReconciliation,
  } = useBusTicketing(companyId);
  const today = new Date();
  const summary = useMemo(() => getDailySummary(allTickets, today), [allTickets]);

  const [cashReceived, setCashReceived] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const expectedCash = summary.totalRevenue;
  const role = userRole.toLowerCase();
  const isAdmin = role === 'owner' || role === 'admin' || role === 'superadmin' || userName === 'Super Admin';
  const todayDate = today.toISOString().slice(0, 10);
  const pendingRecords = reconciliations.filter((record) => (record.status ?? 'pending') === 'pending');
  const conductorRecords = reconciliations
    .filter((record) => !activeConductor?.id || record.conductorId === activeConductor.id)
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  const latestConductorRecord = conductorRecords[0];
  const hasPendingConductorRecord = conductorRecords.some((record) => (record.status ?? 'pending') === 'pending');
  const hasSubmittedToday = conductorRecords.some((record) => record.date === todayDate && (record.status ?? 'pending') !== 'rejected');
  const hasClosedShiftToday = shifts.some((shift) => {
    const sameConductor = !activeConductor?.id || shift.conductorId === activeConductor.id;
    return sameConductor && shift.date === todayDate;
  });
  const received = parseFloat(cashReceived) || 0;
  const gap = parseFloat((received - expectedCash).toFixed(2));
  const isShortage = gap < 0;
  const isSurplus = gap > 0;
  const tripIsRunning = activeTrip
    ? ['in_progress', 'boarding', 'en_route'].includes(String(activeTrip.status).trim().toLowerCase())
    : false;

  async function handleSave() {
    if (tripIsRunning) {
      Alert.alert('Trip Still Active', 'End the trip before reconciling cash.');
      return;
    }
    if (!hasClosedShiftToday) {
      Alert.alert('End Trip First', 'You can reconcile only after ending the trip.');
      return;
    }
    if (hasSubmittedToday) {
      Alert.alert('Already Reconciled', 'This conductor already has a reconciliation for today.');
      return;
    }
    if (expectedCash <= 0) {
      Alert.alert('No Expected Cash', 'There is no expected cash to reconcile for today.');
      return;
    }
    if (!cashReceived.trim()) {
      Alert.alert('Validation', 'Please enter the cash received amount.');
      return;
    }
    if (hasPendingConductorRecord) {
      Alert.alert('Pending Sign-off', 'You already have a reconciliation waiting for admin sign-off.');
      return;
    }
    setSaving(true);
    try {
      const latestShift = shifts
        .filter((shift) => !activeConductor?.id || shift.conductorId === activeConductor.id)
        .sort((a, b) => b.closedAt.localeCompare(a.closedAt))[0];
      const record: ReconciliationRecord = {
        id: uuid(),
        conductorId: activeConductor?.id ?? '',
        conductorName: activeConductor?.name ?? 'Unknown',
        date: todayDate,
        tripId: latestShift?.tripId,
        shiftId: latestShift?.id,
        expectedCash,
        cashReceived: received,
        gap,
        notes: notes.trim() || undefined,
        savedAt: new Date().toISOString(),
        status: 'pending',
      };
      await saveReconciliation(record);
      Alert.alert('Submitted', 'Reconciliation submitted and waiting for admin sign-off.');
      onClose();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  }

  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const dateLabel = `${String(today.getDate()).padStart(2,'0')} ${months[today.getMonth()]} ${today.getFullYear()}`;

  async function handleSignOff(record: ReconciliationRecord, status: 'approved' | 'rejected') {
    const verb = status === 'approved' ? 'Approve' : 'Reject';
    Alert.alert(`${verb} Cash-up`, `${verb} ${record.conductorName}'s reconciliation?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: verb,
        style: status === 'rejected' ? 'destructive' : 'default',
        onPress: async () => {
          await signOffReconciliation(record.id, status, userName);
        },
      },
    ]);
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={insets.top}
    >
    <View style={{ flex: 1, paddingTop: insets.top }}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={C.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Reconciliation</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {isAdmin && (
          <>
            <View style={styles.statusCard}>
              <MaterialCommunityIcons
                name={pendingRecords.length > 0 ? 'alert-circle-outline' : 'check-circle-outline'}
                size={22}
                color={pendingRecords.length > 0 ? C.amber : C.success}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.statusTitle}>
                  {pendingRecords.length > 0 ? `${pendingRecords.length} pending sign-off${pendingRecords.length === 1 ? '' : 's'}` : 'No pending cash-ups'}
                </Text>
                <Text style={styles.statusSub}>Admin approval locks the conductor cash-up record.</Text>
              </View>
            </View>

            {pendingRecords.map((record) => (
              <View key={record.id} style={styles.pendingCard}>
                <View style={styles.pendingHeader}>
                  <View>
                    <Text style={styles.pendingName}>{record.conductorName}</Text>
                    <Text style={styles.pendingMeta}>{record.date} | Submitted {new Date(record.savedAt).toLocaleTimeString()}</Text>
                  </View>
                  <Text style={[styles.pendingGap, { color: record.gap < 0 ? C.danger : record.gap > 0 ? C.success : C.success }]}>
                    {record.gap < 0 ? '-' : record.gap > 0 ? '+' : ''}${Math.abs(record.gap).toFixed(2)}
                  </Text>
                </View>
                <View style={styles.pendingTotals}>
                  <Text style={styles.pendingText}>Expected: ${record.expectedCash.toFixed(2)}</Text>
                  <Text style={styles.pendingText}>Actual: ${record.cashReceived.toFixed(2)}</Text>
                </View>
                {!!record.notes && <Text style={styles.pendingNotes}>{record.notes}</Text>}
                <View style={styles.signRow}>
                  <TouchableOpacity style={[styles.signBtn, { borderColor: C.danger }]} onPress={() => handleSignOff(record, 'rejected')}>
                    <Text style={[styles.signBtnText, { color: C.danger }]}>Reject</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.signBtn, { backgroundColor: C.success, borderColor: C.success }]} onPress={() => handleSignOff(record, 'approved')}>
                    <Text style={[styles.signBtnText, { color: '#000' }]}>Approve</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </>
        )}

        {!isAdmin && latestConductorRecord && (
          <View style={styles.statusCard}>
            <MaterialCommunityIcons
              name={(latestConductorRecord.status ?? 'pending') === 'approved' ? 'check-decagram-outline' : (latestConductorRecord.status ?? 'pending') === 'rejected' ? 'close-octagon-outline' : 'clock-outline'}
              size={22}
              color={(latestConductorRecord.status ?? 'pending') === 'approved' ? C.success : (latestConductorRecord.status ?? 'pending') === 'rejected' ? C.danger : C.amber}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.statusTitle}>Latest cash-up: {(latestConductorRecord.status ?? 'pending').toUpperCase()}</Text>
              <Text style={styles.statusSub}>
                Expected ${latestConductorRecord.expectedCash.toFixed(2)} | Actual ${latestConductorRecord.cashReceived.toFixed(2)}
              </Text>
            </View>
          </View>
        )}

        {/* Date + conductor */}
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

        {/* Expected */}
        <View style={styles.expectedCard}>
          <Text style={styles.expectedLabel}>EXPECTED CASH</Text>
          <Text style={styles.expectedAmount}>${expectedCash.toFixed(2)}</Text>
          <Text style={styles.expectedHint}>Based on today's issued tickets</Text>
        </View>

        {/* Cash received */}
        <Text style={styles.label}>CASH RECEIVED</Text>
        <TextInput
          style={styles.input}
          placeholder="0.00"
          placeholderTextColor={C.muted}
          keyboardType="decimal-pad"
          inputAccessoryViewID={cashInputAccessoryId}
          returnKeyType="done"
          blurOnSubmit
          onSubmitEditing={() => Keyboard.dismiss()}
          value={cashReceived}
          onChangeText={setCashReceived}
        />
        {Platform.OS === 'ios' && (
          <InputAccessoryView nativeID={cashInputAccessoryId}>
            <View style={styles.keyboardBar}>
              <TouchableOpacity style={styles.keyboardAction} onPress={() => Keyboard.dismiss()}>
                <Text style={styles.keyboardActionText}>Done</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.keyboardAction, styles.keyboardSave]} onPress={handleSave} disabled={saving}>
                <Text style={[styles.keyboardActionText, { color: '#000' }]}>{saving ? 'Saving...' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </InputAccessoryView>
        )}

        {/* Gap indicator */}
        {cashReceived.trim() !== '' && (
          <View style={[
            styles.gapCard,
            isShortage && { borderColor: C.danger },
            isSurplus && { borderColor: C.success },
            gap === 0 && { borderColor: C.success },
          ]}>
            <MaterialCommunityIcons
              name={isShortage ? 'alert-circle-outline' : isSurplus ? 'trending-up' : 'check-circle-outline'}
              size={24}
              color={isShortage ? C.danger : isSurplus ? C.success : C.success}
            />
            <View>
              <Text style={[
                styles.gapLabel,
                { color: isShortage ? C.danger : isSurplus ? C.success : C.success }
              ]}>
                {isShortage ? 'SHORTAGE' : isSurplus ? 'SURPLUS' : 'BALANCED'}
              </Text>
              <Text style={[
                styles.gapAmount,
                { color: isShortage ? C.danger : isSurplus ? C.success : C.success }
              ]}>
                {isShortage ? '-' : isSurplus ? '+' : ''} ${Math.abs(gap).toFixed(2)}
              </Text>
            </View>
          </View>
        )}

        {/* Notes */}
        <Text style={styles.label}>NOTES (OPTIONAL)</Text>
        <TextInput
          style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
          placeholder="Any notes about discrepancies..."
          placeholderTextColor={C.muted}
          value={notes}
          onChangeText={setNotes}
          multiline
          returnKeyType="done"
          blurOnSubmit
          onSubmitEditing={() => Keyboard.dismiss()}
        />

        <TouchableOpacity
          style={[styles.saveBtn, saving && { opacity: 0.7 }]}
          onPress={handleSave}
          disabled={saving}
        >
          <MaterialCommunityIcons name="content-save-outline" size={20} color="#000" />
          <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save Reconciliation'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
    </KeyboardAvoidingView>
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
  metaRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    backgroundColor: C.surface, borderRadius: 12, padding: 16, marginBottom: 16,
  },
  metaItem: { gap: 4 },
  metaLabel: { color: C.muted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  metaValue: { color: C.white, fontSize: 14, fontWeight: '700' },
  statusCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.surface, borderRadius: 12, padding: 14, marginBottom: 16,
    borderWidth: 1, borderColor: C.border,
  },
  statusTitle: { color: C.white, fontSize: 14, fontWeight: '800' },
  statusSub: { color: C.muted, fontSize: 11, marginTop: 2 },
  pendingCard: {
    backgroundColor: C.surface, borderRadius: 12, padding: 14, marginBottom: 12,
    borderWidth: 1, borderColor: C.border,
  },
  pendingHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  pendingName: { color: C.white, fontSize: 15, fontWeight: '800' },
  pendingMeta: { color: C.muted, fontSize: 11, marginTop: 3 },
  pendingGap: { fontSize: 20, fontWeight: '900' },
  pendingTotals: { flexDirection: 'row', gap: 12, marginTop: 12 },
  pendingText: { color: C.muted, fontSize: 12, fontWeight: '700' },
  pendingNotes: { color: C.white, fontSize: 12, marginTop: 10, lineHeight: 17 },
  signRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  signBtn: {
    flex: 1, borderRadius: 10, borderWidth: 1, paddingVertical: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  signBtnText: { fontSize: 13, fontWeight: '900' },
  expectedCard: {
    backgroundColor: 'rgba(240,165,0,0.1)', borderRadius: 12,
    padding: 20, alignItems: 'center', marginBottom: 24,
    borderWidth: 1, borderColor: 'rgba(240,165,0,0.3)',
  },
  expectedLabel: { color: C.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  expectedAmount: { color: C.amber, fontSize: 36, fontWeight: '900', marginTop: 6 },
  expectedHint: { color: C.muted, fontSize: 12, marginTop: 4 },
  label: { color: C.muted, fontSize: 12, fontWeight: '700', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    backgroundColor: C.surface, color: C.white, borderWidth: 1, borderColor: C.border,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 16,
  },
  keyboardBar: {
    minHeight: 48,
    backgroundColor: C.surface,
    borderTopWidth: 1,
    borderTopColor: C.border,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  keyboardAction: {
    minHeight: 36,
    paddingHorizontal: 16,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },
  keyboardSave: {
    backgroundColor: C.amber,
    borderColor: C.amber,
  },
  keyboardActionText: { color: C.white, fontSize: 14, fontWeight: '900' },
  gapCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: C.surface, borderRadius: 12, padding: 16,
    marginBottom: 16, borderWidth: 1, borderColor: C.border,
  },
  gapLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  gapAmount: { fontSize: 24, fontWeight: '900', marginTop: 2 },
  saveBtn: {
    backgroundColor: C.amber, borderRadius: 14, paddingVertical: 18,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    marginTop: 8,
  },
  saveBtnText: { color: '#000', fontWeight: '900', fontSize: 17 },
});
