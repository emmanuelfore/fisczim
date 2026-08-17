import { Layout } from "@/components/layout";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { BarChart3, Bus, Clock, Download, Route, Ticket, UserRound, Users } from "lucide-react";
import { useState } from "react";
import {
  BreakdownTable,
  MiniBars,
  StatCard,
  dateInput,
  dayBoundaryIso,
  exportTicketsCsv,
  money,
  percent,
  useReportData,
} from "./shared";
import { Link } from "wouter";

export default function DailyReportPage() {
  const companyId = parseInt(localStorage.getItem("selectedCompanyId") || "0");
  const [date, setDate] = useState(dateInput());

  const {
    isLoading,
    tickets,
    trips,
    totals,
    byHour,
    byRoute,
    byDirection,
    byVehicle,
    byPayment,
    completedTrips,
    averageOccupancy,
    topTrip,
  } = useReportData(
    companyId,
    dayBoundaryIso(date),
    dayBoundaryIso(date, true),
  );

  const avgFare =
    totals.passengers > 0 ? totals.revenue / totals.passengers : 0;

  return (
    <Layout>
      <PageHeader
        title="Daily Report"
        subtitle="Tickets, revenue, and trip performance for a single day"
        actions={
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <Input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="w-[150px]"
            />
            <button
              onClick={() => exportTicketsCsv(tickets, `bus_tickets_${date}`)}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 font-semibold text-slate-700 hover:bg-slate-50"
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
          icon={UserRound}
          label="Avg Fare"
          value={isLoading ? "..." : money(avgFare)}
          tone="slate"
        />
        <StatCard
          icon={Bus}
          label="Trips"
          value={isLoading ? "..." : trips.length}
          tone="blue"
        />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-3 xl:grid-cols-5">
        <StatCard
          icon={Bus}
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
          icon={Clock}
          label="Peak Hour"
          value={
            byHour.length > 0
              ? `${byHour[byHour.length - 1].label} · ${money(byHour[byHour.length - 1].revenue)}`
              : "-"
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
        <MiniBars title="Revenue By Hour" rows={byHour} />
        <BreakdownTable title="Payment Methods" rows={byPayment} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <BreakdownTable title="By Route" rows={byRoute} />
        <BreakdownTable title="By Direction" rows={byDirection} />
        <BreakdownTable title="By Vehicle" rows={byVehicle} />
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
      </div>
    </Layout>
  );
}