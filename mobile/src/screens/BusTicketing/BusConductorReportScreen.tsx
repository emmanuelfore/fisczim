import React, { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  StatusBar,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBusTicketing } from '../../hooks/useBusTicketing';
import { getConductorReport, isCashierUser, resolveCashierConductorId } from '../../hooks/useBusReports';
import { type BusColors, useBusColors } from './theme';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fmtMoney(n: number) { return `$${n.toFixed(2)}`; }
function fmtDate(d: Date) {
  return `${String(d.getDate()).padStart(2,'0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
function addDays(d: Date, n: number): Date {
  const copy = new Date(d); copy.setDate(copy.getDate() + n); return copy;
}

interface Props { onClose: () => void; userRole?: string; userName?: string; userId?: string | null; }

export function BusConductorReportScreen({ onClose, userRole, userName, userId }: Props) {
  const insets = useSafeAreaInsets();
  const C = useBusColors();
  const styles = useMemo(() => makeStyles(C), [C]);
  const { tickets: allTickets, conductors, activeConductor } = useBusTicketing();

  const today = new Date();
  const [selectedDate, setSelectedDate] = useState(today);
  const [showPicker, setShowPicker] = useState(false);
  const [conductorIndex, setConductorIndex] = useState(0);

  // Cashiers only see their own conductor in the report
  const restrictToOwn = isCashierUser(userRole, userName);
  const visibleConductors = useMemo(() => {
    if (!restrictToOwn) {
      const existingIds = new Set(conductors.map(c => String(c.id)));
      const fromTickets: typeof conductors = [];
      for (const t of allTickets) {
        if (t.conductorId && !existingIds.has(String(t.conductorId))) {
          existingIds.add(String(t.conductorId));
          fromTickets.push({
            id: String(t.conductorId),
            name: t.conductorName || 'Unknown',
            isActive: false,
          });
        }
      }
      return [...conductors, ...fromTickets];
    }
    
    if (activeConductor) return [activeConductor];
    const fallbackId = resolveCashierConductorId(userId, userName);
    if (fallbackId) {
      const found = conductors.find((c) => c.id === fallbackId);
      return found ? [found] : [{ id: fallbackId, name: userName || 'Conductor', isActive: true }];
    }
    return [];
  }, [restrictToOwn, conductors, activeConductor, userId, userName, allTickets]);

  const selectedConductor = visibleConductors[conductorIndex] ?? activeConductor ?? null;

  const report = useMemo(() => {
    if (!selectedConductor) return null;
    return getConductorReport(allTickets, selectedConductor.id, selectedDate);
  }, [allTickets, selectedConductor, selectedDate]);

  if (visibleConductors.length === 0) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <StatusBar barStyle={C.statusBarStyle} backgroundColor={C.bg} />
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backBtn}>
            <MaterialCommunityIcons name="arrow-left" size={22} color={C.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Conductor Report</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.empty}>
          <MaterialCommunityIcons name="account-group-outline" size={48} color={C.border} />
          <Text style={styles.emptyText}>No conductors found</Text>
          <Text style={styles.emptyHint}>Add conductors first</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle={C.statusBarStyle} backgroundColor={C.bg} />
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={C.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Conductor Report</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* Conductor picker */}
        <Text style={styles.sectionLabel}>CONDUCTOR</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
          {visibleConductors.map((c, i) => (
            <TouchableOpacity
              key={c.id || `cond-${i}`}
              style={[styles.conductorChip, conductorIndex === i && styles.conductorChipActive]}
              onPress={() => setConductorIndex(i)}
            >
              <Text style={[styles.conductorChipText, conductorIndex === i && styles.conductorChipTextActive]}>
                {c.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Date navigator */}
        <View style={styles.dateNav}>
          <TouchableOpacity style={styles.dateNavBtn} onPress={() => setSelectedDate((d) => addDays(d, -1))}>
            <MaterialCommunityIcons name="chevron-left" size={24} color={C.white} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowPicker(true)}>
            <Text style={styles.dateLabel}>{fmtDate(selectedDate)}</Text>
          </TouchableOpacity>
          {showPicker && (
            <DateTimePicker
              value={selectedDate}
              mode="date"
              display="default"
              onChange={(event, date) => {
                setShowPicker(false);
                if (date) setSelectedDate(date);
              }}
            />
          )}
          <TouchableOpacity
            style={styles.dateNavBtn}
            onPress={() => setSelectedDate((d) => addDays(d, 1))}
            disabled={selectedDate >= today}
          >
            <MaterialCommunityIcons name="chevron-right" size={24} color={selectedDate >= today ? C.border : C.white} />
          </TouchableOpacity>
        </View>

        {report && (
          <>
            {/* KPI */}
            <View style={styles.kpiRow}>
              <View style={styles.kpiCard}>
                <Text style={styles.kpiValue}>{report.ticketsIssued}</Text>
                <Text style={styles.kpiLabel}>Tickets</Text>
              </View>
              <View style={styles.kpiCard}>
                <Text style={styles.kpiValue}>{report.passengersServed}</Text>
                <Text style={styles.kpiLabel}>Passengers</Text>
              </View>
              <View style={[styles.kpiCard, { borderColor: C.amber }]}>
                <Text style={[styles.kpiValue, { color: C.amber }]}>{fmtMoney(report.expectedCash)}</Text>
                <Text style={styles.kpiLabel}>Expected</Text>
              </View>
            </View>

            {/* Route breakdown */}
            {report.byRoute.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>BY ROUTE</Text>
                {report.byRoute.map((rb, index) => (
              <View key={rb.routeId || `route-${index}`} style={styles.tableRow}>
                    <Text style={styles.tableRouteName} numberOfLines={1}>{rb.routeName}</Text>
                    <Text style={styles.tableTickets}>{rb.ticketCount} tkts</Text>
                    <Text style={styles.tableRevenue}>{fmtMoney(rb.revenue)}</Text>
                  </View>
                ))}
              </>
            )}

            {report.ticketsIssued === 0 && (
              <View style={styles.empty}>
                <MaterialCommunityIcons name="ticket-outline" size={40} color={C.border} />
                <Text style={styles.emptyText}>No tickets for this conductor on this date</Text>
              </View>
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
  sectionLabel: { color: C.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 },
  conductorChip: {
    backgroundColor: C.surface, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10,
    marginRight: 8, borderWidth: 1, borderColor: C.border,
  },
  conductorChipActive: { backgroundColor: C.amber, borderColor: C.amber },
  conductorChipText: { color: C.white, fontSize: 13, fontWeight: '700' },
  conductorChipTextActive: { color: '#000' },
  dateNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: C.surface, borderRadius: 12, padding: 12, marginBottom: 16,
  },
  dateNavBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  dateLabel: { color: C.white, fontSize: 16, fontWeight: '800' },
  kpiRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  kpiCard: {
    flex: 1, backgroundColor: C.surface, borderRadius: 12, padding: 14,
    alignItems: 'center', borderWidth: 1, borderColor: C.border,
  },
  kpiValue: { color: C.white, fontSize: 20, fontWeight: '900' },
  kpiLabel: { color: C.muted, fontSize: 11, fontWeight: '600', marginTop: 4 },
  sectionTitle: { color: C.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10, marginTop: 4 },
  tableRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.surface, borderRadius: 10, padding: 12, marginBottom: 8, gap: 8,
  },
  tableRouteName: { flex: 1, color: C.white, fontSize: 13, fontWeight: '600' },
  tableTickets: { color: C.muted, fontSize: 12 },
  tableRevenue: { color: C.amber, fontSize: 13, fontWeight: '700', minWidth: 60, textAlign: 'right' },
  empty: { alignItems: 'center', paddingTop: 40, paddingBottom: 20, gap: 8 },
  emptyText: { color: C.muted, fontSize: 14, textAlign: 'center' },
  emptyHint: { color: C.border, fontSize: 12 },
});
