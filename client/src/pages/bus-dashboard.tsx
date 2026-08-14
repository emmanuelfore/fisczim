import { Layout } from "@/components/layout";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useBusConductors,
  useBusReport,
  useBusRoutes,
  useBusTrips,
  useBusVehicles,
} from "@/hooks/use-bus-ticketing";
import { Link } from "wouter";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bus,
  CalendarClock,
  Calendar,
  Gauge,
  Route,
  Ticket,
  UserRoundCheck,
  Users,
  WifiOff,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

function todayRange() {
  const now = new Date();
  const start = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    0,
    0,
    0,
    0,
  );
  const end = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    23,
    59,
    59,
    999,
  );
  return {
    from: start.toISOString(),
    to: end.toISOString(),
  };
}

function money(value: number) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function percent(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";
  return `${(Number(value || 0) * 100).toFixed(0)}%`;
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
  tone?: "orange" | "blue" | "emerald" | "slate" | "red" | "amber";
}) {
  const tones = {
    orange: "bg-orange-50 text-orange-600",
    blue: "bg-blue-50 text-blue-600",
    emerald: "bg-emerald-50 text-emerald-600",
    slate: "bg-slate-50 text-slate-600",
    red: "bg-red-50 text-red-600",
    amber: "bg-amber-50 text-amber-600",
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

function ListPanel({
  title,
  rows,
  empty,
  render,
}: {
  title: string;
  rows: any[];
  empty: string;
  render: (row: any) => ReactNode;
}) {
  return (
    <Card className="border-none shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length === 0 ? (
          <p className="py-8 text-center  text-slate-500">{empty}</p>
        ) : (
          rows.map(render)
        )}
      </CardContent>
    </Card>
  );
}

