import { Layout } from "@/components/layout";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useBusConductors, useBusReport, useBusRoutes, useBusTrips, useBusVehicles } from "@/hooks/use-bus-ticketing";
import { Link } from "wouter";
import { BarChart3, Bus, CalendarClock, Route, Ticket, UserRoundCheck, Users } from "lucide-react";

function todayRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  return {
    from: start.toISOString(),
    to: end.toISOString(),
  };
}

function money(value: number) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function StatCard({ icon: Icon, label, value, tone = "orange" }: { icon: any; label: string; value: string | number; tone?: "orange" | "blue" | "emerald" | "slate" }) {
  const tones = {
    orange: "bg-orange-50 text-orange-600",
    blue: "bg-blue-50 text-blue-600",
    emerald: "bg-emerald-50 text-emerald-600",
    slate: "bg-slate-50 text-slate-600",
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

export default function BusDashboardPage() {
  const companyId = parseInt(localStorage.getItem("selectedCompanyId") || "0");
  const range = todayRange();
  const { data: report } = useBusReport(companyId, range.from, range.to);
  const { data: routes = [] } = useBusRoutes(companyId);
  const { data: vehicles = [] } = useBusVehicles(companyId);
  const { data: trips = [] } = useBusTrips(companyId);
  const { data: conductors = [] } = useBusConductors(companyId);

  const totals = report?.totals || { tickets: 0, passengers: 0, revenue: 0 };
  const scheduledTrips = trips.filter((trip: any) => trip.status === "scheduled").length;
  const activeVehicles = vehicles.filter((vehicle: any) => vehicle.isActive).length;

  return (
    <Layout>
      <PageHeader
        title="Bus Ticketing Dashboard"
        subtitle="Today’s ticketing, dispatch, and fleet position"
        actions={
          <div className="flex gap-2">
            <Link href="/bus/trips"><Button variant="outline" className="gap-2"><CalendarClock className="h-4 w-4" />Trips</Button></Link>
            <Link href="/bus/reports"><Button className="gap-2"><BarChart3 className="h-4 w-4" />Reports</Button></Link>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Ticket} label="Tickets Today" value={totals.tickets} />
        <StatCard icon={Users} label="Passengers" value={totals.passengers} tone="blue" />
        <StatCard icon={BarChart3} label="Revenue" value={money(totals.revenue)} tone="emerald" />
        <StatCard icon={CalendarClock} label="Scheduled Trips" value={scheduledTrips} tone="slate" />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <StatCard icon={Route} label="Routes" value={routes.length} />
        <StatCard icon={Bus} label="Active Buses" value={`${activeVehicles}/${vehicles.length}`} tone="blue" />
        <StatCard icon={UserRoundCheck} label="Conductors" value={conductors.length} tone="emerald" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card className="border-none shadow-sm">
          <CardHeader><CardTitle className="text-base">Top Routes Today</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {(report?.byRoute || []).slice(0, 5).map((row: any) => (
              <div key={row.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                <div>
                  <p className="font-bold text-slate-900">{row.label}</p>
                  <p className="text-xs font-semibold text-slate-500">{row.passengers} passengers · {row.tickets} tickets</p>
                </div>
                <p className="font-black text-orange-600">{money(row.revenue)}</p>
              </div>
            ))}
            {(report?.byRoute || []).length === 0 && <p className="py-8 text-center text-sm text-slate-500">No tickets issued today.</p>}
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm">
          <CardHeader><CardTitle className="text-base">Conductor Cash Position</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {(report?.byConductor || []).slice(0, 5).map((row: any) => (
              <div key={row.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                <div>
                  <p className="font-bold text-slate-900">{row.label}</p>
                  <p className="text-xs font-semibold text-slate-500">{row.passengers} passengers · {row.tickets} tickets</p>
                </div>
                <p className="font-black text-emerald-600">{money(row.revenue)}</p>
              </div>
            ))}
            {(report?.byConductor || []).length === 0 && <p className="py-8 text-center text-sm text-slate-500">No conductor sales today.</p>}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
