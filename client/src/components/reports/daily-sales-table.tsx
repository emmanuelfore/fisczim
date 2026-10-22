import { useState, useMemo } from "react";
import { format, parseISO } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Package, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

interface DailySalesTableProps {
  sales: any[];
  currencies: any[];
  consolidatedSymbol: string;
  consolidatedRate: number;
  currencyMode?: "consolidated" | "original";
}

export function DailySalesTable({
  sales,
  currencies,
  consolidatedSymbol,
  consolidatedRate,
  currencyMode = "consolidated",
}: DailySalesTableProps) {
  const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>({});
  const [expandedInvoices, setExpandedInvoices] = useState<
    Record<number, boolean>
  >({});

  // Group sales by date and cost center. The API returns one row per invoice/cost-center slice.
  const groupedSales = sales.reduce((acc: any, inv: any) => {
    const date = format(new Date(inv.issueDate || inv.createdAt), "yyyy-MM-dd");
    const costCenter = inv.costCenter || "Unassigned";
    const key = `${date}::${costCenter}`;
    if (!acc[key])
      acc[key] = {
        date,
        costCenter,
        invoices: [],
        totals: {} as Record<string, number>,
        discountTotals: {} as Record<string, number>,
        consolidatedTotal: 0,
        consolidatedDiscount: 0,
        paymentTotals: {} as Record<
          string,
          { total: number; byCurrency: Record<string, number> }
        >,
      };

    acc[key].invoices.push(inv);

    const currency = inv.currency || "USD";
    const method = inv.paymentMethod || "CASH";

    // Group by currency
    acc[key].totals[currency] =
      (acc[key].totals[currency] || 0) + Number(inv.total);
    acc[key].discountTotals[currency] =
      (acc[key].discountTotals[currency] || 0) +
      Number(inv.discountAmount || 0);

    // Consolidated totals
    const rate = Number(inv.exchangeRate || 1);
    acc[key].consolidatedTotal += Number(inv.total) / rate;
    acc[key].consolidatedDiscount += Number(inv.discountAmount || 0) / rate;

    // Group by payment method
    const paymentTotals = acc[key].paymentTotals as Record<
      string,
      { total: number; byCurrency: Record<string, number> }
    >;
    if (!paymentTotals[method])
      paymentTotals[method] = { total: 0, byCurrency: {} };

    paymentTotals[method].total += Number(inv.total) / rate;
    paymentTotals[method].byCurrency[currency] =
      (paymentTotals[method].byCurrency[currency] || 0) + Number(inv.total);

    return acc;
  }, {});

  const sortedGroups = Object.keys(groupedSales).sort((a, b) =>
    b.localeCompare(a),
  );

  // Global Aggregate
  const globalSummary = useMemo(() => {
    const methods: Record<
      string,
      { total: number; byCurrency: Record<string, number> }
    > = {};
    let total = 0;
    let discount = 0;

    Object.values(groupedSales).forEach((day: any) => {
      total += day.consolidatedTotal;
      discount += day.consolidatedDiscount;
      Object.entries(day.paymentTotals as Record<string, any>).forEach(
        ([method, data]) => {
          if (!methods[method]) methods[method] = { total: 0, byCurrency: {} };
          methods[method].total += data.total;
          Object.entries(data.byCurrency as Record<string, number>).forEach(
            ([code, amt]) => {
              methods[method].byCurrency[code] =
                (methods[method].byCurrency[code] || 0) + amt;
            },
          );
        },
      );
    });

    return {
      total,
      discount,
      methods: Object.entries(methods).sort((a, b) => b[1].total - a[1].total),
    };
  }, [groupedSales]);

  const toggleDay = (date: string) => {
    setExpandedDays((prev) => ({ ...prev, [date]: !prev[date] }));
  };

  const toggleInvoice = (id: number) => {
    setExpandedInvoices((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="space-y-4">
      {/* Global Summary Card */}
      {sortedGroups.length > 0 && (
        <div className="rounded-[2.5rem] border border-slate-100 bg-white/80 backdrop-blur-md p-8 shadow-sm flex flex-col md:flex-row items-center gap-10 overflow-x-auto scrollbar-hide">
          <div className="flex flex-col shrink-0">
            <span className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">
              Report Summary
            </span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-3xl font-black text-slate-900 font-display">
                {consolidatedSymbol}
                {(globalSummary.total * consolidatedRate).toLocaleString(
                  undefined,
                  { minimumFractionDigits: 2 },
                )}
              </span>
              <span className="text-[10px] font-bold text-emerald-500 bg-emerald-50 px-2 py-0.5 rounded-lg uppercase">
                Net Revenue
              </span>
            </div>
          </div>

          <div className="h-10 w-px bg-slate-200 shrink-0 hidden md:block" />

          <div className="flex items-center gap-6">
            {globalSummary.methods.map(([method, data]) => (
              <div key={method} className="flex flex-col min-w-[140px]">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                  {method}
                </span>
                <span className="text-lg font-black text-slate-900 leading-tight">
                  {currencyMode === "consolidated" ? (
                    `${consolidatedSymbol}${(data.total * consolidatedRate).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                  ) : (
                    <div className="flex flex-col">
                      {Object.entries(
                        data.byCurrency as Record<string, number>,
                      ).map(([code, total]) => {
                        const curr = currencies?.find(
                          (c: any) => c.code === code,
                        );
                        return (
                          <span key={code} className="">
                            {curr?.symbol || code}
                            {total.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                            })}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 overflow-hidden bg-white shadow-sm">
        <Table>
          <TableHeader className="bg-slate-50/50">
            <TableRow className="hover:bg-transparent border-b border-slate-100">
              <TableHead className="w-[50px]"></TableHead>
              <TableHead className="font-bold text-slate-800">
                Date / Ref
              </TableHead>
              <TableHead className="font-bold text-slate-800">
                Customer
              </TableHead>
              <TableHead className="font-bold text-slate-800">
                Cashier
              </TableHead>
              <TableHead className="font-bold text-slate-800">Method</TableHead>
              <TableHead className="text-right font-bold text-slate-800">
                {currencyMode === "consolidated"
                  ? `Discount (${consolidatedSymbol})`
                  : "Discount"}
              </TableHead>
              <TableHead className="text-right font-bold text-slate-800">
                {currencyMode === "consolidated"
                  ? `Total (${consolidatedSymbol})`
                  : "Total"}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedGroups.map((key) => (
              <DaySection
                key={key}
                dayData={groupedSales[key]}
                isExpanded={!!expandedDays[key]}
                onToggle={() => toggleDay(key)}
                expandedInvoices={expandedInvoices}
                onToggleInvoice={toggleInvoice}
                currencies={currencies}
                consolidatedSymbol={consolidatedSymbol}
                consolidatedRate={consolidatedRate}
                currencyMode={currencyMode}
              />
            ))}
            {sortedGroups.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="h-32 text-center text-slate-400 italic"
                >
                  No sales data found for this period
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function DaySection({
  dayData,
  isExpanded,
  onToggle,
  expandedInvoices,
  onToggleInvoice,
  currencies,
  consolidatedSymbol,
  consolidatedRate,
  currencyMode,
}: any) {
  return (
    <>
      <TableRow
        className={cn(
          "cursor-pointer transition-colors group",
          isExpanded ? "bg-indigo-50/30" : "hover:bg-slate-50",
        )}
        onClick={onToggle}
      >
        <TableCell>
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-indigo-500" />
          ) : (
            <ChevronRight className="w-4 h-4 text-slate-400" />
          )}
        </TableCell>
        <TableCell className="font-bold text-slate-900">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-400" />
            {format(parseISO(dayData.date), "EEEE, MMMM dd, yyyy")}
          </div>
        </TableCell>
        <TableCell>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="bg-white/50">
              {dayData.invoices.length} Entries
            </Badge>
            <Badge className="bg-indigo-100 text-indigo-700 hover:bg-indigo-100">
              {dayData.costCenter}
            </Badge>
          </div>
        </TableCell>
        <TableCell></TableCell>
        <TableCell></TableCell>
        <TableCell className="text-right font-bold text-slate-700">
          {currencyMode === "consolidated" ? (
            `${consolidatedSymbol}${(dayData.consolidatedDiscount * consolidatedRate).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
          ) : (
            <div className="flex flex-col items-end gap-0.5">
              {Object.entries(
                dayData.discountTotals as Record<string, number>,
              ).map(([code, total]) => {
                const curr = currencies?.find((c: any) => c.code === code);
                return (
                  <span key={code} className="text-xs">
                    {curr?.symbol || code}
                    {total.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                );
              })}
            </div>
          )}
        </TableCell>
        <TableCell className="text-right font-black text-slate-900">
          {currencyMode === "consolidated" ? (
            `${consolidatedSymbol}${(dayData.consolidatedTotal * consolidatedRate).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
          ) : (
            <div className="flex flex-col items-end gap-0.5">
              {Object.entries(dayData.totals as Record<string, number>).map(
                ([code, total]) => {
                  const curr = currencies?.find((c: any) => c.code === code);
                  return (
                    <span key={code} className="text-xs">
                      {curr?.symbol || code}
                      {total.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                  );
                },
              )}
            </div>
          )}
        </TableCell>
      </TableRow>
      {isExpanded && (
        <TableRow className="bg-slate-50/80 shadow-inner border-b border-slate-100">
          <TableCell colSpan={7} className="px-8 py-4">
            <div className="flex items-center gap-6 overflow-x-auto pb-1 scrollbar-hide">
              <div className="flex flex-col shrink-0">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  Payment Methods
                </span>
                <span className="text-[9px] text-indigo-500 font-bold uppercase">
                  Revenue Split
                </span>
              </div>
              <div className="flex items-center gap-3">
                {Object.entries(dayData.paymentTotals as Record<string, any>)
                  .sort((a, b) => (b[1] as any).total - (a[1] as any).total)
                  .map(([method, data]) => (
                    <div
                      key={method}
                      className="flex flex-col bg-white border border-slate-200 px-4 py-2 rounded-2xl shadow-sm min-w-[120px] transition-transform hover:scale-[1.02]"
                    >
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">
                        {method}
                      </span>
                      <div className="text-xs font-black text-slate-900 font-display">
                        {currencyMode === "consolidated" ? (
                          `${consolidatedSymbol}${(data.total * consolidatedRate).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                        ) : (
                          <div className="flex flex-col gap-0.5">
                            {Object.entries(
                              data.byCurrency as Record<string, number>,
                            ).map(([code, total]) => {
                              const curr = currencies?.find(
                                (c: any) => c.code === code,
                              );
                              return (
                                <span
                                  key={code}
                                  className="block whitespace-nowrap"
                                >
                                  {curr?.symbol || code}
                                  {total.toLocaleString(undefined, {
                                    minimumFractionDigits: 2,
                                  })}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
      {isExpanded &&
        dayData.invoices.map((inv: any) => (
          <InvoiceRow
            key={inv.id}
            inv={inv}
            currencies={currencies}
            isExpanded={!!expandedInvoices[inv.id]}
            onToggle={() => onToggleInvoice(inv.id)}
            consolidatedSymbol={consolidatedSymbol}
            consolidatedRate={consolidatedRate}
            currencyMode={currencyMode}
          />
        ))}
    </>
  );
}

function InvoiceRow({
  inv,
  currencies,
  isExpanded,
  onToggle,
  consolidatedSymbol,
  consolidatedRate,
  currencyMode,
}: any) {
  const currency = currencies?.find(
    (c: any) => c.code === (inv.currency || "USD"),
  );
  const symbol =
    currency?.symbol || (inv.currency === "USD" ? "$" : inv.currency);
  const invoiceId = inv.invoiceId || inv.id;

  return (
    <>
      <TableRow
        className={cn(
          "cursor-pointer transition-colors border-l-4",
          isExpanded
            ? "bg-slate-50 border-l-indigo-500"
            : "hover:bg-slate-50 border-l-transparent",
        )}
        onClick={onToggle}
      >
        <TableCell className="pl-8">
          {isExpanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-indigo-500" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          )}
        </TableCell>
        <TableCell className=" font-medium text-slate-600 whitespace-nowrap">
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-400 font-bold">
              {format(new Date(inv.issueDate || inv.createdAt), "HH:mm")}
            </span>
            <span className="font-bold text-indigo-600">
              {inv.invoiceNumber}
            </span>
            <span className="text-[10px] text-slate-400 font-bold">
              {inv.costCenter || "Unassigned"}
            </span>
          </div>
        </TableCell>
        <TableCell className=" text-slate-700">
          {inv.customerName || "Walk-in Customer"}
        </TableCell>
        <TableCell className=" text-slate-500 font-medium">
          {inv.cashierName || "System"}
        </TableCell>
        <TableCell className="">
          <Badge
            variant="secondary"
            className="bg-slate-100 text-slate-600 text-[10px] font-bold uppercase tracking-wider h-5"
          >
            {inv.paymentMethod || "CASH"}
          </Badge>
        </TableCell>
        <TableCell className="text-right font-medium text-slate-600">
          <div className="flex flex-col items-end">
            {currencyMode === "consolidated" ? (
              <span>
                {consolidatedSymbol}
                {(
                  (Number(inv.discountAmount || 0) /
                    Number(inv.exchangeRate || 1)) *
                  consolidatedRate
                ).toFixed(2)}
              </span>
            ) : (
              <span>
                {symbol}
                {Number(inv.discountAmount || 0).toFixed(2)}
              </span>
            )}
          </div>
        </TableCell>
        <TableCell className="text-right font-bold text-slate-900">
          <div className="flex flex-col items-end">
            {currencyMode === "consolidated" ? (
              <span>
                {consolidatedSymbol}
                {(
                  (Number(inv.total) / Number(inv.exchangeRate || 1)) *
                  consolidatedRate
                ).toFixed(2)}
              </span>
            ) : (
              <span>
                {symbol}
                {Number(inv.total).toFixed(2)}
              </span>
            )}
            {currencyMode === "consolidated" && (
              <span className="text-[10px] text-slate-400 font-medium">
                {symbol}
                {Number(inv.total).toFixed(2)}
              </span>
            )}
          </div>
        </TableCell>
      </TableRow>
      {isExpanded && (
        <TableRow className="bg-slate-50/50 hover:bg-slate-50/50">
          <TableCell colSpan={7} className="p-0">
            <InvoiceItemsList
              invoiceId={invoiceId}
              costCenter={inv.costCenter}
            />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function InvoiceItemsList({
  invoiceId,
  costCenter,
}: {
  invoiceId: number;
  costCenter?: string;
}) {
  const { data: invoice, isLoading } = useQuery({
    queryKey: ["invoice", invoiceId],
    queryFn: async () => {
      const res = await apiFetch(`/api/invoices/${invoiceId}`);
      if (!res.ok) throw new Error("Failed to fetch invoice");
      return await res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="px-16 py-4 flex items-center gap-2 text-slate-400 text-xs">
        <div className="w-3 h-3 border-2 border-slate-300 border-t-transparent rounded-full animate-spin" />
        Loading items...
      </div>
    );
  }

  return (
    <div className="px-16 py-4 bg-white/50">
      <div className="space-y-2 w-full max-w-4xl">
        <div className="grid grid-cols-12 text-[10px] font-black uppercase tracking-widest text-slate-400 pb-1 border-b border-slate-100">
          <div className="col-span-6 flex items-center gap-2">
            <Package className="w-3 h-3" /> Description
          </div>
          <div className="col-span-2 text-center">Qty</div>
          <div className="col-span-2 text-right">Price</div>
          <div className="col-span-2 text-right">Total</div>
        </div>
        {invoice?.items
          ?.filter((item: any) => {
            if (!costCenter) return true;
            const itemCostCenter =
              (item.product?.ownerGroup || "Unassigned").trim() || "Unassigned";
            return itemCostCenter === costCenter;
          })
          ?.map((item: any, idx: number) => (
            <div
              key={idx}
              className="grid grid-cols-12 text-xs py-1 border-b border-slate-50 last:border-0 hover:bg-slate-100/50 rounded px-1 transition-colors"
            >
              <div className="col-span-6 font-medium text-slate-700">
                {item.description || item.product?.name}
              </div>
              <div className="col-span-2 text-center font-bold text-slate-500">
                {item.quantity}
              </div>
              <div className="col-span-2 text-right text-slate-500">
                {Number(item.unitPrice).toFixed(2)}
              </div>
              <div className="col-span-2 text-right font-bold text-slate-900">
                {Number(item.lineTotal).toFixed(2)}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
