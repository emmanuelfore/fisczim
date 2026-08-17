import { Layout } from "@/components/layout";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBusConductors } from "@/hooks/use-bus-ticketing";
import { BarChart3, Bus, Download, Route, Ticket, UserRound, Users } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import {
  BreakdownTable,
  CashupReportTable,
  MiniBars,
  StatCard,
  dateInput,
  dayBoundaryIso,
  exportTicketsCsv,
  money,
  useReportData,
} from "./shared";

export default function ConductorReportPage() {
  const companyId = parseInt(localStorage.getItem("selectedCompanyId") || "0");
  const [date, setDate] = useState(dateInput());
  const [conductorId, setConductorId] = useState("all");
  const { data: conductors = [] } = useBusConductors(companyId);

  const {
    data,
    isLoading,
    tickets,
    trips,
    totals,
    byConductor,
    byPayment,
    byHour,
    conductorVariance,
  } = useReportData(
    companyId,
    dayBoundaryIso(date),
    dayBoundaryIso(date, true),
    conductorId,
  );

  return (
    <Layout>
      <PageHeader
        title="Conductor Report"
        subtitle="Ticket and cash performance per conductor"
        actions={
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <Input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="w-[150px]"
            />
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
            <button
              onClick={() => exportTicketsCsv(tickets, `bus_tickets_conductor_${date}`)}
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
          label="Conductors"
          value={isLoading ? "..." : byConductor.length}
          tone="slate"
        />
        <StatCard
          icon={Bus}
          label="Trips"
          value={isLoading ? "..." : trips.length}
          tone="blue"
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <BreakdownTable
          title="By Conductor"
          rows={byConductor}
          empty="No conductor data"
        />
        <BreakdownTable title="Payment Methods" rows={byPayment} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <CashupReportTable cashup={data?.cashup} variance={conductorVariance} />
        <MiniBars title="Revenue By Hour" rows={byHour} />
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <Link
          href="/bus/reports/cashup"
          className="inline-flex items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-4 py-2 text-sm font-semibold text-orange-700 hover:bg-orange-100"
        >
          <BarChart3 className="h-4 w-4" />
          View Cash-up & Reconciliation
        </Link>
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