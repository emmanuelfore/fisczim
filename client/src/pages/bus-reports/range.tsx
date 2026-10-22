import { Layout } from "@/components/layout";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { BarChart3, Bus, Clock, Download, Route, Ticket, UserRound, Users } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import {
  BreakdownTable,
  MiniBars,
  RouteKpiTable,
  StatCard,
  StopSalesTable,
  addDays,
  dateInput,
  dayBoundaryIso,
  exportTicketsCsv,
  money,
  percent,
  useReportData,
} from "./shared";

export default function RangeReportPage() {
  const companyId = parseInt(localStorage.getItem("selectedCompanyId") || "0");
  const [from, setFrom] = useState(dateInput(addDays(new Date(), -6)));
  const [to, setTo] = useState(dateInput());

  const {
    isLoading,
    tickets,
    trips,
    totals,
    byDay,
    byRoute,
    byDirection,
    byConductor,
    byVehicle,
    byPayment,
    byStop,
    routePerformance,
    avgDailyRevenue,
    bestDay,
    completedTrips,
    averageOccupancy,
    topTrip,
  } = useReportData(
    companyId,
    dayBoundaryIso(from),
    dayBoundaryIso(to, true),
  );

  return (
    <Layout>
      <PageHeader
        title="Range Report"
        subtitle="Revenue, trip, and performance trends across a date range"
        actions={
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
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
            <button
              onClick={() => exportTicketsCsv(tickets, `bus_tickets_${from}_to_${to}`)}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-4 w-4" />
              CSV
            </button>
          </div>
        }
      />

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
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

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
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
        <MiniBars title="Daily Revenue Trend" rows={byDay} />
        <BreakdownTable title="Payment Methods" rows={byPayment} />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <BreakdownTable title="By Route" rows={byRoute} />
        <BreakdownTable title="By Direction" rows={byDirection} />
        <BreakdownTable title="By Conductor" rows={byConductor} />
        <BreakdownTable title="By Vehicle" rows={byVehicle} />
        <StopSalesTable rows={byStop} />
      </div>

      <div className="mt-4 grid gap-4">
        <RouteKpiTable rows={routePerformance} />
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <Link
          href="/bus/trip-performance"
          className="inline-flex items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-4 py-2 text-sm font-semibold text-orange-700 hover:bg-orange-100"
        >
          <Bus className="h-4 w-4" />
          View Trip Performance
        </Link>
        <Link
          href="/bus/tickets"
          className="inline-flex items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-4 py-2 text-sm font-semibold text-orange-700 hover:bg-orange-100"
        >
          <Route className="h-4 w-4" />
          View Ticket Details
        </Link>
        <Link
          href="/bus/manifest"
          className="inline-flex items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-4 py-2 text-sm font-semibold text-orange-700 hover:bg-orange-100"
        >
          <Users className="h-4 w-4" />
          Trip Manifest
        </Link>
      </div>
    </Layout>
  );
}