import { Layout } from "@/components/layout";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  CalendarRange,
  Download,
  Loader2,
  Search,
  Ticket,
  Users,
  Wallet,
  Banknote,
  TrendingUp,
  Route,
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

const PAYMENT_OPTIONS = [
  { value: "all", label: "All payments" },
  { value: "cash", label: "Cash" },
  { value: "ecocash", label: "EcoCash" },
  { value: "swipe", label: "Swipe / Card" },
];

const ACCOUNTING_OPTIONS = [
  { value: "all", label: "All accounting" },
  { value: "posted", label: "Posted" },
  { value: "unposted", label: "Unposted" },
  { value: "failed", label: "Failed" },
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

export default function BusTicketDetailsPage() {
  const companyId = parseInt(localStorage.getItem("selectedCompanyId") || "0");

  const [from, setFrom] = useState(dateInput(addDays(new Date(), -6)));
  const [to, setTo] = useState(dateInput());
  const [tripId, setTripId] = useState("all");
  const [routeId, setRouteId] = useState("all");
  const [conductorId, setConductorId] = useState("all");
  const [vehicleId, setVehicleId] = useState("all");
  const [paymentMethod, setPaymentMethod] = useState("all");
  const [accountingStatus, setAccountingStatus] = useState("all");
  const [search, setSearch] = useState("");

  const { data: report, isLoading, isError } = useBusReport(
    companyId,
    dayBoundaryIso(from),
    dayBoundaryIso(to, true),
  );
  const { data: routes = [] } = useBusRoutes(companyId);
  const { data: conductors = [] } = useBusConductors(companyId);
  const { data: vehicles = [] } = useBusVehicles(companyId);

  const allTickets = useMemo(() => report?.tickets || [], [report]);
  const trips = useMemo(() => report?.trips || [], [report]);

  const tickets = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allTickets.filter((t: any) => {
      if (tripId !== "all" && String(t.tripId) !== String(tripId)) return false;
      if (routeId !== "all" && String(t.routeId) !== String(routeId)) return false;
      if (conductorId !== "all" && String(t.conductorId) !== String(conductorId)) return false;
      if (vehicleId !== "all" && String(t.vehicleId) !== String(vehicleId)) return false;
      if (paymentMethod !== "all" && (t.paymentMethod || "").toLowerCase() !== paymentMethod) return false;
      if (accountingStatus !== "all" && (t.accountingStatus || "") !== accountingStatus) return false;
      if (q) {
        const haystack = [
          String(t.ticketNumber || ""),
          String(t.tripId || ""),
          t.direction,
          t.routeName,
          t.conductorName,
          t.vehicleRegNumber,
          t.paymentMethod,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [allTickets, tripId, routeId, conductorId, vehicleId, paymentMethod, accountingStatus, search]);

  const totals = useMemo(
    () => ({
      tickets: tickets.length,
      passengers: tickets.reduce((sum: number, t: any) => sum + Number(t.quantity || 1), 0),
      revenue: tickets.reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0),
      cash: tickets
        .filter((t: any) => (t.paymentMethod || "").toLowerCase() === "cash")
        .reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0),
      nonCash: tickets
        .filter((t: any) => (t.paymentMethod || "").toLowerCase() !== "cash")
        .reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0),
      unposted: tickets.filter((t: any) => t.accountingStatus === "unposted").length,
      failed: tickets.filter((t: any) => t.accountingStatus === "failed").length,
    }),
    [tickets],
  );

  function exportCsv() {
    const header = [
      "Ticket",
      "Trip",
      "Direction",
      "Conductor",
      "Vehicle",
      "Payment",
      "Time",
      "Qty",
      "Amount",
      "Accounting",
    ];
    const rows = tickets.map((t: any) => [
      t.ticketNumber || "",
      `#${t.tripId}`,
      t.direction || "",
      t.conductorName || "",
      t.vehicleRegNumber || "",
      t.paymentMethod || "",
      t.timestamp ? format(new Date(t.timestamp), "yyyy-MM-dd HH:mm") : "",
      t.quantity,
      t.amount,
      t.accountingStatus || "",
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((cell: any) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ticket-details-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Layout>
      <PageHeader
        title="Ticket Details"
        subtitle="Every ticket issued across the selected period"
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

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <StatCard icon={Ticket} label="Tickets" value={totals.tickets} />
        <StatCard icon={Users} label="Passengers" value={totals.passengers} tone="blue" />
        <StatCard icon={Banknote} label="Cash" value={money(totals.cash)} tone="emerald" />
        <StatCard icon={Wallet} label="Non-Cash" value={money(totals.nonCash)} tone="slate" />
        <StatCard icon={TrendingUp} label="Revenue" value={money(totals.revenue)} />
      </div>

      <Card className="mt-4 border-none shadow-sm">
        <CardHeader className="pb-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <Route className="h-5 w-5 text-orange-500" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search ticket #, trip, route..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={tripId} onValueChange={setTripId}>
            <SelectTrigger>
              <SelectValue placeholder="Trip" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All trips</SelectItem>
              {trips.map((t: any) => (
                <SelectItem key={t.id} value={String(t.id)}>
                  #{t.id} - {t.direction || t.routeName}
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
          <Select value={paymentMethod} onValueChange={setPaymentMethod}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAYMENT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={accountingStatus} onValueChange={setAccountingStatus}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACCOUNTING_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center justify-end text-sm text-slate-500">
            {totals.tickets} ticket{totals.tickets === 1 ? "" : "s"}
            {totals.unposted > 0 && (
              <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                {totals.unposted} unposted
              </span>
            )}
            {totals.failed > 0 && (
              <span className="ml-2 rounded bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                {totals.failed} failed
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4 border-none shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Ticket className="h-5 w-5 text-orange-500" />
            Ticket Details
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex h-40 items-center justify-center text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : isError ? (
            <div className="flex h-40 items-center justify-center text-red-600">
              Failed to load ticket data.
            </div>
          ) : tickets.length === 0 ? (
            <div className="flex h-40 items-center justify-center text-slate-500">
              No tickets match the selected filters.
            </div>
          ) : (
            <div className="space-y-2">
              {tickets.map((t: any) => (
                <div
                  key={t.id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-slate-100 bg-white px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-900">
                      <span className="font-mono text-xs">{t.ticketNumber}</span>
                      <span className="text-xs font-normal text-slate-500">
                        {" "}
                        · #{t.id}
                      </span>
                    </p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {t.direction || "-"}
                      {t.tripId ? ` · trip #${t.tripId}` : ""}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {t.conductorName || "-"}
                      {t.vehicleRegNumber ? ` · ${t.vehicleRegNumber}` : ""}
                      {t.timestamp
                        ? ` · ${format(new Date(t.timestamp), "MMM d, HH:mm")}`
                        : ""}
                    </p>
                    {t.accountingStatus === "failed" && t.accountingError && (
                      <p className="mt-0.5 text-xs text-red-600">
                        {t.accountingError}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold text-slate-900">
                      {money(t.amount)}
                    </p>
                    <p className="text-xs text-slate-500">Qty {t.quantity}</p>
                    <span
                      className={`mt-0.5 inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                        (t.paymentMethod || "").toLowerCase() === "cash"
                          ? "bg-emerald-100 text-emerald-700"
                          : (t.paymentMethod || "").toLowerCase() === "ecocash"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-blue-100 text-blue-700"
                      }`}
                    >
                      {t.paymentMethod || "-"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </Layout>
  );
}