import React, { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Alert, StatusBar,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBusTicketing } from '../../hooks/useBusTicketing';
import { getDailySummary } from '../../hooks/useBusReports';
import { ReconciliationRecord } from '../../types/busTicketing';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

interface Props { onClose: () => void; }

export function ReconciliationScreen({ onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { tickets: allTickets, activeConductor } = useBusTicketing();
  const today = new Date();
  const summary = useMemo(() => getDailySummary(allTickets, today), [allTickets]);

  const [cashReceived, setCashReceived] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const expectedCash = summary.totalRevenue;
  const received = parseFloat(cashReceived) || 0;
  const gap = parseFloat((received - expectedCash).toFixed(2));
  const isShortage = gap < 0;
  const isSurplus = gap > 0;

  async function handleSave() {
    if (!cashReceived.trim()) {
      Alert.alert('Validation', 'Please enter the cash received amount.');
      return;
    }
    setSaving(true);
    try {
      const record: ReconciliationRecord = {
        id: uuid(),
        conductorId: activeConductor?.id ?? '',
        conductorName: activeConductor?.name ?? 'Unknown',
        date: today.toISOString().slice(0, 10),
        expectedCash,
        cashReceived: received,
        gap,
        notes: notes.trim() || undefined,
        savedAt: new Date().toISOString(),
      };
      const raw = await AsyncStorage.getItem('fieldpos_reconciliations');
      const existing: ReconciliationRecord[] = raw ? JSON.parse(raw) : [];
      await AsyncStorage.setItem('fieldpos_reconciliations', JSON.stringify([...existing, record]));
      Alert.alert('Saved', 'Reconciliation record saved successfully.');
      onClose();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  }

  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const dateLabel = `${String(today.getDate()).padStart(2,'0')} ${months[today.getMonth()]} ${today.getFullYear()}`;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={C.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Reconciliation</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
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
          value={cashReceived}
          onChangeText={setCashReceived}
        />

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
