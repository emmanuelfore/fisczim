import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useBusReconciliations, useBusReport, useSignOffReconciliation } from "@/hooks/use-bus-ticketing";
import { format } from "date-fns";
import { Bus, CheckCircle2, Route, XCircle } from "lucide-react";
import { useMemo } from "react";

export function dateInput(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

// Africa/Harare (UTC+2, no DST) is the business timezone. Tickets are stored
// with UTC timestamps, so every date/hour bucketing must be done in Harare
// time, otherwise the report drifts by the offset and mis-attributes tickets
// to the wrong day/hour.
const HARARE_OFFSET_MS = 2 * 60 * 60 * 1000;

// Shift a UTC instant so its UTC wall-clock components match Harare time.
function toHarare(date: Date): Date {
  return new Date(date.getTime() + HARARE_OFFSET_MS);
}

function harareDayKey(date: Date): string {
  return toHarare(date).toISOString().slice(0, 10);
}

function harareHour(date: Date): number {
  return toHarare(date).getUTCHours();
}

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Format a raw UTC instant as its Harare date/time using UTC components so the
// output is identical regardless of the viewer's browser timezone.
function harareDateLabel(date: Date): string {
  const h = toHarare(date);
  return `${MONTHS_SHORT[h.getUTCMonth()]} ${h.getUTCDate()}`;
}

function harareTimeLabel(date: Date): string {
  const h = toHarare(date);
  return `${String(h.getUTCHours()).padStart(2, "0")}:${String(h.getUTCMinutes()).padStart(2, "0")}`;
}

export function dayBoundaryIso(value: string, endOfDay = false) {
  const [year, month, day] = value.split("-").map(Number);
  const utcMidnight = Date.UTC(year, (month || 1) - 1, day || 1);
  return endOfDay
    ? new Date(utcMidnight + 86400000 - 1 - HARARE_OFFSET_MS).toISOString()
    : new Date(utcMidnight - HARARE_OFFSET_MS).toISOString();
}

export function money(value: number) {
  return `$${Number(value || 0).toFixed(2)}`;
}

export function percent(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";
  return `${(Number(value || 0) * 100).toFixed(0)}%`;
}

function buildDayRows(tickets: any[], from: string, to: string) {
  const rows: Array<{
    id: string;
    label: string;
    tickets: number;
    passengers: number;
    revenue: number;
  }> = [];
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const startUtc = Date.UTC(fy, (fm || 1) - 1, fd || 1);
  const endUtc = Date.UTC(ty, (tm || 1) - 1, td || 1);
  for (let cur = startUtc; cur <= endUtc; cur += 86400000) {
    const rowDate = new Date(cur);
    rows.push({
      id: harareDayKey(rowDate),
      label: harareDateLabel(rowDate),
      tickets: 0,
      passengers: 0,
      revenue: 0,
    });
  }
  const map = new Map(rows.map((row) => [row.id, row]));
  tickets.forEach((ticket) => {
    if (!ticket.timestamp) return;
    const key = harareDayKey(new Date(ticket.timestamp));
    const row = map.get(key);
    if (!row) return;
    row.tickets += 1;
    row.passengers += Number(ticket.quantity || 1);
    row.revenue += Number(ticket.amount || 0);
  });
  return rows;
}

function summarize(
  tickets: any[],
  keyFn: (ticket: any) => string,
  labelFn: (ticket: any) => string,
) {
  const map = new Map<
    string,
    {
      id: string;
      label: string;
      tickets: number;
      passengers: number;
      revenue: number;
    }
  >();
  tickets.forEach((ticket) => {
    const id = keyFn(ticket);
    const row = map.get(id) || {
      id,
      label: labelFn(ticket),
      tickets: 0,
      passengers: 0,
      revenue: 0,
    };
    row.tickets += 1;
    row.passengers += Number(ticket.quantity || 1);
    row.revenue += Number(ticket.amount || 0);
    map.set(id, row);
  });
  return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
}

function hourlyRows(tickets: any[]) {
  return summarize(
    tickets,
    (ticket) => String(harareHour(new Date(ticket.timestamp))).padStart(2, "0"),
    (ticket) =>
      `${String(harareHour(new Date(ticket.timestamp))).padStart(2, "0")}h`,
  ).sort((a, b) => Number(a.id) - Number(b.id));
}

export function exportTicketsCsv(tickets: any[], label: string) {
  const headers = [
    "Ticket",
    "Trip",
    "Date",
    "Time",
    "Route",
    "Direction",
    "Conductor",
    "Vehicle",
    "Passengers",
    "Amount",
    "Payment",
  ];
  const rows = tickets.map((ticket: any) => {
    const raw = ticket.timestamp ? new Date(ticket.timestamp) : null;
    return [
      ticket.ticketNumber,
      ticket.tripId || "",
      raw ? harareDayKey(raw) : "",
      raw ? harareTimeLabel(raw) : "",
      ticket.routeName || "",
      ticket.direction || "",
      ticket.conductorName || "",
      ticket.vehicleRegNumber || "",
      ticket.quantity || 1,
      Number(ticket.amount || 0).toFixed(2),
      ticket.paymentMethod || "",
    ]
      .map((value) => `"${String(value).replace(/"/g, '""')}"`)
      .join(",");
  });
  const blob = new Blob([[headers.join(","), ...rows].join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${label}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function useReportData(
  companyId: number,
  fromIso: string,
  toIso: string,
  conductorId?: string,
) {
  const { data, isLoading } = useBusReport(companyId, fromIso, toIso);

  const tickets = useMemo(() => {
    const list = data?.tickets || [];
    if (!conductorId || conductorId === "all") return list;
    return list.filter(
      (ticket: any) => String(ticket.conductorId) === String(conductorId),
    );
  }, [conductorId, data?.tickets]);

  const trips = useMemo(() => {
    const list = data?.trips || [];
    if (!conductorId || conductorId === "all") return list;
    return list.filter(
      (trip: any) => String(trip.conductorId) === String(conductorId),
    );
  }, [conductorId, data?.trips]);

  const totals = useMemo(
    () =>
      tickets.reduce(
        (acc: any, ticket: any) => {
          acc.tickets += 1;
          acc.passengers += Number(ticket.quantity || 1);
          acc.revenue += Number(ticket.amount || 0);
          return acc;
        },
        { tickets: 0, passengers: 0, revenue: 0 },
      ),
    [tickets],
  );

  const byRoute = useMemo(
    () =>
      summarize(
        tickets,
        (ticket) => ticket.routeName || "unknown",
        (ticket) => ticket.routeName || "Unknown route",
      ),
    [tickets],
  );
  const byDirection = useMemo(
    () =>
      summarize(
        tickets,
        (ticket) => ticket.direction || "Unknown",
        (ticket) => ticket.direction || "Unknown",
      ),
    [tickets],
  );
  const byConductor = useMemo(
    () =>
      summarize(
        tickets,
        (ticket) => ticket.conductorName || "unknown",
        (ticket) => ticket.conductorName || "Unknown conductor",
      ),
    [tickets],
  );
  const byVehicle = useMemo(
    () =>
      summarize(
        tickets,
        (ticket) => ticket.vehicleRegNumber || "unknown",
        (ticket) => ticket.vehicleRegNumber || "Unknown vehicle",
      ),
    [tickets],
  );
  const byPayment = useMemo(
    () =>
      summarize(
        tickets,
        (ticket) => ticket.paymentMethod || "Unknown",
        (ticket) => ticket.paymentMethod || "Unknown",
      ),
    [tickets],
  );
  const byStop = useMemo(() => {
    const map = new Map<
      string,
      {
        id: string;
        label: string;
        direction: string;
        tickets: number;
        passengers: number;
        revenue: number;
      }
    >();
    tickets.forEach((ticket: any) => {
      const stop = ticket.dropOffPoint || "Full route (destination)";
      const direction = ticket.direction || "Unknown direction";
      const id = `${direction}|${stop}`;
      const row = map.get(id) || {
        id,
        label: stop,
        direction,
        tickets: 0,
        passengers: 0,
        revenue: 0,
      };
      row.tickets += 1;
      row.passengers += Number(ticket.quantity || 1);
      row.revenue += Number(ticket.amount || 0);
      map.set(id, row);
    });
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  }, [tickets]);

  const routePerformance = data?.routePerformance || [];
  const conductorVariance = data?.conductorVariance || [];
  const byHour = useMemo(() => hourlyRows(tickets), [tickets]);
  const byDay = useMemo(() => buildDayRows(tickets, fromIso, toIso), [tickets, fromIso, toIso]);
  const avgDailyRevenue = byDay.length
    ? byDay.reduce((sum, row) => sum + row.revenue, 0) / byDay.length
    : 0;
  const bestDay = byDay.reduce(
    (best, row) => (row.revenue > best.revenue ? row : best),
    { id: "", label: "-", tickets: 0, passengers: 0, revenue: 0 },
  );
  const completedTrips = trips.filter(
    (trip: any) => trip.status === "completed",
  ).length;
  const averageOccupancy = trips.length
    ? trips.reduce(
        (sum: number, trip: any) => sum + Number(trip.occupancyRate || 0),
        0,
      ) / trips.length
    : null;
  const topTrip = trips.reduce(
    (best: any, trip: any) =>
      Number(trip.revenue || 0) > Number(best.revenue || 0) ? trip : best,
    { id: "", direction: "-", revenue: 0 },
  );

  return {
    data,
    isLoading,
    tickets,
    trips,
    totals,
    byRoute,
    byDirection,
    byConductor,
    byVehicle,
    byPayment,
    byStop,
    byHour,
    byDay,
    routePerformance,
    conductorVariance,
    avgDailyRevenue,
    bestDay,
    completedTrips,
    averageOccupancy,
    topTrip,
  };
}

export function StatCard({
  icon: Icon,
  label,
  value,
  tone = "orange",
}: {
  icon: any;
  label: string;
  value: string | number;
  tone?: "orange" | "blue" | "emerald" | "slate";
}) {
  const tones = {
    orange: "bg-orange-50 text-orange-600",
    blue: "bg-blue-50 text-blue-600",
    emerald: "bg-emerald-50 text-emerald-600",
    slate: "bg-slate-50 text-slate-600",
  };
  return (
    <Card className="border-none shadow-sm">
      <CardContent className="flex items-center gap-4 p-5">
        <div
          className={`flex h-11 w-11 items-center justify-center rounded-xl ${tones[tone]}`}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-slate-500">
            {label}
          </p>
          <p className="mt-1 text-2xl font-black text-slate-900">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function BreakdownTable({
  title,
  rows,
  empty = "No data",
}: {
  title: string;
  rows: any[];
  empty?: string;
}) {
  return (
    <Card className="border-none shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.length === 0 ? (
          <p className="py-8 text-center text-slate-500">{empty}</p>
        ) : (
          rows.map((row) => (
            <div
              key={row.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-white px-3 py-2.5"
            >
              <p className="min-w-0 flex-1 truncate font-semibold text-slate-900">
                {row.label}
              </p>
              <div className="shrink-0 text-right">
                <p className="text-sm font-bold text-slate-900">
                  {money(row.revenue)}
                </p>
                <p className="text-xs text-slate-500">
                  {row.tickets} tkts · {row.passengers} pax
                </p>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

export function StopSalesTable({
  rows,
  empty = "No stop data",
}: {
  rows: any[];
  empty?: string;
}) {
  return (
    <Card className="border-none shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Stop / Segment Sales</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.length === 0 ? (
          <p className="py-8 text-center text-slate-500">{empty}</p>
        ) : (
          rows.map((row) => (
            <div
              key={row.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-white px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-slate-900">
                  {row.label}
                </p>
                <p className="mt-0.5 truncate text-xs text-slate-500">
                  {row.direction}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-bold text-slate-900">
                  {money(row.revenue)}
                </p>
                <p className="text-xs text-slate-500">
                  {row.tickets} tkts · {row.passengers} pax
                </p>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

export function TripPerformanceTable({ trips }: { trips: any[] }) {
  return (
    <Card className="border-none shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Bus className="h-5 w-5 text-orange-500" />
          Trip Performance
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {trips.length === 0 ? (
          <p className="py-8 text-center text-slate-500">
            No trips in this period.
          </p>
        ) : (
          trips.slice(0, 100).map((trip) => (
            <div
              key={trip.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-slate-100 bg-white px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-slate-900">
                  {trip.direction || trip.routeName || `Trip #${trip.id}`}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  #{trip.id} · {trip.status || "unknown"} · {trip.tickets} tickets
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {trip.scheduledDeparture
                    ? format(new Date(trip.scheduledDeparture), "MMM d, HH:mm")
                    : "-"}
                  {trip.vehicleRegNumber ? ` · ${trip.vehicleRegNumber}` : ""}
                  {trip.conductorName ? ` · ${trip.conductorName}` : ""}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-bold text-slate-900">
                  {money(trip.revenue)}
                </p>
                <p className="text-xs text-slate-500">
                  {trip.passengers} pax · {percent(trip.occupancyRate)}
                </p>
                <p className="text-xs text-slate-500">
                  avg {money(trip.averageFare)}
                </p>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

export function TripCashTable({ trips }: { trips: any[] }) {
  return (
    <Card className="border-none shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Trip Cash Split</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {trips.length === 0 ? (
          <p className="py-8 text-center text-slate-500">No trip cash data.</p>
        ) : (
          trips.slice(0, 10).map((trip) => (
            <div
              key={trip.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-white px-3 py-2.5"
            >
              <p className="min-w-0 flex-1 truncate font-semibold text-slate-900">
                {trip.direction || `Trip #${trip.id}`}
              </p>
              <div className="shrink-0 text-right">
                <p className="text-sm font-bold text-slate-900">
                  {money(trip.revenue)}
                </p>
                <p className="text-xs text-slate-500">
                  cash {money(trip.cashRevenue)} · non-cash{" "}
                  {money(trip.nonCashRevenue)}
                </p>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

export function RouteKpiTable({ rows }: { rows: any[] }) {
  return (
    <Card className="border-none shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          Route Profitability Indicators
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.length === 0 ? (
          <p className="py-8 text-center text-slate-500">
            No route KPIs in this period.
          </p>
        ) : (
          rows.slice(0, 20).map((row) => (
            <div
              key={row.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-slate-100 bg-white px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-slate-900">
                  {row.label}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {row.trips} trips · {row.distanceKm || 0} km
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {row.passengersPerTrip != null
                    ? `${Number(row.passengersPerTrip).toFixed(1)} pax / trip`
                    : "-"}{" "}
                  · {percent(row.occupancyRate)} load
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-bold text-slate-900">
                  {money(row.revenue)}
                </p>
                <p className="text-xs text-slate-500">
                  {row.revenuePerKm === null
                    ? "-"
                    : `${money(row.revenuePerKm)} / km`}
                </p>
                <p className="text-xs text-slate-500">
                  {row.cancelledTrips || 0} cancelled
                </p>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

export function AuditTable({ data }: { data: any }) {
  const rows = data?.tickets || [];
  return (
    <Card className="border-none shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Unsynced Ticket Audit</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.length === 0 ? (
          <p className="py-8 text-center text-slate-500">
            No unsynced cloud tickets in this period.
          </p>
        ) : (
          rows.slice(0, 50).map((ticket: any) => (
            <div
              key={ticket.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-white px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-xs font-semibold text-slate-900">
                  {ticket.ticketNumber}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  trip #{ticket.tripId ?? "-"} ·{" "}
                  {ticket.timestamp
                    ? format(new Date(ticket.timestamp), "MMM d, HH:mm")
                    : "-"}
                </p>
              </div>
              <p className="shrink-0 text-right text-sm font-bold text-slate-900">
                {money(ticket.amount)}
              </p>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

export function CashupReportTable({
  cashup,
  variance,
}: {
  cashup: any;
  variance: any[];
}) {
  return (
    <Card className="border-none shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          Reconciled vs Unreconciled Cash
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs font-bold text-slate-500">Expected</p>
            <p className="text-lg font-black">
              {money(cashup?.expectedCash || 0)}
            </p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs font-bold text-slate-500">Received</p>
            <p className="text-lg font-black">
              {money(cashup?.cashReceived || 0)}
            </p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs font-bold text-slate-500">Variance</p>
            <p className="text-lg font-black">{money(cashup?.variance || 0)}</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs font-bold text-slate-500">Open</p>
            <p className="text-lg font-black">{cashup?.unreconciled || 0}</p>
          </div>
        </div>
        <div className="space-y-2">
          {variance.length === 0 ? (
            <p className="py-8 text-center text-slate-500">
              No reconciliations in this period.
            </p>
          ) : (
            variance.map((row: any) => (
              <div
                key={row.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-white px-3 py-2.5"
              >
                <p className="min-w-0 flex-1 truncate font-semibold text-slate-900">
                  {row.label}
                </p>
                <div className="shrink-0 text-right">
                  <p
                    className={`text-sm font-bold ${
                      Number(row.variance) < -0.005
                        ? "text-red-600"
                        : Number(row.variance) > 0.005
                          ? "text-emerald-600"
                          : "text-slate-900"
                    }`}
                  >
                    {money(row.variance)}
                  </p>
                  <p className="text-xs text-slate-500">
                    exp {money(row.expectedCash)} · recv {money(row.cashReceived)}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function ReconciliationApproval({ companyId }: { companyId: number }) {
  const { data: reconciliations = [], isLoading } = useBusReconciliations(companyId);
  const signOff = useSignOffReconciliation();
  const pending = reconciliations.filter(
    (row: any) => String(row.status) === "pending",
  );
  const signed = reconciliations.filter(
    (row: any) => String(row.status) !== "pending",
  );

  async function handleSignOff(
    row: any,
    status: "approved" | "rejected",
    adminNotes?: string,
  ) {
    try {
      await signOff.mutateAsync({
        companyId,
        reconciliationId: Number(row.id),
        status,
        adminNotes,
      });
    } catch (error: any) {
      alert(error.message || "Failed to update reconciliation");
    }
  }

  return (
    <Card className="mt-4 border-none shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          Conductor Cash-up Approval
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="py-6 text-center text-slate-500">
            Loading reconciliations...
          </p>
        ) : pending.length === 0 ? (
          <p className="py-6 text-center text-slate-500">
            No pending cash-ups. Approving a cash-up posts the corresponding
            accounting entries.
          </p>
        ) : (
          <div className="space-y-2">
            {pending.map((row: any) => {
              const gap = Number(row.gap || 0);
              return (
                <div
                  key={row.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-white px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-900">
                      {row.conductorName || row.conductorEmail || "-"}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {format(new Date(`${row.date}T12:00:00`), "MMM d, yyyy")}
                      {row.notes ? ` · ${row.notes}` : ""}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      exp {money(row.expectedCash)} · recv{" "}
                      {money(row.cashReceived)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className={`text-sm font-bold ${
                        gap < 0
                          ? "text-red-600"
                          : gap > 0
                            ? "text-emerald-600"
                            : "text-slate-500"
                      }`}
                    >
                      {gap < 0 ? "-" : gap > 0 ? "+" : ""}
                      {money(Math.abs(gap))}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-xl border-red-200 text-red-600 hover:bg-red-50"
                      disabled={signOff.isPending}
                      onClick={() => handleSignOff(row, "rejected")}
                    >
                      <XCircle className="mr-1 h-4 w-4" />
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white"
                      disabled={signOff.isPending}
                      onClick={() => handleSignOff(row, "approved")}
                    >
                      <CheckCircle2 className="mr-1 h-4 w-4" />
                      Approve
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {signed.length > 0 && (
          <div className="mt-4 space-y-2 border-t border-slate-100 pt-3">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
              Signed-off ({signed.length})
            </p>
            {signed.slice(0, 10).map((row: any) => (
              <div
                key={row.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-white px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-900">
                    {row.conductorName || row.conductorEmail || "-"}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {format(new Date(`${row.date}T12:00:00`), "MMM d, yyyy")}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                      String(row.status) === "approved"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-red-50 text-red-600"
                    }`}
                  >
                    {String(row.status)}
                  </span>
                  <p className="mt-1 text-xs text-slate-500">
                    {money(row.expectedCash)} · recv {money(row.cashReceived)}
                  </p>
                  <p className="text-xs text-slate-500">
                    {row.accountingStatus === "posted"
                      ? "Posted"
                      : row.accountingStatus === "failed"
                        ? "Posting failed"
                        : "Not posted"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function MiniBars({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ id: string; label: string; revenue: number; tickets: number }>;
}) {
  const max = Math.max(...rows.map((row) => row.revenue), 1);
  return (
    <Card className="border-none shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length === 0 ? (
          <p className="py-8 text-center  text-slate-500">No data</p>
        ) : (
          rows.map((row) => (
            <div key={row.id} className="space-y-1">
              <div className="flex justify-between text-xs font-bold text-slate-600">
                <span>{row.label}</span>
                <span>{money(row.revenue)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-orange-500"
                  style={{
                    width: `${Math.max(4, (row.revenue / max) * 100)}%`,
                  }}
                />
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

export function TicketDetailsTable({ tickets }: { tickets: any[] }) {
  return (
    <Card className="mt-4 border-none shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Route className="h-5 w-5 text-orange-500" />
          Ticket Details
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {tickets.length === 0 ? (
          <p className="py-8 text-center text-slate-500">
            No tickets in this period.
          </p>
        ) : (
          tickets.slice(0, 200).map((ticket: any) => (
            <div
              key={ticket.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-white px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-xs font-semibold text-slate-900">
                  {ticket.ticketNumber}
                </p>
                <p className="mt-0.5 truncate text-xs text-slate-500">
                  {ticket.direction || ticket.routeName || "-"}
                  {ticket.tripId ? ` · trip #${ticket.tripId}` : ""}
                </p>
                <p className="mt-0.5 truncate text-xs text-slate-500">
                  {ticket.conductorName || "-"}
                  {ticket.vehicleRegNumber ? ` · ${ticket.vehicleRegNumber}` : ""}
                  {ticket.timestamp
                    ? ` · ${format(new Date(ticket.timestamp), "MMM d, HH:mm")}`
                    : ""}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-bold text-slate-900">
                  {money(ticket.amount)}
                </p>
                <p className="text-xs text-slate-500">
                  {ticket.paymentMethod || "-"}
                </p>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}