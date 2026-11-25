import { format, parseISO } from "date-fns";
import { PaymentSchedule, type ScheduleRow } from "@/components/vehicles/payment-schedule";
import { costLabel, fmtMoney, type VehicleCostSheetLine } from "@/hooks/use-vehicles";
import { dealScheduleSummary } from "@/lib/vehicle-schedule";

type DealPreviewProps = {
  currency: string;
  agreedPrice: number;
  paid: number;
  schedule: ScheduleRow[];
  costs?: VehicleCostSheetLine[];
  exchangeRate: number;
  processingFee?: number;
  interest?: number;
  adminFee?: number;
  invoice?: { subtotal: number; tax: number; total: number; kind: string; currency?: string };
};

export function VehicleDealPreview({
  currency, agreedPrice, paid, schedule, costs, exchangeRate, processingFee,
  interest, adminFee, invoice,
}: DealPreviewProps) {
  const agency = processingFee != null;
  const today = format(new Date(), "yyyy-MM-dd");
  const summary = dealScheduleSummary(schedule, today);
  const hasSchedule = summary.total > 0;
  const money = (amount: number) => fmtMoney(amount, currency);
  const customerCosts = (costs ?? []).map(cost => ({
    ...cost, charge: Math.round(cost.customerCharge * exchangeRate * 100) / 100,
  }));
  const listedTotal = customerCosts.reduce((sum, cost) => sum + cost.charge, 0) + (processingFee ?? 0);
  const invoiceCurrency = invoice?.currency ?? currency;
  const moneyOnInvoice = (amount: number) => fmtMoney(amount, invoiceCurrency);
  const noScheduleTotal = !agency && invoice && invoiceCurrency === currency ? invoice.total : agreedPrice;
  const remaining = hasSchedule ? summary.balance : Math.max(noScheduleTotal - paid, 0);
  const deposit = schedule.find(line => line.type === "deposit" && line.amount > 0);

  return <section aria-label="Customer deal preview" className="space-y-4">
    <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4 md:grid-cols-4">
      <div><p className="text-xs text-slate-600">{hasSchedule ? "Scheduled total" : "Customer total"}</p><p className="font-semibold tabular-nums">{money(hasSchedule ? summary.total : noScheduleTotal)}</p></div>
      <div><p className="text-xs text-slate-600">Received</p><p className="font-semibold tabular-nums text-emerald-700">{money(paid)}</p></div>
      <div><p className="text-xs text-slate-600">{hasSchedule ? "Schedule balance" : "Outstanding"}</p><p className="font-semibold tabular-nums">{money(remaining)}</p></div>
      <div><p className="text-xs text-slate-600">Due now</p><p className={`font-semibold tabular-nums ${summary.dueToday > 0 ? "text-amber-800" : ""}`}>{hasSchedule ? money(summary.dueToday) : "—"}</p>
        {summary.next ? <p className="text-xs text-slate-600">Next: {money(summary.next.open)} · {format(parseISO(summary.next.dueDate), "d MMM")}</p>
          : !hasSchedule && <p className="text-xs text-slate-600">No payment schedule</p>}
      </div>
    </div>
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-lg border p-4">
        <h3 className="mb-3 font-semibold">Price breakdown</h3>
        <dl className="space-y-2 text-sm">
          {customerCosts.map(cost => <div key={cost.id} className="flex justify-between gap-2"><dt>{costLabel(cost.category)}{cost.description ? ` · ${cost.description}` : ""}</dt><dd className="shrink-0 tabular-nums">{money(cost.charge)}</dd></div>)}
          {agency && <div className="flex justify-between gap-2"><dt>Processing fee</dt><dd className="tabular-nums">{money(processingFee)}</dd></div>}
          <div className="flex justify-between gap-2 font-semibold"><dt>{agency ? "Agreed customer price" : "Agreed vehicle price"}</dt><dd className="tabular-nums">{money(agreedPrice)}</dd></div>
          {interest != null && interest > 0 && <div className="flex justify-between gap-2"><dt>Agreed interest</dt><dd className="tabular-nums">{money(interest)}</dd></div>}
          {adminFee != null && adminFee > 0 && <div className="flex justify-between gap-2"><dt>Financing admin fee</dt><dd className="tabular-nums">{money(adminFee)}</dd></div>}
          {deposit && <div className="flex justify-between gap-2 border-t pt-2"><dt>Deposit · {format(parseISO(deposit.dueDate), "d MMM yyyy")}</dt><dd className="tabular-nums">{money(deposit.amount)}</dd></div>}
        </dl>
        {customerCosts.length > 0 && Math.abs(Math.round((listedTotal - agreedPrice) * 100)) > 0 && <p className="mt-3 text-xs text-amber-800">
          The listed costs plus the fee total {money(listedTotal)}. Check the difference against the agreed customer price.
        </p>}
      </div>
      {invoice && <div className="rounded-lg border p-4">
        <h3 className="mb-3 font-semibold">{invoice.kind}</h3>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-2"><dt>Subtotal</dt><dd>{moneyOnInvoice(invoice.subtotal)}</dd></div>
          <div className="flex justify-between gap-2"><dt>Tax</dt><dd>{moneyOnInvoice(invoice.tax)}</dd></div>
          <div className="flex justify-between gap-2 border-t pt-2 font-semibold"><dt>Invoice total</dt><dd>{moneyOnInvoice(invoice.total)}</dd></div>
        </dl>
        {agency && <p className="mt-3 text-xs text-slate-600">This invoice bills the processing fee. The deal summary includes customer-funded costs.</p>}
        {!agency && hasSchedule && invoiceCurrency === currency && Math.round((invoice.total - summary.total) * 100) !== 0 && <p className="mt-3 text-xs text-amber-800">
          The invoice and payment schedule have different totals. Check the schedule against the intended payment terms before issuing.
        </p>}
      </div>}
    </div>
    {hasSchedule && <details className="rounded-lg border p-3">
      <summary className="cursor-pointer font-medium">Payment dates and amounts</summary>
      <PaymentSchedule lines={schedule} currency={currency} />
    </details>}
  </section>;
}
