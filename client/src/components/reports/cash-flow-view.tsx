import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@/components/ui/table";
import { ArrowDownLeft, ArrowUpRight, Activity, TrendingUp, TrendingDown, Landmark } from "lucide-react";
import { cn } from "@/lib/utils";

interface CashFlowViewProps {
  companyId: number;
  dateRange: { from: Date; to: Date };
  consolidatedSymbol: string;
  consolidatedRate: number;
  branchId?: number;
}

type CfLine = {
  date: Date;
  description: string;
  accountCode: string;
  accountName: string;
  category: string;
  type: "inflow" | "outflow";
  amount: number;
  referenceType: string | null;
  referenceId: string | null;
};

type CfSection = {
  inflows: CfLine[];
  outflows: CfLine[];
  net: number;
};

type CashFlowReport = {
  operating: CfSection;
  investing: CfSection;
  financing: CfSection;
  netCashFlow: number;
  // Legacy flat fields
  inflows?: CfLine[];
  outflows?: CfLine[];
};

export function CashFlowView({
  companyId,
  dateRange,
  consolidatedSymbol,
  consolidatedRate,
  branchId,
}: CashFlowViewProps) {
  const fromQuery = format(dateRange.from, "yyyy-MM-dd");
  const toQuery = format(dateRange.to, "yyyy-MM-dd");
  const branchParam = branchId ? `&branchId=${branchId}` : "";

  const { data, isLoading } = useQuery<CashFlowReport>({
    queryKey: [
      `/api/accounting/reports/cash-flow`,
      { from: fromQuery, to: toQuery, branchId },
    ],
    queryFn: async () => {
      const res = await fetch(
        `/api/accounting/reports/cash-flow?from=${fromQuery}&to=${toQuery}${branchParam}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to load cash flow report");
      return res.json();
    },
    enabled: !!companyId,
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] bg-white/50 backdrop-blur-sm rounded-[2rem] border border-slate-100">
        <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-slate-500 font-medium animate-pulse">
          Preparing cash flow statement...
        </p>
      </div>
    );
  }

  if (!data) return null;

  const fmt = (val: number) =>
    (Math.abs(val) * consolidatedRate).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const operating = data.operating || { inflows: [], outflows: [], net: 0 };
  const investing = data.investing || { inflows: [], outflows: [], net: 0 };
  const financing = data.financing || { inflows: [], outflows: [], net: 0 };
  const netCashFlow = data.netCashFlow || 0;

  const renderSection = (
    section: CfSection,
    label: string,
    icon: React.ReactNode,
    accentClass: string
  ) => {
    const allLines = [
      ...section.inflows.map((l) => ({ ...l, sign: 1 })),
      ...section.outflows.map((l) => ({ ...l, sign: -1 })),
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Aggregate by description
    const grouped: Record<string, number> = {};
    for (const l of allLines) {
      const key = l.description || (l.sign > 0 ? "Receipts" : "Payments");
      grouped[key] = (grouped[key] || 0) + l.amount * l.sign;
    }

    const netVal = section.net;

    return (
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-3 pb-2 border-b border-slate-100">
          <div className={cn("w-9 h-9 rounded-2xl flex items-center justify-center", accentClass)}>
            {icon}
          </div>
          <h3 className="text-base font-black text-slate-800 uppercase tracking-tight">
            {label}
          </h3>
        </div>
        <Table>
          <TableBody>
            {Object.entries(grouped).map(([desc, amount]) => (
              <TableRow key={desc} className="border-slate-50 hover:bg-slate-50/50">
                <TableCell className="font-medium text-slate-700 pl-8">{desc}</TableCell>
                <TableCell
                  className={cn(
                    "text-right font-semibold",
                    amount >= 0 ? "text-emerald-600" : "text-rose-600"
                  )}
                >
                  {amount < 0 ? "(" : ""}
                  {consolidatedSymbol}
                  {fmt(amount)}
                  {amount < 0 ? ")" : ""}
                </TableCell>
              </TableRow>
            ))}
            {Object.keys(grouped).length === 0 && (
              <TableRow>
                <TableCell colSpan={2} className="text-center text-slate-400 py-4 italic text-sm">
                  No {label.toLowerCase()} cash flows for this period
                </TableCell>
              </TableRow>
            )}
            <TableRow className="bg-slate-50/40 border-t border-slate-100">
              <TableCell className="font-black text-slate-800 text-right text-xs uppercase tracking-wider">
                Net Cash from {label}
              </TableCell>
              <TableCell
                className={cn(
                  "text-right font-black text-base",
                  netVal >= 0 ? "text-emerald-700" : "text-rose-700"
                )}
              >
                {netVal < 0 ? "(" : ""}
                {consolidatedSymbol}
                {fmt(netVal)}
                {netVal < 0 ? ")" : ""}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    );
  };

  return (
    <Card className="rounded-3xl border-slate-200 overflow-hidden shadow-sm">
      <CardHeader className="bg-slate-50 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between p-6">
        <div>
          <CardTitle className="text-2xl font-black text-slate-800">
            Statement of Cash Flows
          </CardTitle>
          <p className="text-slate-500 font-medium mt-1 text-sm">
            IAS 7 format · For the period {format(dateRange.from, "MMM d")} to{" "}
            {format(dateRange.to, "MMM d, yyyy")}
          </p>
        </div>
        <div
          className={cn(
            "mt-3 md:mt-0 px-5 py-3 rounded-2xl border flex flex-col items-end",
            netCashFlow >= 0
              ? "bg-emerald-50 border-emerald-100"
              : "bg-rose-50 border-rose-100"
          )}
        >
          <span className="text-xs font-black uppercase tracking-widest text-slate-500">
            Net Cash Change
          </span>
          <span
            className={cn(
              "text-2xl font-black",
              netCashFlow >= 0 ? "text-emerald-700" : "text-rose-700"
            )}
          >
            {netCashFlow < 0 ? "(" : ""}
            {consolidatedSymbol}
            {fmt(netCashFlow)}
            {netCashFlow < 0 ? ")" : ""}
          </span>
        </div>
      </CardHeader>

      <CardContent className="p-8">
        <div className="max-w-3xl mx-auto space-y-2">
          {renderSection(
            operating,
            "Operating Activities",
            <Activity className="w-4 h-4 text-indigo-600" />,
            "bg-indigo-50"
          )}
          {renderSection(
            investing,
            "Investing Activities",
            <Landmark className="w-4 h-4 text-amber-600" />,
            "bg-amber-50"
          )}
          {renderSection(
            financing,
            "Financing Activities",
            <TrendingUp className="w-4 h-4 text-violet-600" />,
            "bg-violet-50"
          )}

          {/* Grand Total */}
          <div
            className={cn(
              "mt-4 p-5 rounded-2xl border flex justify-between items-center",
              netCashFlow >= 0
                ? "bg-emerald-50 border-emerald-100 text-emerald-900"
                : "bg-rose-50 border-rose-100 text-rose-900"
            )}
          >
            <span className="font-black uppercase tracking-widest text-sm">
              Net Increase (Decrease) in Cash &amp; Cash Equivalents
            </span>
            <span className="text-2xl font-black">
              {netCashFlow < 0 ? "(" : ""}
              {consolidatedSymbol}
              {fmt(netCashFlow)}
              {netCashFlow < 0 ? ")" : ""}
            </span>
          </div>

          {/* Section summary bar */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
            {[
              { label: "Operating", val: operating.net, color: "indigo" },
              { label: "Investing", val: investing.net, color: "amber" },
              { label: "Financing", val: financing.net, color: "violet" },
            ].map(({ label, val, color }) => (
              <div
                key={label}
                className={cn(
                  "rounded-2xl p-4 border",
                  val >= 0
                    ? `bg-${color}-50 border-${color}-100`
                    : "bg-slate-50 border-slate-100"
                )}
              >
                <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-1">
                  {label}
                </p>
                <p
                  className={cn(
                    "text-lg font-black",
                    val >= 0 ? `text-${color}-700` : "text-rose-700"
                  )}
                >
                  {val < 0 ? "(" : ""}
                  {consolidatedSymbol}
                  {fmt(val)}
                  {val < 0 ? ")" : ""}
                </p>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
