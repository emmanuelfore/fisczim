import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LoadingRows } from "@/components/ui/page-skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { VehicleModuleNav } from "@/components/vehicles/module-nav";
import { useActiveCompany } from "@/hooks/use-active-company";
import { fmtMoney } from "@/hooks/use-vehicles";
import { apiFetch } from "@/lib/api";

type AgreementRow = {
  agreement: { id: number; agreementNumber: string; agreedPrice: string; currency: string; status: string };
  vehicle: { id: number; stockNumber: string; make: string; model: string };
  customer: { name: string } | null;
  collected: number;
  balance: number;
  scheduledTotal?: number;
  scheduledBalance?: number;
};

export default function AgreementsListPage() {
  const { activeCompanyId } = useActiveCompany(true);
  const companyId = activeCompanyId || 0;
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const { data = [], isLoading, isError, refetch } = useQuery<AgreementRow[]>({
    queryKey: ["vehicle-agreements", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const response = await apiFetch("/api/companies/" + companyId + "/agreements");
      if (!response.ok) throw new Error("Failed to load sales agreements");
      return response.json();
    },
  });
  const term = search.trim().toLowerCase();
  const rows = data.filter(row => (status === "all" || row.agreement.status === status) && [
    row.agreement.agreementNumber, row.vehicle.stockNumber, row.vehicle.make + " " + row.vehicle.model, row.customer?.name,
  ].some(field => field?.toLowerCase().includes(term))).sort((a, b) => b.agreement.id - a.agreement.id);

  return <Layout><div className="space-y-5">
    <h1 className="text-2xl font-bold text-slate-900">Sales agreements</h1>
    <VehicleModuleNav />
    <div className="flex flex-col gap-2 sm:flex-row">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
        <Input className="pl-9" aria-label="Search agreements" placeholder="Agreement, vehicle, stock no. or customer" value={search} onChange={event => setSearch(event.target.value)} />
      </div>
      <Select value={status} onValueChange={setStatus}>
        <SelectTrigger aria-label="Filter by agreement status" className="sm:w-44"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          {["draft", "active", "completed", "cancelled"].map(value => <SelectItem key={value} value={value} className="capitalize">{value}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
    <Card>
      <Table>
        <TableHeader><TableRow>
          <TableHead>Agreement</TableHead><TableHead className="hidden md:table-cell">Customer</TableHead>
          <TableHead className="hidden text-right sm:table-cell">Total payable</TableHead><TableHead className="hidden text-right sm:table-cell">Received</TableHead>
          <TableHead className="text-right">Outstanding</TableHead><TableHead>Status</TableHead>
        </TableRow></TableHeader>
        <TableBody>{isLoading ? <TableRow><TableCell colSpan={6}><LoadingRows rows={4} /></TableCell></TableRow>
          : isError ? <TableRow><TableCell colSpan={6} className="py-8 text-center">Could not load agreements. <Button variant="link" onClick={() => refetch()}>Retry</Button></TableCell></TableRow>
          : rows.length ? rows.map(({ agreement, vehicle, customer, collected, scheduledTotal, scheduledBalance, balance }) => {
            const due = scheduledBalance ?? balance;
            return <TableRow key={agreement.id}>
              <TableCell>
                <Link className="font-semibold text-blue-700 hover:underline" href={"/vehicles/" + vehicle.id + "?tab=plan"}>{agreement.agreementNumber}</Link>
                <div className="text-xs text-slate-600">{vehicle.stockNumber} · {vehicle.make} {vehicle.model}</div>
                <div className="text-xs text-slate-600 md:hidden">{customer?.name}</div>
              </TableCell>
              <TableCell className="hidden md:table-cell">{customer?.name || "—"}</TableCell>
              <TableCell className="hidden text-right tabular-nums sm:table-cell">{fmtMoney(scheduledTotal ?? agreement.agreedPrice, agreement.currency)}</TableCell>
              <TableCell className="hidden text-right tabular-nums text-emerald-700 sm:table-cell">{fmtMoney(collected, agreement.currency)}</TableCell>
              <TableCell className="text-right font-semibold tabular-nums">{due < 0 ? fmtMoney(-due, agreement.currency) + " credit" : fmtMoney(due, agreement.currency)}</TableCell>
              <TableCell><Badge className={agreement.status === "completed" ? "bg-emerald-100 text-emerald-800 capitalize" : "bg-slate-100 text-slate-800 capitalize"}>{agreement.status}</Badge></TableCell>
            </TableRow>;
          }) : <TableRow><TableCell colSpan={6} className="py-8 text-center text-slate-600">{data.length ? "No agreements match these filters." : "No sales agreements yet."}</TableCell></TableRow>}
        </TableBody>
      </Table>
    </Card>
  </div></Layout>;
}
