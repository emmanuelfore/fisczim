import { Layout } from "@/components/layout";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useBusConductors, useBusReport } from "@/hooks/use-bus-ticketing";
import { format } from "date-fns";
import {
  BarChart3,
  Bus,
  Clock,
  CreditCard,
  Download,
  Route,
  Ticket,
  UserRound,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";

type ReportMode = "daily" | "range" | "conductor" | "trip";

function dateInput(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function dayBoundaryIso(value: string, endOfDay = false) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(
    year,
    (month || 1) - 1,
    day || 1,
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 999 : 0,
  );
  return date.toISOString();
}

function money(value: number) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function percent(value: number | null | undefined) {
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
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  for (
    const cur = new Date(start);
    cur <= end;
    cur.setDate(cur.getDate() + 1)
  ) {
    const id = cur.toISOString().slice(0, 10);
    rows.push({
      id,
      label: format(cur, "MMM d"),
      tickets: 0,
      passengers: 0,
      revenue: 0,
    });
  }
  const map = new Map(rows.map((row) => [row.id, row]));
  tickets.forEach((ticket) => {
    if (!ticket.timestamp) return;
    const key = new Date(ticket.timestamp).toISOString().slice(0, 10);
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
    (ticket) => String(new Date(ticket.timestamp).getHours()).padStart(2, "0"),
    (ticket) =>
      `${String(new Date(ticket.timestamp).getHours()).padStart(2, "0")}h`,
  ).sort((a, b) => Number(a.id) - Number(b.id));
}

function StatCard({
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

function BreakdownTable({
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
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="text-right">Tickets</TableHead>
              <TableHead className="text-right">Passengers</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="h-20 text-center text-slate-500"
                >
                  {empty}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-semibold">{row.label}</TableCell>
                  <TableCell className="text-right">{row.tickets}</TableCell>
                  <TableCell className="text-right">{row.passengers}</TableCell>
                  <TableCell className="text-right font-bold">
                    {money(row.revenue)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function TripPerformanceTable({ trips }: { trips: any[] }) {
  return (
    <Card className="border-none shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Bus className="h-5 w-5 text-orange-500" />
          Trip Performance
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Trip</TableHead>
              <TableHead>Schedule</TableHead>
              <TableHead>Vehicle</TableHead>
              <TableHead>Conductor</TableHead>
              <TableHead className="text-right">Passengers</TableHead>
              <TableHead className="text-right">Load</TableHead>
              <TableHead className="text-right">Avg Fare</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {trips.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="h-24 text-center text-slate-500"
                >
                  No trips in this period.
                </TableCell>
              </TableRow>
            ) : (
              trips.slice(0, 100).map((trip) => (
                <TableRow key={trip.id}>
                  <TableCell>
                    <div className="font-semibold text-slate-900">
                      {trip.direction || trip.routeName || `Trip #${trip.id}`}
                    </div>
                    <div className="text-xs text-slate-500">
                      #{trip.id} - {trip.status || "unknown"} - {trip.tickets}{" "}
                      tickets
                    </div>
                  </TableCell>
                  <TableCell>
                    {trip.scheduledDeparture
                      ? format(
                          new Date(trip.scheduledDeparture),
                          "MMM d, HH:mm",
                        )
                      : "-"}
                  </TableCell>
                  <TableCell>{trip.vehicleRegNumber || "-"}</TableCell>
                  <TableCell>{trip.conductorName || "-"}</TableCell>
                  <TableCell className="text-right">
                    {trip.passengers}
                  </TableCell>
                  <TableCell className="text-right">
                    {percent(trip.occupancyRate)}
                  </TableCell>
                  <TableCell className="text-right">
                    {money(trip.averageFare)}
                  </TableCell>
                  <TableCell className="text-right font-bold">
                    {money(trip.revenue)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function TripCashTable({ trips }: { trips: any[] }) {
  return (
    <Card className="border-none shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Trip Cash Split</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Trip</TableHead>
              <TableHead className="text-right">Cash</TableHead>
              <TableHead className="text-right">Non-Cash</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {trips.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="h-20 text-center text-slate-500"
                >
                  No trip cash data.
                </TableCell>
              </TableRow>
            ) : (
              trips.slice(0, 10).map((trip) => (
                <TableRow key={trip.id}>
                  <TableCell className="font-semibold">
                    {trip.direction || `Trip #${trip.id}`}
                  </TableCell>
                  <TableCell className="text-right">
                    {money(trip.cashRevenue)}
                  </TableCell>
                  <TableCell className="text-right">
                    {money(trip.nonCashRevenue)}
                  </TableCell>
                  <TableCell className="text-right font-bold">
                    {money(trip.revenue)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function RouteKpiTable({ rows }: { rows: any[] }) {
  return (
    <Card className="border-none shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          Route Profitability Indicators
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Route</TableHead>
              <TableHead className="text-right">Revenue / Km</TableHead>
              <TableHead className="text-right">Passengers / Trip</TableHead>
              <TableHead className="text-right">Occupancy</TableHead>
              <TableHead className="text-right">Cancelled</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-20 text-center text-slate-500"
                >
                  No route KPIs in this period.
                </TableCell>
              </TableRow>
            ) : (
              rows.slice(0, 20).map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="font-semibold">{row.label}</div>
                    <div className="text-xs text-slate-500">
                      {row.trips} trips - {row.distanceKm || 0} km
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    {row.revenuePerKm === null ? "-" : money(row.revenuePerKm)}
                  </TableCell>
                  <TableCell className="text-right">
                    {Number(row.passengersPerTrip || 0).toFixed(1)}
                  </TableCell>
                  <TableCell className="text-right">
                    {percent(row.occupancyRate)}
                  </TableCell>
                  <TableCell className="text-right">
                    {row.cancelledTrips || 0}
                  </TableCell>
                  <TableCell className="text-right font-bold">
                    {money(row.revenue)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function AuditTable({ data }: { data: any }) {
  const rows = data?.tickets || [];
  return (
    <Card className="border-none shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Unsynced Ticket Audit</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ticket</TableHead>
              <TableHead>Trip</TableHead>
              <TableHead>Time</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="h-20 text-center text-slate-500"
                >
                  No unsynced cloud tickets in this period.
                </TableCell>
              </TableRow>
            ) : (
              rows.slice(0, 50).map((ticket: any) => (
                <TableRow key={ticket.id}>
                  <TableCell className="font-mono text-xs">
                    {ticket.ticketNumber}
                  </TableCell>
                  <TableCell>
                    {ticket.tripId ? `#${ticket.tripId}` : "-"}
                  </TableCell>
                  <TableCell>
                    {ticket.timestamp
                      ? format(new Date(ticket.timestamp), "MMM d, HH:mm")
                      : "-"}
                  </TableCell>
                  <TableCell className="text-right font-bold">
                    {money(ticket.amount)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function CashupReportTable({
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
        <div className="mb-4 grid gap-3 md:grid-cols-4">
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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Conductor</TableHead>
              <TableHead className="text-right">Expected</TableHead>
              <TableHead className="text-right">Received</TableHead>
              <TableHead className="text-right">Variance</TableHead>
              <TableHead className="text-right">Exceptions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {variance.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="h-20 text-center text-slate-500"
                >
                  No reconciliations in this period.
                </TableCell>
              </TableRow>
            ) : (
              variance.map((row: any) => (
                <TableRow key={row.id}>
                  <TableCell className="font-semibold">{row.label}</TableCell>
                  <TableCell className="text-right">
                    {money(row.expectedCash)}
                  </TableCell>
                  <TableCell className="text-right">
                    {money(row.cashReceived)}
                  </TableCell>
                  <TableCell className="text-right font-bold">
                    {money(row.variance)}
                  </TableCell>
                  <TableCell className="text-right">{row.exceptions}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function MiniBars({
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

export default function BusReportsPage() {
  const companyId = parseInt(localStorage.getItem("selectedCompanyId") || "0");
  const initialReportMode = useMemo<ReportMode>(() => {
    const mode = new URLSearchParams(window.location.search).get("mode");
    return mode === "range" || mode === "conductor" || mode === "trip"
      ? mode
      : "daily";
  }, []);
  const [reportMode, setReportMode] = useState<ReportMode>(initialReportMode);
  const [date, setDate] = useState(dateInput());
  const [from, setFrom] = useState(dateInput(addDays(new Date(), -6)));
  const [to, setTo] = useState(dateInput());
  const [conductorId, setConductorId] = useState("all");
  const { data: conductors = [] } = useBusConductors(companyId);

  const activeFrom =
    reportMode === "daily" || reportMode === "conductor" ? date : from;
  const activeTo =
    reportMode === "daily" || reportMode === "conductor" ? date : to;
  const { data, isLoading } = useBusReport(
    companyId,
    dayBoundaryIso(activeFrom),
    dayBoundaryIso(activeTo, true),
  );

  const tickets = useMemo(() => {
    const list = data?.tickets || [];
    if (reportMode !== "conductor" || conductorId === "all") return list;
    return list.filter(
      (ticket: any) => String(ticket.conductorId) === String(conductorId),
    );
  }, [conductorId, data?.tickets, reportMode]);

  const trips = useMemo(() => {
    const list = data?.trips || [];
    if (reportMode !== "conductor" || conductorId === "all") return list;
    return list.filter(
      (trip: any) => String(trip.conductorId) === String(conductorId),
    );
  }, [conductorId, data?.trips, reportMode]);

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
  const routePerformance = data?.routePerformance || [];
  const conductorVariance = data?.conductorVariance || [];
  const byHour = useMemo(() => hourlyRows(tickets), [tickets]);
  const byDay = useMemo(
    () => buildDayRows(tickets, activeFrom, activeTo),
    [tickets, activeFrom, activeTo],
  );
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

  function exportCsv() {
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
      const d = ticket.timestamp ? new Date(ticket.timestamp) : null;
      return [
        ticket.ticketNumber,
        ticket.tripId || "",
        d ? format(d, "yyyy-MM-dd") : "",
        d ? format(d, "HH:mm") : "",
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
    link.download = `bus_tickets_${activeFrom}_to_${activeTo}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function handleReportModeChange(value: ReportMode) {
    setReportMode(value);
    const url = new URL(window.location.href);
    url.searchParams.set("mode", value);
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  }

  return (
    <Layout>
      <PageHeader
        title="Bus Reports"
        subtitle="Daily, range, conductor, route, payment, hourly, and cash-up reporting"
        actions={
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <Select
              value={reportMode}
              onValueChange={(value: ReportMode) =>
                handleReportModeChange(value)
              }
            >
              <SelectTrigger className="w-[170px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily Report</SelectItem>
                <SelectItem value="range">Range Report</SelectItem>
                <SelectItem value="trip">Trip Report</SelectItem>
                <SelectItem value="conductor">Conductor Report</SelectItem>
              </SelectContent>
            </Select>
            {reportMode === "range" || reportMode === "trip" ? (
              <>
                <Input
                  type="date"
                  value={from}
                  onChange={(event) => setFrom(event.target.value)}
                  className="w-[150px]"
                />
                <Input
                  type="date"
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                  className="w-[150px]"
                />
              </>
            ) : (
              <Input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className="w-[150px]"
              />
            )}
            {reportMode === "conductor" && (
              <Select value={conductorId} onValueChange={setConductorId}>
                <SelectTrigger className="w-[190px]">
                  <SelectValue placeholder="Conductor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All conductors</SelectItem>
                  {conductors.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name || c.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <button
              onClick={exportCsv}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3  font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-4 w-4" />
              CSV
            </button>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
        <StatCard
          icon={Ticket}
          label="Tickets"
          value={isLoading ? "..." : totals.tickets}
        />
        <StatCard
          icon={Users}
          label="Passengers"
          value={isLoading ? "..." : totals.passengers}
          tone="blue"
        />
        <StatCard
          icon={BarChart3}
          label="Revenue"
          value={isLoading ? "..." : money(totals.revenue)}
          tone="emerald"
        />
        <StatCard
          icon={Clock}
          label="Avg / Day"
          value={isLoading ? "..." : money(avgDailyRevenue)}
          tone="slate"
        />
        <StatCard
          icon={UserRound}
          label="Best Day"
          value={
            bestDay.id ? `${bestDay.label} ${money(bestDay.revenue)}` : "-"
          }
          tone="orange"
        />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-3 xl:grid-cols-5">
        <StatCard
          icon={Bus}
          label="Trips"
          value={isLoading ? "..." : trips.length}
          tone="blue"
        />
        <StatCard
          icon={Route}
          label="Completed"
          value={isLoading ? "..." : completedTrips}
          tone="emerald"
        />
        <StatCard
          icon={Users}
          label="Avg Load"
          value={isLoading ? "..." : percent(averageOccupancy)}
          tone="slate"
        />
        <StatCard
          icon={Ticket}
          label="Passengers / Trip"
          value={
            isLoading || trips.length === 0
              ? "-"
              : (totals.passengers / trips.length).toFixed(1)
          }
          tone="orange"
        />
        <StatCard
          icon={BarChart3}
          label="Top Trip"
          value={topTrip.id ? money(topTrip.revenue) : "-"}
          tone="emerald"
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <MiniBars
          title={
            reportMode === "range" || reportMode === "trip"
              ? "Daily Revenue Trend"
              : "Revenue By Hour"
          }
          rows={
            reportMode === "range" || reportMode === "trip" ? byDay : byHour
          }
        />
        <BreakdownTable title="Payment Methods" rows={byPayment} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <BreakdownTable title="By Route" rows={byRoute} />
        <BreakdownTable title="By Direction" rows={byDirection} />
        <BreakdownTable title="By Conductor" rows={byConductor} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <TripPerformanceTable trips={trips} />
        <TripCashTable trips={trips} />
      </div>

      <div className="mt-4 grid gap-4">
        <RouteKpiTable rows={routePerformance} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <CashupReportTable cashup={data?.cashup} variance={conductorVariance} />
        <AuditTable data={data?.syncAudit} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <BreakdownTable title="By Vehicle" rows={byVehicle} />
        <MiniBars
          title="Top Trips By Revenue"
          rows={trips.slice(0, 10).map((trip: any) => ({
            id: String(trip.id),
            label: trip.direction || `Trip #${trip.id}`,
            revenue: Number(trip.revenue || 0),
            tickets: Number(trip.tickets || 0),
          }))}
        />
      </div>

      <Card className="mt-4 border-none shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Route className="h-5 w-5 text-orange-500" />
            Ticket Details
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ticket</TableHead>
                <TableHead>Trip</TableHead>
                <TableHead>Direction</TableHead>
                <TableHead>Conductor</TableHead>
                <TableHead>Vehicle</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead>Time</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tickets.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="h-24 text-center text-slate-500"
                  >
                    No tickets in this period.
                  </TableCell>
                </TableRow>
              ) : (
                tickets.slice(0, 200).map((ticket: any) => (
                  <TableRow key={ticket.id}>
                    <TableCell className="font-mono text-xs">
                      {ticket.ticketNumber}
                    </TableCell>
                    <TableCell>
                      {ticket.tripId ? `#${ticket.tripId}` : "-"}
                    </TableCell>
                    <TableCell>
                      {ticket.direction || ticket.routeName || "-"}
                    </TableCell>
                    <TableCell>{ticket.conductorName || "-"}</TableCell>
                    <TableCell>{ticket.vehicleRegNumber || "-"}</TableCell>
                    <TableCell className="inline-flex items-center gap-1">
                      <CreditCard className="h-3.5 w-3.5 text-slate-400" />
                      {ticket.paymentMethod || "-"}
                    </TableCell>
                    <TableCell>
                      {ticket.timestamp
                        ? format(new Date(ticket.timestamp), "MMM d, HH:mm")
                        : "-"}
                    </TableCell>
                    <TableCell className="text-right font-bold">
                      {money(ticket.amount)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </Layout>
  );
}
