import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BlobProvider, Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/api";
import { costLabel, fmtMoney } from "@/hooks/use-vehicles";
import { PaymentSchedule, type ScheduleRow } from "./payment-schedule";

type Headline = { id: number; stockNumber: string; make: string; model: string };
type VehicleStatement = {
  stockNumber: string; description: string; customerName: string | null; currency: string;
  agreementNumber: string | null; agreementStatus: string | null;
  agreedPrice: number; scheduledTotal: number; payable: number; received: number; balance: number;
  deposit: number; adminFee: number; financingCharges: number; processingFee: number | null;
  invoice: { number: string; total: string; currency: string } | null;
  schedule: ScheduleRow[];
  receipts: { id: number; date: string; reference: string | null; method: string; amount: number }[];
  costs: { id: number; category: string; description: string | null; amount: number }[];
};

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, fontFamily: "Helvetica" },
  title: { fontSize: 18, marginBottom: 8 },
  caption: { color: "#475569", marginBottom: 6 },
  heading: { fontWeight: 700, marginTop: 16, marginBottom: 5 },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: "#e2e8f0" },
  label: { flex: 1 },
});
const dateLabel = (value: string) => new Date(value.length === 10 ? value + "T00:00:00" : value).toLocaleDateString();

function statementLines(data: VehicleStatement): [string, string][] {
  const money = (amount: number) => fmtMoney(amount, data.currency);
  return [
    ["Agreed price", money(data.agreedPrice)],
    ["Deposit", money(data.deposit)],
    ...(data.scheduledTotal > 0 ? [["Scheduled total", money(data.scheduledTotal)] as [string, string]] : []),
    ...(data.financingCharges > 0 ? [["Agreed interest", money(data.financingCharges)] as [string, string]] : []),
    ...(data.adminFee > 0 ? [["Financing admin fee", money(data.adminFee)] as [string, string]] : []),
    ...(data.processingFee != null ? [["Processing fee (included)", money(data.processingFee)] as [string, string]] : []),
  ];
}

export function StatementPDF({ data, companyName }: { data: VehicleStatement; companyName: string }) {
  const money = (value: number) => fmtMoney(value, data.currency);
  const line = (label: string, value: string, key = label) => <View key={key} style={styles.row} wrap={false}><Text style={styles.label}>{label}</Text><Text>{value}</Text></View>;
  return <Document title={`Vehicle statement · ${data.stockNumber}`}><Page size="A4" style={styles.page}>
    <Text style={styles.title}>Vehicle statement of account</Text>
    <Text style={styles.caption}>{companyName}</Text>
    <Text style={styles.caption}>{data.customerName || "Customer unassigned"} · {data.stockNumber} · {data.description}</Text>
    {data.agreementNumber && <Text style={styles.caption}>Agreement {data.agreementNumber} · {data.agreementStatus}</Text>}
    {statementLines(data).map(([label, value]) => line(label, value))}
    {line("Total payable", money(data.payable))}
    {line("Payments received", money(data.received))}
    {line(data.balance < 0 ? "Credit" : "Outstanding balance", money(Math.abs(data.balance)))}
    {data.invoice && line(`Invoice ${data.invoice.number}`, fmtMoney(data.invoice.total, data.invoice.currency))}
    {data.schedule.length > 0 && <>
      <Text style={styles.heading}>Payment schedule</Text>
      <Text style={styles.caption}>Due date · payment | Scheduled · Paid · Outstanding</Text>
      {data.schedule.filter(item => item.amount > 0).map(item => line(
        `${dateLabel(item.dueDate)} · ${item.type === "deposit" ? "Deposit" : "Instalment"}`,
        `${money(item.amount)} · ${money(item.amount - item.open)} · ${money(item.open)}`, "s" + item.id,
      ))}
    </>}
    <Text style={styles.heading}>Receipts</Text>
    {data.receipts.length ? data.receipts.map(receipt => line(
      `${dateLabel(receipt.date)} · ${receipt.reference || "Receipt " + receipt.id}`, money(receipt.amount), "p" + receipt.id,
    )) : <Text style={styles.caption}>No receipts recorded.</Text>}
    {data.costs.length > 0 && <>
      <Text style={styles.heading}>Customer import costs</Text>
      {data.costs.map(cost => line(cost.description || costLabel(cost.category), money(cost.amount), "c" + cost.id))}
    </>}
  </Page></Document>;
}

