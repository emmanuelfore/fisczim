import React, { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert, Share, StatusBar,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BarChart } from 'react-native-gifted-charts';
import { useBusTicketing } from '../../hooks/useBusTicketing';
import { getDailySummary, getTicketsForDate, formatAsCSV, formatAsWhatsAppText, isCashierUser, filterTicketsForOwnership, resolveCashierConductorId } from '../../hooks/useBusReports';
import { type BusColors, useBusColors } from './theme';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmtMoney(n: number) { return `$${n.toFixed(2)}`; }
function fmtDate(d: Date) {
  return `${String(d.getDate()).padStart(2,'0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

interface Props { onClose: () => void; userRole?: string; userName?: string; userId?: string | null; }

export function BusDailyReportScreen({ onClose, userRole, userName, userId }: Props) {
  const insets = useSafeAreaInsets();
  const C = useBusColors();
  const styles = useMemo(() => makeStyles(C), [C]);
  const { tickets: allTickets, activeConductor } = useBusTicketing();

  const [selectedDate, setSelectedDate] = useState(new Date());

  const restrict = isCashierUser(userRole, userName);
  const ownConductorId = activeConductor?.id ?? (restrict ? resolveCashierConductorId(userId, userName) : null);
  const tickets = useMemo(() =>
    filterTicketsForOwnership(allTickets, ownConductorId, restrict),
    [allTickets, ownConductorId, restrict]
  );

  const dayTickets = useMemo(() => getTicketsForDate(tickets, selectedDate), [tickets, selectedDate]);
  const summary = useMemo(() => getDailySummary(tickets, selectedDate), [tickets, selectedDate]);

  // Build BarChart data from hourly breakdown
  const barData = useMemo(() =>
    summary.byHour.map((hb) => ({
      value: hb.revenue,
      label: `${String(hb.hour).padStart(2,'0')}h`,
      frontColor: C.amber,
      topLabelComponent: () => (
        <Text style={{ color: C.muted, fontSize: 9 }}>{fmtMoney(hb.revenue)}</Text>
      ),
    })),
    [summary.byHour]
  );

  async function handleShareCSV() {
    try {
      const csv = formatAsCSV(dayTickets);
      await Share.share({ message: csv, title: `tickets_${selectedDate.toISOString().slice(0, 10)}.csv` });
    } catch (e: any) { Alert.alert('Error', e.message); }
  }

  async function handleShareWhatsApp() {
    const text = formatAsWhatsAppText(summary, activeConductor?.name ?? 'Unknown');
    await Share.share({ message: text });
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle={C.statusBarStyle} backgroundColor={C.bg} />
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={C.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Daily Report</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* Date navigator */}
        <View style={styles.dateNav}>
          <TouchableOpacity style={styles.dateNavBtn} onPress={() => setSelectedDate((d) => addDays(d, -1))}>
            <MaterialCommunityIcons name="chevron-left" size={24} color={C.white} />
          </TouchableOpacity>
          <Text style={styles.dateLabel}>{fmtDate(selectedDate)}</Text>
          <TouchableOpacity
            style={styles.dateNavBtn}
            onPress={() => setSelectedDate((d) => addDays(d, 1))}
            disabled={selectedDate >= new Date()}
          >
            <MaterialCommunityIcons name="chevron-right" size={24} color={selectedDate >= new Date() ? C.border : C.white} />
          </TouchableOpacity>
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

        {/* Hourly chart */}
        {barData.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>REVENUE BY HOUR</Text>
            <View style={styles.chartCard}>
              <BarChart
                data={barData}
                barWidth={28}
                spacing={12}
                roundedTop
                barBorderRadius={4}
                noOfSections={4}
                yAxisTextStyle={{ color: C.muted, fontSize: 10 }}
                xAxisLabelTextStyle={{ color: C.muted, fontSize: 10 }}
                yAxisColor={C.border}
                xAxisColor={C.border}
                rulesColor={C.border}
                rulesType="solid"
                backgroundColor="transparent"
                isAnimated
              />
            </View>
          </>
        )}

        {/* Route breakdown */}
        {summary.byRoute.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>BY ROUTE</Text>
            {summary.byRoute.map((rb) => (
              <View key={rb.routeId} style={styles.tableRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.tableRouteName} numberOfLines={1}>{rb.routeName}</Text>
                  <Text style={styles.tableSub}>{rb.passengerCount} passengers</Text>
                </View>
                <Text style={styles.tableTickets}>{rb.ticketCount} tkts</Text>
                <Text style={styles.tableRevenue}>{fmtMoney(rb.revenue)}</Text>
              </View>
            ))}
          </>
        )}

        {/* Stop / segment breakdown */}
        {summary.byStop.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>BY STOP / SEGMENT</Text>
            {summary.byStop.slice(0, 20).map((sb) => (
              <View key={sb.id} style={styles.tableRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.tableRouteName} numberOfLines={1}>{sb.stop}</Text>
                  <Text style={styles.tableSub}>{sb.routeName}</Text>
                </View>
                <Text style={styles.tableTickets}>{sb.ticketCount} tkts</Text>
                <Text style={styles.tableRevenue}>{fmtMoney(sb.revenue)}</Text>
              </View>
            ))}
          </>
        )}

        {/* Payment breakdown */}
        {summary.byPaymentMethod.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>PAYMENT METHODS</Text>
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

        {/* Empty state */}
        {summary.totalTickets === 0 && (
          <View style={styles.empty}>
            <MaterialCommunityIcons name="ticket-outline" size={48} color={C.border} />
            <Text style={styles.emptyText}>No tickets on this date</Text>
          </View>
        )}

        {/* Share row */}
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
  kpiValue: { color: C.white, fontSize: 22, fontWeight: '900' },
  kpiLabel: { color: C.muted, fontSize: 11, fontWeight: '600', marginTop: 4 },
  sectionTitle: { color: C.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10, marginTop: 4 },
  chartCard: { backgroundColor: C.surface, borderRadius: 12, padding: 16, marginBottom: 20 },
  tableRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.surface, borderRadius: 10, padding: 12,
    marginBottom: 8, gap: 8,
  },
  tableRouteName: { color: C.white, fontSize: 13, fontWeight: '700' },
  tableSub: { color: C.muted, fontSize: 11, marginTop: 2 },
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
  empty: { alignItems: 'center', paddingTop: 40, paddingBottom: 20, gap: 10 },
  emptyText: { color: C.muted, fontSize: 14 },
  shareRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  shareBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: C.surface, borderRadius: 12, paddingVertical: 14,
    borderWidth: 1, borderColor: C.border,
  },
  shareBtnText: { color: C.white, fontWeight: '700', fontSize: 14 },
});
