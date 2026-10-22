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
  MapPin,
  Users,
  Bus,
  TrendingUp,
  Armchair,
  Ticket,
} from "lucide-react";
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { useSearch } from "wouter";
import { useBusReport } from "@/hooks/use-bus-ticketing";

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

export default function BusManifestPage() {
  const companyId = parseInt(localStorage.getItem("selectedCompanyId") || "0");
  const search = useSearch();
  const tripParam = useMemo(() => {
    const params = new URLSearchParams(search);
    return params.get("trip") || "all";
  }, [search]);

  const [from, setFrom] = useState(dateInput(addDays(new Date(), -6)));
  const [to, setTo] = useState(dateInput());
  const [tripId, setTripId] = useState<string>(tripParam);

  const { data: report, isLoading, isError } = useBusReport(
    companyId,
    dayBoundaryIso(from),
    dayBoundaryIso(to, true),
  );

  const allTickets = useMemo(() => report?.tickets || [], [report]);
  const trips = useMemo(() => report?.trips || [], [report]);

  const selectedTrip = useMemo(
    () => trips.find((t: any) => String(t.id) === String(tripId)) || null,
    [trips, tripId],
  );

  const manifest = useMemo(
    () =>
      allTickets
        .filter((t: any) => String(t.tripId) === String(tripId))
        .sort((a: any, b: any) => {
          const aSeat = Number((a.seatNumber || "").toString().replace(/\D/g, ""));
          const bSeat = Number((b.seatNumber || "").toString().replace(/\D/g, ""));
          if (aSeat && bSeat) return aSeat - bSeat;
          if (aSeat) return 1;
          if (bSeat) return -1;
          return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
        }),
    [allTickets, tripId],
  );

  const totals = useMemo(
    () => ({
      passengers: manifest.reduce((sum: number, t: any) => sum + Number(t.quantity || 1), 0),
      revenue: manifest.reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0),
      cash: manifest
        .filter((t: any) => (t.paymentMethod || "").toLowerCase() === "cash")
        .reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0),
      nonCash: manifest
        .filter((t: any) => (t.paymentMethod || "").toLowerCase() !== "cash")
        .reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0),
    }),
    [manifest],
  );

  function exportCsv() {
    const header = [
      "Ticket",
      "Seat",
      "Passenger",
      "Boarding",
      "Drop-off",
      "Qty",
      "Amount",
      "Payment",
      "Time",
    ];
    const rows = manifest.map((t: any) => [
      t.ticketNumber || "",
      t.seatNumber || "",
      t.passengerName || "",
      t.boardingPoint || "",
      t.dropOffPoint || "",
      t.quantity,
      t.amount,
      t.paymentMethod || "",
      t.timestamp ? format(new Date(t.timestamp), "yyyy-MM-dd HH:mm") : "",
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((cell: any) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trip-manifest-${tripId}-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Layout>
      <PageHeader
        title="Trip Manifest"
        subtitle="Passenger list for a specific trip"
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
            <Button
              onClick={exportCsv}
              variant="outline"
              className="gap-2"
              disabled={manifest.length === 0}
            >
              <Download className="h-4 w-4" />
              CSV
            </Button>
          </div>
        }
      />

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <StatCard icon={Users} label="Passengers" value={totals.passengers} tone="blue" />
        <StatCard icon={TrendingUp} label="Revenue" value={money(totals.revenue)} />
        <StatCard icon={Ticket} label="Cash" value={money(totals.cash)} tone="emerald" />
        <StatCard icon={Bus} label="Non-Cash" value={money(totals.nonCash)} tone="slate" />
      </div>

      <Card className="mt-4 border-none shadow-sm">
        <CardHeader className="pb-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <Bus className="h-5 w-5 text-orange-500" />
            Select Trip
          </CardTitle>
        </CardHeader>
        <CardContent className="mt-3 grid gap-3 sm:grid-cols-2">
          <Select value={tripId} onValueChange={setTripId}>
            <SelectTrigger>
              <SelectValue placeholder="Trip" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All trips</SelectItem>
              {trips.map((t: any) => (
                <SelectItem key={t.id} value={String(t.id)}>
                  #{t.id} · {t.direction || t.routeName} · {format(new Date(t.scheduledDeparture), "MMM d")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center justify-end text-sm text-slate-500">
            {manifest.length} passenger{manifest.length === 1 ? "" : "s"}
          </div>
        </CardContent>
      </Card>

      {selectedTrip && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Card className="border-none shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Trip</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="font-semibold text-slate-900">
                #{selectedTrip.id} · {selectedTrip.direction || selectedTrip.routeName}
              </p>
              <p className="text-sm text-slate-500">
                {selectedTrip.status || "unknown"} · {selectedTrip.tickets} tickets
              </p>
              <p className="text-sm text-slate-500">
                {selectedTrip.scheduledDeparture
                  ? `Scheduled ${format(new Date(selectedTrip.scheduledDeparture), "MMM d, HH:mm")}`
                  : ""}
              </p>
              <p className="text-sm text-slate-500">
                {selectedTrip.vehicleRegNumber || "-"} · {selectedTrip.conductorName || "-"}
              </p>
            </CardContent>
          </Card>
          <Card className="border-none shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Load</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="font-semibold text-slate-900">
                {totals.passengers} / {selectedTrip.capacity || "-"} seats
              </p>
              <p className="text-sm text-slate-500">{percent(selectedTrip.occupancyRate)} occupied</p>
            </CardContent>
          </Card>
        </div>
      )}

      <Card className="mt-4 border-none shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Ticket className="h-5 w-5 text-orange-500" />
            Passenger List
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex h-40 items-center justify-center text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : isError ? (
            <div className="flex h-40 items-center justify-center text-red-600">
              Failed to load manifest data.
            </div>
          ) : tripId === "all" ? (
            <p className="py-8 text-center text-slate-500">
              Select a trip to view its passenger list.
            </p>
          ) : manifest.length === 0 ? (
            <p className="py-8 text-center text-slate-500">
              No passengers on this trip.
            </p>
          ) : (
            <div className="space-y-2">
              {manifest.map((t: any) => (
                <div
                  key={t.id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-slate-100 bg-white px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-900">
                      <span className="font-mono text-xs">{t.ticketNumber}</span>
                      <span className="ml-2 text-sm">{t.passengerName || "Walk-in"}</span>
                    </p>
                    <p className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                      {t.seatNumber ? (
                        <span className="inline-flex items-center gap-1">
                          <Armchair className="h-3.5 w-3.5" />
                          Seat {t.seatNumber}
                        </span>
                      ) : null}
                      {t.boardingPoint ? (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />
                          {t.boardingPoint} → {t.dropOffPoint || "destination"}
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {t.timestamp
                        ? format(new Date(t.timestamp), "MMM d, HH:mm")
                        : ""}
                    </p>
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