import {
  IssuedTicket,
  DailySummary,
  RangeReport,
  ConductorReport,
  RouteBreakdown,
  PaymentBreakdown,
  HourBreakdown,
} from '../types/busTicketing';

// ── Date helpers ─────────────────────────────────────────────────
function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function dateToKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDisplayDate(d: Date): string {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function formatTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ── Filters ──────────────────────────────────────────────────────
export function getTicketsForDate(tickets: IssuedTicket[], date: Date): IssuedTicket[] {
  return tickets.filter((t) => isSameDay(new Date(t.issuedAt), date));
}

export function getTicketsForRange(tickets: IssuedTicket[], from: Date, to: Date): IssuedTicket[] {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999);
  return tickets.filter((t) => {
    const d = new Date(t.issuedAt);
    return d >= start && d <= end;
  });
}

// ── Route breakdown ───────────────────────────────────────────────
function buildRouteBreakdown(tickets: IssuedTicket[]): RouteBreakdown[] {
  const map = new Map<string, RouteBreakdown>();
  for (const t of tickets) {
    const key = t.routeId;
    if (!map.has(key)) {
      map.set(key, {
        routeId: t.routeId,
        routeName: t.routeName,
        ticketCount: 0,
        passengerCount: 0,
        revenue: 0,
        avgTicketsPerHour: 0,
      });
    }
    const rb = map.get(key)!;
    rb.ticketCount += 1;
    rb.passengerCount += t.quantity;
    rb.revenue += t.totalAmount;
  }
  const result = Array.from(map.values());
  // Compute avgTicketsPerHour: tickets / distinct hours
  for (const rb of result) {
    const routeTickets = tickets.filter((t) => t.routeId === rb.routeId);
    const hours = new Set(routeTickets.map((t) => new Date(t.issuedAt).getHours()));
    rb.avgTicketsPerHour = hours.size > 0 ? parseFloat((rb.ticketCount / hours.size).toFixed(2)) : 0;
  }
  return result;
}

// ── Payment breakdown ─────────────────────────────────────────────
function buildPaymentBreakdown(tickets: IssuedTicket[]): PaymentBreakdown[] {
  const map = new Map<string, PaymentBreakdown>();
  const totalAmount = tickets.reduce((s, t) => s + t.totalAmount, 0);
  for (const t of tickets) {
    const method = t.paymentMethod ?? 'Unknown';
    if (!map.has(method)) {
      map.set(method, { method, count: 0, amount: 0, percentage: 0 });
    }
    const pb = map.get(method)!;
    pb.count += 1;
    pb.amount += t.totalAmount;
  }
  for (const pb of map.values()) {
    pb.amount = parseFloat(pb.amount.toFixed(2));
    pb.percentage = totalAmount > 0 ? parseFloat(((pb.amount / totalAmount) * 100).toFixed(1)) : 0;
  }
  return Array.from(map.values());
}

// ── Hour breakdown ────────────────────────────────────────────────
function buildHourBreakdown(tickets: IssuedTicket[]): HourBreakdown[] {
  const map = new Map<number, HourBreakdown>();
  for (const t of tickets) {
    const hour = new Date(t.issuedAt).getHours();
    if (!map.has(hour)) {
      map.set(hour, { hour, ticketCount: 0, revenue: 0 });
    }
    const hb = map.get(hour)!;
    hb.ticketCount += 1;
    hb.revenue += t.totalAmount;
  }
  return Array.from(map.values()).sort((a, b) => a.hour - b.hour);
}

// ── getDailySummary ───────────────────────────────────────────────
export function getDailySummary(tickets: IssuedTicket[], date: Date): DailySummary {
  const dayTickets = getTicketsForDate(tickets, date);
  return {
    date: dateToKey(date),
    totalTickets: dayTickets.length,
    totalPassengers: dayTickets.reduce((s, t) => s + t.quantity, 0),
    totalRevenue: parseFloat(dayTickets.reduce((s, t) => s + t.totalAmount, 0).toFixed(2)),
    byRoute: buildRouteBreakdown(dayTickets),
    byPaymentMethod: buildPaymentBreakdown(dayTickets),
    byHour: buildHourBreakdown(dayTickets),
  };
}

// ── getRangeReport ────────────────────────────────────────────────
export function getRangeReport(tickets: IssuedTicket[], from: Date, to: Date): RangeReport {
  const rangeTickets = getTicketsForRange(tickets, from, to);

  // Build list of calendar days in range
  const days: DailySummary[] = [];
  const cur = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const last = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  while (cur <= last) {
    days.push(getDailySummary(rangeTickets, new Date(cur)));
    cur.setDate(cur.getDate() + 1);
  }

  const totalRevenue = parseFloat(days.reduce((s, d) => s + d.totalRevenue, 0).toFixed(2));
  const avgDailyRevenue = days.length > 0 ? parseFloat((totalRevenue / days.length).toFixed(2)) : 0;

  let bestDay = { date: '', revenue: -Infinity };
  let worstDay = { date: '', revenue: Infinity };
  for (const d of days) {
    if (d.totalRevenue > bestDay.revenue) bestDay = { date: d.date, revenue: d.totalRevenue };
    if (d.totalRevenue < worstDay.revenue) worstDay = { date: d.date, revenue: d.totalRevenue };
  }
  if (days.length === 0) {
    bestDay = { date: '', revenue: 0 };
    worstDay = { date: '', revenue: 0 };
  }

  return {
    from: dateToKey(from),
    to: dateToKey(to),
    totalTickets: rangeTickets.length,
    totalPassengers: rangeTickets.reduce((s, t) => s + t.quantity, 0),
    totalRevenue,
    avgDailyRevenue,
    bestDay,
    worstDay,
    byRoute: buildRouteBreakdown(rangeTickets),
    byDay: days,
  };
}

