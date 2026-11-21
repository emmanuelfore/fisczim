import { Layout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useActiveCompany } from "@/hooks/use-active-company";
import { apiFetch } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";

const money = (n: unknown, c = "USD") => new Intl.NumberFormat(undefined, { style: "currency", currency: c }).format(Number(n || 0));
export default function AgreementsListPage() {
  const { activeCompanyId } = useActiveCompany(true); const companyId = activeCompanyId || 0;
  const { data = [], isLoading } = useQuery<any[]>({ queryKey: ["vehicle-agreements", companyId], enabled: !!companyId, queryFn: async () => { const r = await apiFetch(`/api/companies/${companyId}/agreements`); if (!r.ok) throw new Error("Failed to load sales agreements"); return r.json(); } });
  return <Layout><div className="space-y-6"><div><h1 className="text-2xl font-bold">Sales Agreements</h1><p className="text-sm text-slate-500">Vehicle instalment agreements, collections and handover status.</p></div><Card><CardHeader><CardTitle>Agreements</CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Agreement</TableHead><TableHead>Vehicle</TableHead><TableHead>Customer</TableHead><TableHead>Agreed price</TableHead><TableHead>Collected</TableHead><TableHead>Balance</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{isLoading ? <TableRow><TableCell colSpan={7}>Loading…</TableCell></TableRow> : data.length ? data.map((r: any) => <TableRow key={r.agreement.id}><TableCell><Link className="text-blue-600 hover:underline" href={`/vehicles/${r.vehicle.id}`}>{r.agreement.agreementNumber}</Link></TableCell><TableCell>{r.vehicle.stockNumber} · {r.vehicle.make} {r.vehicle.model}</TableCell><TableCell>{r.customer?.name || "—"}</TableCell><TableCell>{money(r.agreement.agreedPrice, r.agreement.currency)}</TableCell><TableCell>{money(r.collected, r.agreement.currency)}</TableCell><TableCell>{money(r.balance, r.agreement.currency)}</TableCell><TableCell><Badge variant="outline" className="capitalize">{r.agreement.status}</Badge></TableCell></TableRow>) : <TableRow><TableCell colSpan={7} className="text-slate-500">No sales agreements yet.</TableCell></TableRow>}</TableBody></Table></CardContent></Card></div></Layout>;
}
