import React, { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert, Share, StatusBar,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LineChart } from 'react-native-gifted-charts';
import { useBusTicketing } from '../../hooks/useBusTicketing';
import { getRangeReport, getTicketsForRange, formatAsCSV } from '../../hooks/useBusReports';

const C = {
  bg: '#07090C', surface: '#111318', border: '#1E2128',
  amber: '#F0A500', fire: '#FF6B35', white: '#FFFFFF',
  muted: '#9CA3AF', success: '#22C55E', danger: '#EF4444',
};

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fmtMoney(n: number) { return `$${n.toFixed(2)}`; }
function fmtDate(d: Date) {
  return `${String(d.getDate()).padStart(2,'0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
function addDays(d: Date, n: number): Date {
  const copy = new Date(d); copy.setDate(copy.getDate() + n); return copy;
}

interface Props { onClose: () => void; }

export function BusRangeReportScreen({ onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { tickets: allTickets } = useBusTicketing();

  const today = new Date();
  const [fromDate, setFromDate] = useState(addDays(today, -6)); // rolling 7 days
  const [toDate, setToDate] = useState(today);
  const [selectingFrom, setSelectingFrom] = useState(false);

  const rangeTickets = useMemo(() => getTicketsForRange(allTickets, fromDate, toDate), [allTickets, fromDate, toDate]);
  const report = useMemo(() => getRangeReport(allTickets, fromDate, toDate), [allTickets, fromDate, toDate]);

  const lineData = useMemo(() =>
    report.byDay.map((d) => ({
      value: d.totalRevenue,
      label: d.date.slice(5), // MM-DD
      dataPointColor: C.amber,
    })),
    [report.byDay]
  );

  async function handleShareCSV() {
    try {
      const csv = formatAsCSV(rangeTickets);
      const dateStr = `${fromDate.toISOString().slice(0,10)}_to_${toDate.toISOString().slice(0,10)}`;
      await Share.share({ message: csv, title: `tickets_${dateStr}.csv` });
    } catch (e: any) { Alert.alert('Error', e.message); }
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={C.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Range Report</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* Date range pickers (simple +/- days) */}
        <View style={styles.dateRange}>
          <View style={styles.datePickerGroup}>
            <Text style={styles.datePickerLabel}>FROM</Text>
            <View style={styles.datePickerRow}>
              <TouchableOpacity style={styles.arrowBtn} onPress={() => setFromDate((d) => addDays(d, -1))}>
                <MaterialCommunityIcons name="chevron-left" size={20} color={C.white} />
              </TouchableOpacity>
              <Text style={styles.datePickerValue}>{fmtDate(fromDate)}</Text>
              <TouchableOpacity style={styles.arrowBtn} onPress={() => setFromDate((d) => { const n = addDays(d,1); return n < toDate ? n : d; })}>
                <MaterialCommunityIcons name="chevron-right" size={20} color={C.white} />
              </TouchableOpacity>
            </View>
          </View>
          <MaterialCommunityIcons name="arrow-right" size={20} color={C.muted} />
          <View style={styles.datePickerGroup}>
            <Text style={styles.datePickerLabel}>TO</Text>
            <View style={styles.datePickerRow}>
              <TouchableOpacity style={styles.arrowBtn} onPress={() => setToDate((d) => { const n = addDays(d,-1); return n > fromDate ? n : d; })}>
                <MaterialCommunityIcons name="chevron-left" size={20} color={C.white} />
              </TouchableOpacity>
              <Text style={styles.datePickerValue}>{fmtDate(toDate)}</Text>
              <TouchableOpacity style={styles.arrowBtn} onPress={() => setToDate((d) => addDays(d,1))} disabled={toDate >= today}>
                <MaterialCommunityIcons name="chevron-right" size={20} color={toDate >= today ? C.border : C.white} />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Quick range pills */}
        <View style={styles.quickRow}>
          {[
            { label: '7 days', days: 7 },
            { label: '14 days', days: 14 },
            { label: '30 days', days: 30 },
          ].map(({ label, days }) => (
            <TouchableOpacity
              key={label}
              style={styles.quickPill}
              onPress={() => { setFromDate(addDays(today, -(days-1))); setToDate(today); }}
            >
              <Text style={styles.quickPillText}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* KPI cards */}
        <View style={styles.kpiRow}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiValue}>{report.totalTickets}</Text>
            <Text style={styles.kpiLabel}>Tickets</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiValue}>{report.totalPassengers}</Text>
            <Text style={styles.kpiLabel}>Passengers</Text>
          </View>
          <View style={[styles.kpiCard, { borderColor: C.amber }]}>
            <Text style={[styles.kpiValue, { color: C.amber }]}>{fmtMoney(report.totalRevenue)}</Text>
            <Text style={styles.kpiLabel}>Revenue</Text>
          </View>
        </View>

        <View style={styles.kpiRow}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiValue}>{fmtMoney(report.avgDailyRevenue)}</Text>
            <Text style={styles.kpiLabel}>Avg/Day</Text>
          </View>
          {report.bestDay.date ? (
            <View style={[styles.kpiCard, { borderColor: C.success }]}>
              <MaterialCommunityIcons name="trophy-outline" size={18} color={C.success} />
              <Text style={[styles.kpiValue, { color: C.success, fontSize: 14 }]}>{report.bestDay.date}</Text>
              <Text style={styles.kpiLabel}>{fmtMoney(report.bestDay.revenue)}</Text>
            </View>
          ) : null}
        </View>

        {/* Line chart */}
        {lineData.length > 1 && (
          <>
            <Text style={styles.sectionTitle}>DAILY REVENUE TREND</Text>
            <View style={styles.chartCard}>
              <LineChart
                data={lineData}
                color={C.amber}
                thickness={2}
                startFillColor={C.amber}
                startOpacity={0.2}
                endOpacity={0.02}
                dataPointsColor={C.amber}
                yAxisTextStyle={{ color: C.muted, fontSize: 10 }}
                xAxisLabelTextStyle={{ color: C.muted, fontSize: 9 }}
                yAxisColor={C.border}
                xAxisColor={C.border}
                rulesColor={C.border}
                backgroundColor="transparent"
                areaChart
                isAnimated
              />
            </View>
          </>
        )}

        {/* Route breakdown */}
        {report.byRoute.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>BY ROUTE</Text>
            {report.byRoute.map((rb) => (
              <View key={rb.routeId} style={styles.tableRow}>
                <Text style={styles.tableRouteName} numberOfLines={1}>{rb.routeName}</Text>
                <Text style={styles.tableTickets}>{rb.ticketCount} tkts</Text>
                <Text style={styles.tableRevenue}>{fmtMoney(rb.revenue)}</Text>
              </View>
            ))}
          </>
        )}

        {report.totalTickets === 0 && (
          <View style={styles.empty}>
            <MaterialCommunityIcons name="ticket-outline" size={48} color={C.border} />
            <Text style={styles.emptyText}>No tickets in this range</Text>
          </View>
        )}

        <TouchableOpacity style={styles.shareBtn} onPress={handleShareCSV}>
          <MaterialCommunityIcons name="file-delimited-outline" size={18} color={C.amber} />
          <Text style={styles.shareBtnText}>Export CSV</Text>
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
  dateRange: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: C.surface, borderRadius: 12, padding: 16, marginBottom: 10, gap: 8,
  },
  datePickerGroup: { flex: 1, gap: 4 },
  datePickerLabel: { color: C.muted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  datePickerRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  datePickerValue: { flex: 1, color: C.white, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  arrowBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  quickRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  quickPill: {
    backgroundColor: C.surface, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1, borderColor: C.border,
  },
  quickPillText: { color: C.amber, fontSize: 12, fontWeight: '700' },
  kpiRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  kpiCard: {
    flex: 1, backgroundColor: C.surface, borderRadius: 12, padding: 14,
    alignItems: 'center', borderWidth: 1, borderColor: C.border,
  },
  kpiValue: { color: C.white, fontSize: 18, fontWeight: '900' },
  kpiLabel: { color: C.muted, fontSize: 11, fontWeight: '600', marginTop: 4 },
  sectionTitle: { color: C.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10, marginTop: 14 },
  chartCard: { backgroundColor: C.surface, borderRadius: 12, padding: 16, marginBottom: 20 },
  tableRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.surface, borderRadius: 10, padding: 12, marginBottom: 8, gap: 8,
  },
  tableRouteName: { flex: 1, color: C.white, fontSize: 13, fontWeight: '600' },
  tableTickets: { color: C.muted, fontSize: 12 },
  tableRevenue: { color: C.amber, fontSize: 13, fontWeight: '700', minWidth: 60, textAlign: 'right' },
  empty: { alignItems: 'center', paddingTop: 40, paddingBottom: 20, gap: 10 },
  emptyText: { color: C.muted, fontSize: 14 },
  shareBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: C.surface, borderRadius: 12, paddingVertical: 14,
    borderWidth: 1, borderColor: C.border, marginTop: 8,
  },
  shareBtnText: { color: C.white, fontWeight: '700', fontSize: 14 },
});