export default function BusDashboardPage() {
  const companyId = parseInt(localStorage.getItem("selectedCompanyId") || "0");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  
  const getDateRange = (dateStr: string) => {
    const date = new Date(dateStr);
    const start = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      0,
      0,
      0,
      0,
    );
    const end = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      23,
      59,
      59,
      999,
    );
    return {
      from: start.toISOString(),
      to: end.toISOString(),
    };
  };
  
  const range = getDateRange(selectedDate);
  const { data: report } = useBusReport(companyId, range.from, range.to);
  const { data: routes = [] } = useBusRoutes(companyId);
  const { data: vehicles = [] } = useBusVehicles(companyId);
  const { data: trips = [] } = useBusTrips(companyId);
  const { data: conductors = [] } = useBusConductors(companyId);

  const totals = report?.totals || { tickets: 0, passengers: 0, revenue: 0 };
  const scheduledTrips = trips.filter(
    (trip: any) => trip.status === "scheduled",
  ).length;
  const activeTrips = trips.filter((trip: any) =>
    ["boarding", "en_route", "in_progress"].includes(trip.status),
  ).length;
  const enRouteTrips = trips.filter((trip: any) =>
    ["en_route", "in_progress"].includes(trip.status),
  ).length;
  const cancelledTrips =
    report?.tripTotals?.cancelled ||
    trips.filter((trip: any) => trip.status === "cancelled").length;
  const activeVehicles = vehicles.filter(
    (vehicle: any) => vehicle.isActive,
  ).length;
  const busUtilization =
    activeVehicles > 0 ? enRouteTrips / activeVehicles : null;
  const unsyncedTickets = report?.syncAudit?.unsyncedTickets || 0;
  const cashupExceptions = report?.cashup?.exceptions || [];
  const averageOccupancy =
    report?.tripTotals?.averageOccupancy ??
    report?.utilization?.averageOccupancy ??
    null;
  const underperformingRoutes = report?.underperformingRoutes || [];
  const conductorVariance = report?.conductorVariance || [];

  return (
    <Layout>
      <PageHeader
        title="Bus Ticketing Dashboard"
        subtitle="Ticketing, dispatch, cash-up, and fleet position"
        actions={
          <div className="flex gap-2">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-slate-500" />
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-auto"
              />
            </div>
            <Link href="/bus/trips">
              <Button variant="outline" className="gap-2">
                <CalendarClock className="h-4 w-4" />
                Trips
              </Button>
            </Link>
            <Link href="/bus/reports">
              <Button className="gap-2">
                <BarChart3 className="h-4 w-4" />
                Reports
              </Button>
            </Link>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Ticket} label="Tickets Today" value={totals.tickets} />
        <StatCard
          icon={Users}
          label="Passengers"
          value={totals.passengers}
          tone="blue"
        />
        <StatCard
          icon={BarChart3}
          label="Revenue"
          value={money(totals.revenue)}
          tone="emerald"
        />
        <StatCard
          icon={Activity}
          label="Active Trips"
          value={activeTrips}
          tone="amber"
        />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard
          icon={CalendarClock}
          label="Scheduled"
          value={scheduledTrips}
          tone="slate"
        />
        <StatCard
          icon={Bus}
          label="En Route"
          value={enRouteTrips}
          tone="blue"
        />
        <StatCard
          icon={Gauge}
          label="Bus Utilization"
          value={percent(busUtilization)}
          tone="emerald"
        />
        <StatCard
          icon={Users}
          label="Avg Occupancy"
          value={percent(averageOccupancy)}
          tone="orange"
        />
        <StatCard
          icon={WifiOff}
          label="Unsynced Tickets"
          value={unsyncedTickets}
          tone={unsyncedTickets > 0 ? "red" : "slate"}
        />
        <StatCard
          icon={AlertTriangle}
          label="Cash Exceptions"
          value={cashupExceptions.length}
          tone={cashupExceptions.length > 0 ? "red" : "slate"}
        />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <StatCard icon={Route} label="Routes" value={routes.length} />
        <StatCard
          icon={Bus}
          label="Active Buses"
          value={`${activeVehicles}/${vehicles.length}`}
          tone="blue"
        />
        <StatCard
          icon={UserRoundCheck}
          label="Conductors"
          value={conductors.length}
          tone="emerald"
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <ListPanel
          title="Active Trip Board"
          rows={(report?.trips || [])
            .filter((trip: any) =>
              ["boarding", "en_route", "in_progress", "scheduled"].includes(
                trip.status,
              ),
            )
            .slice(0, 8)}
          empty="No active or scheduled trips."
          render={(trip: any) => (
            <div
              key={trip.id}
              className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3"
            >
              <div>
                <p className="font-bold text-slate-900">
                  {trip.direction || trip.routeName || `Trip #${trip.id}`}
                </p>
                <p className="text-xs font-semibold text-slate-500">
                  {trip.vehicleRegNumber || "No bus"} -{" "}
                  {trip.conductorName || "No conductor"} - {trip.status}
                </p>
              </div>
              <p className="font-black text-blue-600">
                {percent(trip.occupancyRate)}
              </p>
            </div>
          )}
        />

        <ListPanel
          title="Cash-Up Exceptions"
          rows={cashupExceptions.slice(0, 8)}
          empty="No cash-up exceptions today."
          render={(row: any) => (
            <div
              key={row.id}
              className="flex items-center justify-between rounded-xl bg-red-50 px-4 py-3"
            >
              <div>
                <p className="font-bold text-red-900">
                  {row.conductorName || "Unknown conductor"}
                </p>
                <p className="text-xs font-semibold text-red-600">
                  Expected {money(row.expectedCash)} - received{" "}
                  {money(row.cashReceived)}
                </p>
              </div>
              <p className="font-black text-red-700">{money(row.gap)}</p>
            </div>
          )}
        />

        <ListPanel
          title="Conductor Variance"
          rows={conductorVariance.slice(0, 8)}
          empty="No conductor variances yet."
          render={(row: any) => (
            <div
              key={row.id}
              className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3"
            >
              <div>
                <p className="font-bold text-slate-900">{row.label}</p>
                <p className="text-xs font-semibold text-slate-500">
                  {row.reconciliations} cash-up(s), {row.exceptions}{" "}
                  exception(s)
                </p>
              </div>
              <p
                className={`font-black ${Math.abs(row.variance || 0) > 0 ? "text-red-600" : "text-emerald-600"}`}
              >
                {money(row.variance)}
              </p>
            </div>
          )}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <ListPanel
          title="Top Routes Today"
          rows={(report?.byRoute || []).slice(0, 5)}
          empty="No tickets issued today."
          render={(row: any) => (
            <div
              key={row.id}
              className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3"
            >
              <div>
                <p className="font-bold text-slate-900">{row.label}</p>
                <p className="text-xs font-semibold text-slate-500">
                  {row.passengers} passengers - {row.tickets} tickets
                </p>
              </div>
              <p className="font-black text-orange-600">{money(row.revenue)}</p>
            </div>
          )}
        />

        <ListPanel
          title="Underperforming Routes"
          rows={underperformingRoutes.slice(0, 5)}
          empty="No underperforming routes today."
          render={(row: any) => (
            <div
              key={row.id}
              className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3"
            >
              <div>
                <p className="font-bold text-slate-900">{row.label}</p>
                <p className="text-xs font-semibold text-slate-500">
                  {row.passengers} passengers - {row.trips} trips -{" "}
                  {percent(row.occupancyRate)} load
                </p>
              </div>
              <p className="font-black text-orange-600">{money(row.revenue)}</p>
            </div>
          )}
        />
      </div>

      {cancelledTrips > 0 && (
        <div className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3  font-semibold text-red-700">
          <AlertTriangle className="mr-2 inline h-4 w-4" />
          {cancelledTrips} cancelled trip{cancelledTrips === 1 ? "" : "s"} in
          the selected operating window.
        </div>
      )}
    </Layout>
  );
}