// ── getConductorReport ────────────────────────────────────────────
export function getConductorReport(
  tickets: IssuedTicket[],
  conductorId: string,
  date: Date
): ConductorReport {
  const dayTickets = getTicketsForDate(tickets, date);
  const cTickets = dayTickets.filter((t) => t.conductorId === conductorId);
  const conductorName = cTickets[0]?.conductorName ?? '';
  const expectedCash = parseFloat(cTickets.reduce((s, t) => s + t.totalAmount, 0).toFixed(2));

  return {
    conductorId,
    conductorName,
    date: dateToKey(date),
    ticketsIssued: cTickets.length,
    passengersServed: cTickets.reduce((s, t) => s + t.quantity, 0),
    expectedCash,
    totalCollected: expectedCash, // updated via reconciliation separately
    byRoute: buildRouteBreakdown(cTickets),
  };
}

// ── formatAsCSV ───────────────────────────────────────────────────
export function formatAsCSV(tickets: IssuedTicket[]): string {
  const headers = [
    'Ticket ID',
    'Date',
    'Time',
    'Route',
    'Passengers',
    'Unit Price',
    'Total',
    'Payment Method',
    'Passenger Name',
    'ID Number',
    'Drop-off',
  ];

  const escape = (v: string | number | undefined): string => {
    if (v === undefined || v === null) return '';
    const s = String(v);
    // If the value contains comma or quote, wrap in quotes
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const rows = tickets.map((t) => {
    const d = new Date(t.issuedAt);
    return [
      escape(t.id),
      escape(formatDisplayDate(d)),
      escape(formatTime(d)),
      escape(t.routeName),
      escape(t.quantity),
      escape(t.price.toFixed(2)),
      escape(t.totalAmount.toFixed(2)),
      escape(t.paymentMethod),
      escape(t.passengerName),
      escape(t.idNumber),
      escape(t.dropOffPoint),
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

// ── formatAsWhatsAppText ──────────────────────────────────────────
export function formatAsWhatsAppText(summary: DailySummary, conductorName: string): string {
  const LINE = '────────────────────────────';
  const wrap = (s: string): string => {
    // Hard-wrap at 60 chars
    const words = s.split(' ');
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
      if ((current + ' ' + word).trim().length > 60) {
        lines.push(current.trim());
        current = word;
      } else {
        current = (current + ' ' + word).trim();
      }
    }
    if (current) lines.push(current.trim());
    return lines.join('\n');
  };

  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const [y, m, d] = summary.date.split('-').map(Number);
  const dateLabel = `${String(d).padStart(2,'0')} ${months[m-1]} ${y}`;

  const lines: string[] = [
    LINE,
    `BUS TICKETING - DAILY SUMMARY`,
    LINE,
    `Date: ${dateLabel}`,
    `Conductor: ${conductorName}`,
    LINE,
    'ROUTES',
  ];

  for (const rb of summary.byRoute) {
    lines.push(`${rb.routeName}`);
    lines.push(`  Tickets: ${rb.ticketCount}  Revenue: $${rb.revenue.toFixed(2)}`);
  }

  lines.push(LINE);
  lines.push(`Total Tickets:     ${summary.totalTickets}`);
  lines.push(`Total Passengers:  ${summary.totalPassengers}`);
  lines.push(`Total Revenue:     $${summary.totalRevenue.toFixed(2)}`);
  lines.push(LINE);
  lines.push('PAYMENT BREAKDOWN');

  for (const pb of summary.byPaymentMethod) {
    lines.push(`${pb.method}: ${pb.count} tickets  $${pb.amount.toFixed(2)} (${pb.percentage}%)`);
  }

  lines.push(LINE);

  return lines.map((l) => wrap(l)).join('\n');
}

// ── Default hook export (convenience wrapper) ─────────────────────
export function useBusReports(tickets: IssuedTicket[]) {
  return {
    getTicketsForDate: (date: Date) => getTicketsForDate(tickets, date),
    getTicketsForRange: (from: Date, to: Date) => getTicketsForRange(tickets, from, to),
    getDailySummary: (date: Date) => getDailySummary(tickets, date),
    getRangeReport: (from: Date, to: Date) => getRangeReport(tickets, from, to),
    getConductorReport: (conductorId: string, date: Date) =>
      getConductorReport(tickets, conductorId, date),
    formatAsCSV: (t: IssuedTicket[]) => formatAsCSV(t),
    formatAsWhatsAppText: (summary: DailySummary, conductorName: string) =>
      formatAsWhatsAppText(summary, conductorName),
  };
}
