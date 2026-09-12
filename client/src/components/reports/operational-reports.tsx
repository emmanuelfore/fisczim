import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { filterRecords } from "@/lib/report-utils";
import { format, parseISO } from "date-fns";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ReportProps {
  companyId: number;
  dateRange: { from: Date; to: Date };
  search: string;
  hideZeroActivity?: boolean;
}

function buildUrl(companyId: number, endpoint: string, dateRange: { from: Date; to: Date }) {
  return `/api/companies/${companyId}/reports/${endpoint}?startDate=${dateRange.from.toISOString()}&endDate=${dateRange.to.toISOString()}`;
}

function Money({ value }: { value: string | number }) {
  return <span className="tabular-nums font-semibold">${Number(value || 0).toFixed(2)}</span>;
}

function SummaryCards({ items }: { items: { label: string; value: string; accent?: string }[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 p-4 border-b border-slate-100 bg-slate-50/60">
      {items.map((item) => (
        <div key={item.label} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{item.label}</p>
          <p className={cn("text-base font-black mt-0.5", item.accent || "text-slate-800")}>
            ${Number(item.value || 0).toFixed(2)}
          </p>
        </div>
      ))}
    </div>
  );
}

function ProductTable({
  title,
  rows,
  columns,
}: {
  title: string;
  rows: Record<string, string | number | null>[];
  columns: { key: string; label: string; align?: "left" | "right" }[];
}) {
  if (!rows.length) {
    return (
      <div className="px-4 py-3 text-xs text-slate-400 italic border-t border-slate-100">
        No {title.toLowerCase()} for this period
      </div>
    );
  }

  return (
    <div className="border-t border-slate-100">
      <div className="px-4 py-2 bg-slate-50 text-[10px] font-bold uppercase tracking-widest text-slate-500">
        {title}
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-100">
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  "px-4 py-2 font-bold text-slate-400",
                  col.align === "right" ? "text-right" : "text-left",
                )}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/80">
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cn(
                    "px-4 py-2 text-slate-700",
                    col.align === "right" ? "text-right tabular-nums font-semibold" : "text-left",
                  )}
                >
                  {row[col.key] ?? "-"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ExpandableDayRow({ day, search }: { day: any; search: string }) {
  const [open, setOpen] = useState(false);

  const salesFiltered = filterRecords(day.salesByProduct || [], search, ["productName", "sku"]);
  const stockFiltered = filterRecords(day.stockByProduct || [], search, ["productName", "sku"]);
  const productionFiltered = filterRecords(day.production || [], search, ["productName"]);

  if (
    search &&
    !day.date.includes(search) &&
    salesFiltered.length === 0 &&
    stockFiltered.length === 0 &&
    productionFiltered.length === 0
  ) {
    return null;
  }

  return (
    <div className="border-b border-slate-100">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 text-left"
      >
        {open ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
        <span className="font-bold text-slate-800 w-28">{format(parseISO(day.date), "dd MMM yyyy")}</span>
        <span className="text-xs text-slate-500 w-24">Open: <Money value={day.openingCash} /></span>
        <span className="text-xs text-slate-500 w-24">Cash: <Money value={day.cashSales} /></span>
        <span className="text-xs text-slate-500 w-24">Credit: <Money value={day.creditSales} /></span>
        <span className="text-xs text-slate-500 w-24">Coll: <Money value={day.collections} /></span>
        <span className="text-xs text-slate-500 w-24">Exp: <Money value={day.expenses} /></span>
        <span className="text-xs text-emerald-600 w-24">Banked: <Money value={day.moneyBanked} /></span>
        <span className="text-xs font-bold text-violet-700 ml-auto">Sales: <Money value={day.salesValue} /></span>
      </button>
      {open && (
        <div className="bg-slate-50/40">
          <ProductTable
            title="Sales by Product"
            rows={salesFiltered}
            columns={[
              { key: "productName", label: "Product" },
              { key: "sku", label: "SKU" },
              { key: "quantity", label: "Qty", align: "right" },
              { key: "revenue", label: "Revenue", align: "right" },
            ]}
          />
          <ProductTable
            title="Production"
            rows={productionFiltered}
            columns={[
              { key: "productName", label: "Product" },
              { key: "quantity", label: "Qty Produced", align: "right" },
            ]}
          />
          <ProductTable
            title="Stock Movement (Opening → Closing)"
            rows={stockFiltered}
            columns={[
              { key: "productName", label: "Product" },
              { key: "openingStock", label: "Opening", align: "right" },
              { key: "production", label: "Prod", align: "right" },
              { key: "purchases", label: "Purch", align: "right" },
              { key: "sales", label: "Sales", align: "right" },
              { key: "closingStock", label: "Closing", align: "right" },
            ]}
          />
        </div>
      )}
    </div>
  );
}

export function DailyOperationalReport({ companyId, dateRange, search, hideZeroActivity }: ReportProps) {
  const { data, isLoading, error } = useQuery<any>({
    queryKey: ["operational-daily", companyId, dateRange.from, dateRange.to],
    queryFn: async () => {
      const res = await apiFetch(buildUrl(companyId, "operational-daily", dateRange));
      if (!res.ok) throw new Error(`Failed to load daily report (${res.status})`);
      return res.json();
    },
    enabled: !!companyId,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="animate-spin text-violet-400" />
      </div>
    );
  }

  if (error) {
    return <div className="p-8 text-center text-red-500 text-sm">Failed to load daily report</div>;
  }

  const totals = data?.totals || {};
  let days = data?.days || [];
  if (hideZeroActivity) {
    days = days.filter((day: any) => {
      return Number(day.cashSales || 0) > 0 ||
             Number(day.creditSales || 0) > 0 ||
             Number(day.collections || 0) > 0 ||
             Number(day.expenses || 0) > 0 ||
             Number(day.moneyBanked || 0) > 0;
    });
  }

  return (
    <div className="flex flex-col h-full">
      <SummaryCards
        items={[
          { label: "Total Sales", value: totals.sales },
          { label: "Cash Sales", value: totals.cashSales },
          { label: "Credit Sales", value: totals.creditSales },
          { label: "Collections", value: totals.collections },
          { label: "Expenses", value: totals.expenses },
          { label: "Money Banked", value: totals.moneyBanked, accent: "text-emerald-700" },
        ]}
      />
      <div className="px-4 py-2 border-b border-slate-100 bg-white sticky top-0 z-10">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
          Daily Breakdown — click a row to expand product &amp; stock details
        </p>
      </div>
      <div className="flex-1 overflow-auto">
        {days.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm">No data for this period</div>
        ) : (
          days.map((day: any) => <ExpandableDayRow key={day.date} day={day} search={search} />)
        )}
      </div>
    </div>
  );
}

function PeriodRow({ period, search, type }: { period: any; search: string; type: "week" | "month" }) {
  const [open, setOpen] = useState(false);
  const stockFiltered = filterRecords(period.stockMovement || [], search, ["productName", "sku"]);
  const productionFiltered = filterRecords(period.production || [], search, ["productName"]);

  if (
    search &&
    !period.periodLabel.toLowerCase().includes(search.toLowerCase()) &&
    stockFiltered.length === 0 &&
    productionFiltered.length === 0
  ) {
    return null;
  }

  return (
    <div className="border-b border-slate-100">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-slate-50 text-left"
      >
        {open ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
        <span className="font-bold text-slate-800 min-w-[140px]">{period.periodLabel}</span>
        <span className="text-xs text-slate-500">Sales: <Money value={period.sales} /></span>
        <span className="text-xs text-slate-500">Collections: <Money value={period.collections} /></span>
        <span className="text-xs text-slate-500">Expenses: <Money value={period.expenses} /></span>
        <span className="text-xs text-emerald-600">Banked: <Money value={period.moneyBanked} /></span>
        <span className="text-[10px] text-slate-400 ml-auto">
          {type === "week" ? "Week" : "Month"} · {period.startDate} → {period.endDate}
        </span>
      </button>
      {open && (
        <div className="bg-slate-50/40">
          <div className="grid grid-cols-1 md:grid-cols-2 md:grid-cols-4 gap-2 px-4 py-3 border-t border-slate-100">
            <div className="text-xs"><span className="text-slate-400">Cash Sales:</span> <Money value={period.cashSales} /></div>
            <div className="text-xs"><span className="text-slate-400">Credit Sales:</span> <Money value={period.creditSales} /></div>
          </div>
          <ProductTable
            title="Production Summary"
            rows={productionFiltered}
            columns={[
              { key: "productName", label: "Product" },
              { key: "quantity", label: "Qty Produced", align: "right" },
            ]}
          />
          <ProductTable
            title="Stock Movement — Opening + Production − Sales = Closing"
            rows={stockFiltered}
            columns={[
              { key: "productName", label: "Product" },
              { key: "openingStock", label: "Opening", align: "right" },
              { key: "production", label: "Production", align: "right" },
              { key: "purchases", label: "Purchases", align: "right" },
              { key: "sales", label: "Sales", align: "right" },
              { key: "closingStock", label: "Closing", align: "right" },
            ]}
          />
        </div>
      )}
    </div>
  );
}

export function WeeklyOperationalReport({ companyId, dateRange, search, hideZeroActivity }: ReportProps) {
  const { data, isLoading, error } = useQuery<any>({
    queryKey: ["operational-weekly", companyId, dateRange.from, dateRange.to],
    queryFn: async () => {
      const res = await apiFetch(buildUrl(companyId, "operational-weekly", dateRange));
      if (!res.ok) throw new Error(`Failed to load weekly report (${res.status})`);
      return res.json();
    },
    enabled: !!companyId,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="animate-spin text-violet-400" />
      </div>
    );
  }

  if (error) {
    return <div className="p-8 text-center text-red-500 text-sm">Failed to load weekly report</div>;
  }

  const totals = data?.totals || {};
  let weeks = data?.weeks || [];
  if (hideZeroActivity) {
    weeks = weeks.filter((week: any) => {
      return Number(week.sales || 0) > 0 ||
             Number(week.collections || 0) > 0 ||
             Number(week.expenses || 0) > 0 ||
             Number(week.moneyBanked || 0) > 0;
    });
  }

  return (
    <div className="flex flex-col h-full">
      <SummaryCards
        items={[
          { label: "Total Sales", value: totals.sales },
          { label: "Cash Sales", value: totals.cashSales },
          { label: "Credit Sales", value: totals.creditSales },
          { label: "Collections", value: totals.collections },
          { label: "Expenses", value: totals.expenses },
          { label: "Money Banked", value: totals.moneyBanked, accent: "text-emerald-700" },
        ]}
      />
      <div className="px-4 py-2 border-b border-slate-100 bg-white">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
          Weekly Rollup — auto-aggregated from daily data
        </p>
      </div>
      <div className="flex-1 overflow-auto">
        {weeks.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm">No data for this period</div>
        ) : (
          weeks.map((week: any) => (
            <PeriodRow key={week.periodKey} period={week} search={search} type="week" />
          ))
        )}
      </div>
    </div>
  );
}

export function MonthlyOperationalReport({ companyId, dateRange, search, hideZeroActivity }: ReportProps) {
  const { data, isLoading, error } = useQuery<any>({
    queryKey: ["operational-monthly", companyId, dateRange.from, dateRange.to],
    queryFn: async () => {
      const res = await apiFetch(buildUrl(companyId, "operational-monthly", dateRange));
      if (!res.ok) throw new Error(`Failed to load monthly report (${res.status})`);
      return res.json();
    },
    enabled: !!companyId,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="animate-spin text-violet-400" />
      </div>
    );
  }

  if (error) {
    return <div className="p-8 text-center text-red-500 text-sm">Failed to load monthly report</div>;
  }

  const totals = data?.totals || {};
  let months = data?.months || [];
  if (hideZeroActivity) {
    months = months.filter((month: any) => {
      return Number(month.sales || 0) > 0 ||
             Number(month.collections || 0) > 0 ||
             Number(month.expenses || 0) > 0 ||
             Number(month.moneyBanked || 0) > 0;
    });
  }

  return (
    <div className="flex flex-col h-full">
      <SummaryCards
        items={[
          { label: "Total Sales", value: totals.sales },
          { label: "Cash Sales", value: totals.cashSales },
          { label: "Credit Sales", value: totals.creditSales },
          { label: "Collections", value: totals.collections },
          { label: "Expenses", value: totals.expenses },
          { label: "Money Banked", value: totals.moneyBanked, accent: "text-emerald-700" },
        ]}
      />
      <div className="px-4 py-2 border-b border-slate-100 bg-white">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
          Monthly Rollup — auto-aggregated from daily &amp; weekly data
        </p>
      </div>
      <div className="flex-1 overflow-auto">
        {months.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm">No data for this period</div>
        ) : (
          months.map((month: any) => (
            <PeriodRow key={month.periodKey} period={month} search={search} type="month" />
          ))
        )}
      </div>
    </div>
  );
}

