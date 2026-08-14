import { Layout } from "@/components/layout";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Bus,
  CalendarRange,
  CheckCircle2,
  Clock,
  Download,
  Loader2,
  Search,
  Users,
  XCircle,
  Route,
  TrendingUp,
  AlertTriangle,
} from "lucide-react";
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { useBusReport, useBusRoutes, useBusConductors, useBusVehicles } from "@/hooks/use-bus-ticketing";

const HARARE_OFFSET_MS = 2 * 60 * 60 * 1000;

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
  const utcMidnight = Date.UTC(year, (month || 1) - 1, day || 1);
  return endOfDay
    ? new Date(utcMidnight + 86400000 - 1 - HARARE_OFFSET_MS).toISOString()
    : new Date(utcMidnight - HARARE_OFFSET_MS).toISOString();
}

function money(value: number) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function percent(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";
  return `${(Number(value || 0) * 100).toFixed(0)}%`;
}

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "scheduled", label: "Scheduled" },
  { value: "boarding", label: "Boarding" },
  { value: "en_route", label: "En route" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

function StatCard({
  icon: Icon,
  label,
  value,
  tone = "orange",
}: {
  icon: any;
  label: string;
  value: string | number;
  tone?: "orange" | "blue" | "emerald" | "slate" | "red";
}) {
  const tones = {
    orange: "bg-orange-50 text-orange-600",
    blue: "bg-blue-50 text-blue-600",
    emerald: "bg-emerald-50 text-emerald-600",
    slate: "bg-slate-50 text-slate-600",
    red: "bg-red-50 text-red-600",
  };
  return (
    <Card className="border-none shadow-sm">
      <CardContent className="flex items-center gap-4 p-5">
        <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${tones[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-black text-slate-900">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function BusTripPerformancePage() {
  const companyId = parseInt(localStorage.getItem("selectedCompanyId") || "0");

  const [from, setFrom] = useState(dateInput(addDays(new Date(), -6)));
  const [to, setTo] = useState(dateInput());
  const [statusFilter, setStatusFilter] = useState("all");
  const [routeId, setRouteId] = useState("all");
  const [conductorId, setConductorId] = useState("all");
  const [vehicleId, setVehicleId] = useState("all");
  const [search, setSearch] = useState("");

  const { data: report, isLoading, isError } = useBusReport(
    companyId,
    dayBoundaryIso(from),
    dayBoundaryIso(to, true),
  );
  const { data: routes = [] } = useBusRoutes(companyId);
  const { data: conductors = [] } = useBusConductors(companyId);
  const { data: vehicles = [] } = useBusVehicles(companyId);

  const allTrips = useMemo(() => report?.trips || [], [report]);

  const trips = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allTrips.filter((trip: any) => {
      if (statusFilter !== "all" && trip.status !== statusFilter) return false;
      if (routeId !== "all" && String(trip.routeId) !== String(routeId)) return false;
      if (conductorId !== "all" && String(trip.conductorId) !== String(conductorId)) return false;
      if (vehicleId !== "all" && String(trip.vehicleId) !== String(vehicleId)) return false;
      if (q) {
        const haystack = [
          String(trip.id),
          trip.direction,
          trip.routeName,
          trip.conductorName,
          trip.vehicleRegNumber,
          trip.status,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [allTrips, statusFilter, routeId, conductorId, vehicleId, search]);

  const totals = useMemo(
    () => ({
      trips: trips.length,
      completed: trips.filter((t: any) => t.status === "completed").length,
      cancelled: trips.filter((t: any) => t.status === "cancelled").length,
      inProgress: trips.filter((t: any) => ["boarding", "en_route", "in_progress"].includes(t.status)).length,
      scheduled: trips.filter((t: any) => t.status === "scheduled").length,
      passengers: trips.reduce((sum: number, t: any) => sum + Number(t.passengers || 0), 0),
      revenue: trips.reduce((sum: number, t: any) => sum + Number(t.revenue || 0), 0),
      seats: trips.reduce((sum: number, t: any) => sum + Number(t.capacity || 0), 0),
      withLoad: trips.filter((t: any) => t.occupancyRate !== null).length,
    }),
    [trips],
  );

  const avgOccupancy =
    totals.withLoad > 0
      ? trips.reduce((sum: number, t: any) => sum + Number(t.occupancyRate || 0), 0) / totals.withLoad
      : 0;

  function exportCsv() {
    const header = [
      "Trip",
      "Route",
      "Direction",
      "Status",
      "Scheduled",
      "Started",
      "Arrived",
      "Vehicle",
      "Conductor",
      "Passengers",
      "Load",
      "Avg Fare",
      "Revenue",
    ];
    const rows = trips.map((t: any) => [
      `#${t.id}`,
      t.routeName || "",
      t.direction || "",
      t.status || "",
      t.scheduledDeparture ? format(new Date(t.scheduledDeparture), "yyyy-MM-dd HH:mm") : "",
      t.actualDeparture ? format(new Date(t.actualDeparture), "yyyy-MM-dd HH:mm") : "",
      t.actualArrival ? format(new Date(t.actualArrival), "yyyy-MM-dd HH:mm") : "",
      t.vehicleRegNumber || "",
      t.conductorName || "",
      t.passengers,
      t.occupancyRate === null ? "" : (Number(t.occupancyRate) * 100).toFixed(0) + "%",
      t.averageFare ? t.averageFare.toFixed(2) : "",
      t.revenue ? t.revenue.toFixed(2) : "",
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((cell: any) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trip-performance-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Layout>
      <PageHeader
        title="Trip Performance"
        subtitle="Trip-level dispatch and revenue across the selected period"
        actions={
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <div className="flex items-center gap-2">
              <CalendarRange className="h-4 w-4 text-slate-400" />
              <Input
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
                className="w-[150px]"
              />
              <span className="text-slate-400">to</span>
              <Input
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
                className="w-[150px]"
              />
            </div>
            <Button onClick={exportCsv} variant="outline" className="gap-2">
              <Download className="h-4 w-4" />
              CSV
            </Button>
          </div>
        }
      />

      <div className="mt-4 grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard icon={Bus} label="Trips" value={totals.trips} />
        <StatCard icon={CheckCircle2} label="Completed" value={totals.completed} tone="emerald" />
        <StatCard icon={Clock} label="In Progress" value={totals.inProgress} tone="blue" />
        <StatCard icon={Users} label="Passengers" value={totals.passengers} tone="blue" />
        <StatCard icon={TrendingUp} label="Revenue" value={money(totals.revenue)} />
        <StatCard icon={AlertTriangle} label="Avg Load" value={percent(avgOccupancy)} tone="slate" />
      </div>

      <Card className="mt-4 border-none shadow-sm">
        <CardHeader className="pb-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <Route className="h-5 w-5 text-orange-500" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="mt-3 grid gap-3 lg:grid-cols-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search trip, route, conductor..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={routeId} onValueChange={setRouteId}>
            <SelectTrigger>
              <SelectValue placeholder="Route" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All routes</SelectItem>
              {routes.map((r: any) => (
                <SelectItem key={r.id} value={String(r.id)}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={conductorId} onValueChange={setConductorId}>
            <SelectTrigger>
              <SelectValue placeholder="Conductor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All conductors</SelectItem>
              {conductors.map((c: any) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name || c.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={vehicleId} onValueChange={setVehicleId}>
            <SelectTrigger>
              <SelectValue placeholder="Vehicle" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All vehicles</SelectItem>
              {vehicles.map((v: any) => (
                <SelectItem key={v.id} value={String(v.id)}>
                  {v.registrationNumber || v.regNumber}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center justify-end text-sm text-slate-500 lg:col-span-1">
            {trips.length} trip{trips.length === 1 ? "" : "s"}
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4 border-none shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Bus className="h-5 w-5 text-orange-500" />
            Trip Performance
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex h-40 items-center justify-center text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : isError ? (
            <div className="flex h-40 items-center justify-center text-red-600">
              Failed to load trip data.
            </div>
          ) : trips.length === 0 ? (
            <div className="flex h-40 items-center justify-center text-slate-500">
              No trips match the selected filters.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Trip</TableHead>
                  <TableHead>Scheduled</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Arrived</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Conductor</TableHead>
                  <TableHead className="text-right">Passengers</TableHead>
                  <TableHead className="text-right">Load</TableHead>
                  <TableHead className="text-right">Avg Fare</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trips.map((trip: any) => (
                  <TableRow key={trip.id}>
                    <TableCell>
                      <div className="font-semibold text-slate-900">
                        {trip.direction || trip.routeName || `Trip #${trip.id}`}
                      </div>
                      <div className="text-xs text-slate-500">
                        #{trip.id} - {trip.status || "unknown"} - {trip.tickets} tickets
                      </div>
                    </TableCell>
                    <TableCell>
                      {trip.scheduledDeparture
                        ? format(new Date(trip.scheduledDeparture), "MMM d, HH:mm")
                        : "-"}
                    </TableCell>
                    <TableCell>
                      {trip.actualDeparture
                        ? format(new Date(trip.actualDeparture), "MMM d, HH:mm")
                        : "-"}
                    </TableCell>
                    <TableCell>
                      {trip.actualArrival
                        ? format(new Date(trip.actualArrival), "MMM d, HH:mm")
                        : "-"}
                    </TableCell>
                    <TableCell>{trip.vehicleRegNumber || "-"}</TableCell>
                    <TableCell>{trip.conductorName || "-"}</TableCell>
                    <TableCell className="text-right">{trip.passengers}</TableCell>
                    <TableCell className="text-right">{percent(trip.occupancyRate)}</TableCell>
                    <TableCell className="text-right">{money(trip.averageFare)}</TableCell>
                    <TableCell className="text-right font-bold">{money(trip.revenue)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </Layout>
  );
}