export function VehicleStatementPreview({ companyId, vehicles, companyName }: { companyId: number; vehicles: Headline[]; companyName: string }) {
  const [requested, setRequested] = useState<number>();
  const [pdfOpen, setPdfOpen] = useState(false);
  const selected = vehicles.find(vehicle => vehicle.id === requested) ?? vehicles[0];
  const { data, isLoading, isError, refetch } = useQuery<VehicleStatement>({
    queryKey: ["vehicle-statement", companyId, selected?.id],
    enabled: !!companyId && !!selected,
    queryFn: async () => {
      const response = await apiFetch(`/api/companies/${companyId}/vehicles/${selected.id}/statement`);
      if (!response.ok) throw new Error("Could not load the vehicle statement");
      return response.json();
    },
  });
  return <Card>
    <CardHeader className="space-y-3"><CardTitle>Vehicle statement of account</CardTitle>
      {!!vehicles.length && <div><label htmlFor="statement-vehicle" className="mb-1 block text-sm font-medium">Vehicle</label>
        <select id="statement-vehicle" className="w-full rounded-md border bg-background p-2 text-sm sm:max-w-sm" value={selected?.id ?? ""} onChange={event => setRequested(Number(event.target.value))}>
          {vehicles.map(vehicle => <option key={vehicle.id} value={vehicle.id}>{vehicle.stockNumber} · {vehicle.make} {vehicle.model}</option>)}
        </select>
      </div>}
    </CardHeader>
    <CardContent className="space-y-5">
      {!selected && <p className="text-sm text-slate-600">Select a customer with a linked vehicle to view their agreement, schedule, and payments.</p>}
      {isLoading && <p className="text-sm text-slate-600">Loading vehicle statement…</p>}
      {isError && <p className="text-sm text-rose-700">Could not load the vehicle statement. <Button variant="link" onClick={() => refetch()}>Retry</Button></p>}
      {data && <>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="font-semibold">{data.customerName || "Customer unassigned"} · {data.stockNumber}</p>
            <p className="text-sm text-slate-600">{data.agreementNumber ? `Agreement ${data.agreementNumber} · ${data.agreementStatus}` : "No saved agreement"}</p></div>
          <Button variant="outline" onClick={() => setPdfOpen(true)}>Preview / download PDF</Button>
        </div>
        <dl className="grid grid-cols-1 gap-3 rounded-lg bg-slate-50 p-4 sm:grid-cols-3">
          {[["Total payable", data.payable], ["Received", data.received], [data.balance < 0 ? "Credit" : "Outstanding", Math.abs(data.balance)]].map(([label, amount]) =>
            <div key={label}><dt className="text-sm text-slate-600">{label}</dt><dd className="break-words text-lg font-semibold tabular-nums">{fmtMoney(amount, data.currency)}</dd></div>,
          )}
        </dl>
        <details className="rounded-lg border p-3"><summary className="cursor-pointer font-medium">Agreement and price details</summary>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">{statementLines(data).map(([label, value]) => <div key={label}><dt className="text-slate-600">{label}</dt><dd className="font-medium">{value}</dd></div>)}
            {data.invoice && <div><dt className="text-slate-600">Invoice {data.invoice.number}</dt><dd>{fmtMoney(data.invoice.total, data.invoice.currency)}</dd></div>}
          </dl>
        </details>
        {data.costs.length > 0 && <details className="rounded-lg border p-3"><summary className="cursor-pointer font-medium">Customer import costs</summary>
          <dl className="mt-2 space-y-2 text-sm">{data.costs.map(cost => <div key={cost.id} className="flex justify-between gap-3">
            <dt>{cost.description || costLabel(cost.category)}</dt><dd className="shrink-0 tabular-nums">{fmtMoney(cost.amount, data.currency)}</dd>
          </div>)}</dl>
        </details>}
        <section><h3 className="mb-2 font-semibold">Payment schedule</h3><PaymentSchedule currency={data.currency} lines={data.schedule} /></section>
        <section><h3 className="mb-2 font-semibold">Receipts</h3>
          {data.receipts.length ? <Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Receipt</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
            <TableBody>{data.receipts.map(receipt => <TableRow key={receipt.id}><TableCell>{dateLabel(receipt.date)}</TableCell>
              <TableCell>{receipt.reference || `VR-${receipt.id}`}<span className="block text-xs text-slate-600">{receipt.method}</span></TableCell>
              <TableCell className="text-right tabular-nums">{fmtMoney(receipt.amount, data.currency)}</TableCell>
            </TableRow>)}</TableBody></Table> : <p className="text-sm text-slate-600">No receipts recorded.</p>}
        </section>
      </>}
    </CardContent>
    {data && <Dialog open={pdfOpen} onOpenChange={setPdfOpen}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader><DialogTitle>Statement preview</DialogTitle><DialogDescription>{data.stockNumber} · {data.description}</DialogDescription></DialogHeader>
        {pdfOpen && <BlobProvider document={<StatementPDF data={data} companyName={companyName} />}>{({ url, loading, error }) =>
          loading ? <p>Preparing PDF…</p> : error || !url ? <p>Could not render the statement.</p> : <div className="space-y-3">
            <iframe src={url} title="Vehicle statement PDF" className="h-[60dvh] w-full rounded border" />
            <Button asChild><a href={url} download={`Vehicle-statement-${data.stockNumber}.pdf`}>Download PDF</a></Button>
          </div>
        }</BlobProvider>}
      </DialogContent>
    </Dialog>}
  </Card>;
}