export function StockMovementReport({ companyId, dateRange, search, hideZeroActivity }: ReportProps) {
  const { data, isLoading, error } = useQuery<any>({
    queryKey: ["stock-movement", companyId, dateRange.from, dateRange.to],
    queryFn: async () => {
      const res = await apiFetch(buildUrl(companyId, "stock-movement", dateRange));
      if (!res.ok) throw new Error(`Failed to load stock movement (${res.status})`);
      return res.json();
    },
    enabled: !!companyId,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="animate-spin text-violet-400" />
      </div>
    );
  }

  if (error) {
    return <div className="p-8 text-center text-red-500 text-sm">Failed to load stock movement report</div>;
  }

  let products = filterRecords(data?.products || [], search, ["productName", "sku"]);
  if (hideZeroActivity) {
    products = products.filter((row: any) => {
      return Number(row.openingStock || 0) !== 0 ||
             Number(row.production || 0) !== 0 ||
             Number(row.purchases || 0) !== 0 ||
             Number(row.sales || 0) !== 0 ||
             Number(row.adjustments || 0) !== 0 ||
             Number(row.closingStock || 0) !== 0;
    });
  }
  const totals = data?.totals || {};

  return (
    <div className="flex flex-col h-full">
      <SummaryCards
        items={[
          { label: "Opening Stock", value: totals.openingStock },
          { label: "Production", value: totals.production },
          { label: "Purchases", value: totals.purchases },
          { label: "Sales", value: totals.sales },
          { label: "Adjustments", value: totals.adjustments },
          { label: "Closing Stock", value: totals.closingStock, accent: "text-violet-700" },
        ]}
      />
      <div className="px-4 py-2 border-b border-slate-100 bg-white">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
          Formula: Opening + Production + Purchases − Sales + Adjustments = Closing
        </p>
        <p className="text-[10px] text-slate-400 mt-0.5">
          Period: {data?.periodStart} → {data?.periodEnd}
        </p>
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-white border-b border-slate-100 z-10">
            <tr>
              {["Product", "SKU", "Opening", "Production", "Purchases", "Sales", "Adjustments", "Closing"].map((h) => (
                <th
                  key={h}
                  className={cn(
                    "px-4 py-3 font-bold text-slate-400 uppercase tracking-widest text-[10px]",
                    h !== "Product" && h !== "SKU" ? "text-right" : "text-left",
                  )}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {products.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-slate-400 italic">
                  No stock movement in this period
                </td>
              </tr>
            ) : (
              products.map((row: any) => (
                <tr key={row.productId} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-4 py-2 font-semibold text-slate-800">{row.productName}</td>
                  <td className="px-4 py-2 text-slate-500">{row.sku || "-"}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{row.openingStock}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-emerald-600">{row.production}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{row.purchases}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-rose-600">{row.sales}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{row.adjustments}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-bold text-violet-700">{row.closingStock}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ProductProfitMarginsReport(props: ReportProps) {
  const { data = [], isLoading } = useQuery<any[]>({
    queryKey: ["profit-margins-products", props.companyId, props.dateRange.from, props.dateRange.to],
    queryFn: async () => {
      const res = await apiFetch(buildUrl(props.companyId, "profit-margins", props.dateRange));
      if (!res.ok) throw new Error("Failed to load profit margins");
      const rows = await res.json();
      return rows.filter((r: any) => r.dimensionType === "Item");
    },
    enabled: !!props.companyId,
  });

  let filtered = filterRecords(data, props.search, ["dimension"]);
  if (props.hideZeroActivity) {
    filtered = filtered.filter((row: any) => {
      return Number(row.quantitySold || 0) > 0 ||
             Number(row.revenue || 0) > 0 ||
             Number(row.grossProfit || 0) > 0;
    });
  }

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="animate-spin text-violet-400" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <div className="px-4 py-2 border-b border-slate-100 bg-slate-50">
        <span className="text-xs font-bold uppercase tracking-widest text-slate-500">
          Profit Margins per Product
        </span>
      </div>
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-white border-b border-slate-100">
          <tr>
            {["Product", "Qty Sold", "Revenue", "COGS", "Profit", "Margin %"].map((h, i) => (
              <th
                key={h}
                className={cn(
                  "px-4 py-3 font-bold text-slate-400 uppercase tracking-widest text-[10px]",
                  i > 0 ? "text-right" : "text-left",
                )}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-4 py-12 text-center text-slate-400 italic">
                No product margin data for this period
              </td>
            </tr>
          ) : (
            filtered.map((row, i) => (
              <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                <td className="px-4 py-2 font-semibold text-slate-800">{row.dimension}</td>
                <td className="px-4 py-2 text-right tabular-nums">{row.quantitySold}</td>
                <td className="px-4 py-2 text-right tabular-nums">${row.revenue}</td>
                <td className="px-4 py-2 text-right tabular-nums text-rose-600">${row.cogs}</td>
                <td className="px-4 py-2 text-right tabular-nums text-emerald-700">${row.grossProfit}</td>
                <td className="px-4 py-2 text-right tabular-nums font-bold">{row.marginPercent}%</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
