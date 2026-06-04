import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  TrendingUp,
  DollarSign,
  PieChart as PieChartIcon,
  Activity,
  ShoppingBag,
  Wallet,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";
import {
  Table as TableUI,
  TableBody,
  TableCell,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { SummaryStatCard } from "@/components/ui/summary-stat-card";

const COLORS = [
  "#6366f1",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
];

interface ProfitAndLossViewProps {
  companyId: number;
  dateRange: { from: Date; to: Date };
  consolidatedSymbol: string;
  consolidatedRate: number;
}

type ProfitAndLossLine = {
  accountId: number;
  code: string;
  name: string;
  type: "REVENUE" | "EXPENSE";
  category: string;
  amount: number;
};

type ProfitAndLossReport = {
  sections: {
    revenue: ProfitAndLossLine[];
    costOfSales: ProfitAndLossLine[];
    otherIncome: ProfitAndLossLine[];
    operatingExpenses: ProfitAndLossLine[];
    financeCosts: ProfitAndLossLine[];
    otherExpenses: ProfitAndLossLine[];
  };
  totals: {
    revenue: number;
    costOfSales: number;
    grossProfit: number;
    otherIncome: number;
    operatingExpenses: number;
    financeCosts: number;
    otherExpenses: number;
    netProfit: number;
  };
};

export function ProfitAndLossView({
  companyId,
  dateRange,
  consolidatedSymbol,
  consolidatedRate,
}: ProfitAndLossViewProps) {
  const from = format(dateRange.from, "yyyy-MM-dd");
  const to = format(dateRange.to, "yyyy-MM-dd");

  const { data: report, isLoading } = useQuery<ProfitAndLossReport>({
    queryKey: ["/api/accounting/reports/profit-and-loss", { from, to }],
    enabled: !!companyId,
    queryFn: async () => {
      const res = await apiFetch(
        `/api/accounting/reports/profit-and-loss?from=${from}&to=${to}`,
      );
      if (!res.ok) throw new Error("Failed to load profit and loss report");
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] bg-white/50 backdrop-blur-sm rounded-[2rem] border border-slate-100">
        <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-slate-500 font-medium animate-pulse">
          Calculating financial data...
        </p>
      </div>
    );
  }

  const totals = report?.totals || {
    revenue: 0,
    costOfSales: 0,
    grossProfit: 0,
    otherIncome: 0,
    operatingExpenses: 0,
    financeCosts: 0,
    otherExpenses: 0,
    netProfit: 0,
  };
  const sections = report?.sections || {
    revenue: [],
    costOfSales: [],
    otherIncome: [],
    operatingExpenses: [],
    financeCosts: [],
    otherExpenses: [],
  };
  const expenseBreakdown = [
    { category: "Cost of Sales", amount: totals.costOfSales },
    { category: "Operating Expenses", amount: totals.operatingExpenses },
    { category: "Finance Costs", amount: totals.financeCosts },
    { category: "Other Expenses", amount: totals.otherExpenses },
  ].filter((item) => item.amount > 0);
  const totalExpenses =
    totals.costOfSales +
    totals.operatingExpenses +
    totals.financeCosts +
    totals.otherExpenses;

  const formatValue = (val: number) => {
    return (val * consolidatedRate).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };
  const renderLines = (items: ProfitAndLossLine[], emptyLabel: string) => (
    <>
      {items.map((item) => (
        <TableRow key={item.accountId} className="border-slate-50">
          <TableCell className="w-[110px] font-mono text-xs text-slate-500">
            {item.code}
          </TableCell>
          <TableCell className="font-semibold text-slate-700">
            {item.name}
          </TableCell>
          <TableCell className="text-right font-bold text-slate-900">
            {consolidatedSymbol}
            {formatValue(item.amount)}
          </TableCell>
        </TableRow>
      ))}
      {items.length === 0 && (
        <TableRow>
          <TableCell colSpan={3} className="py-4 text-center  text-slate-400">
            {emptyLabel}
          </TableCell>
        </TableRow>
      )}
    </>
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <SummaryStatCard
          label="Gross Revenue"
          value={`${consolidatedSymbol}${formatValue(totals.revenue)}`}
          icon={TrendingUp}
          tone="violet"
        />
        <SummaryStatCard
          label="Cost of Sales"
          value={`${consolidatedSymbol}${formatValue(totals.costOfSales)}`}
          icon={ShoppingBag}
          tone="rose"
        />
        <SummaryStatCard
          label="Gross Profit"
          value={`${consolidatedSymbol}${formatValue(totals.grossProfit)}`}
          icon={Activity}
          tone="blue"
          valueClassName={cn(
            "text-2xl font-black",
            totals.grossProfit >= 0 ? "text-emerald-600" : "text-rose-600",
          )}
        />
        <SummaryStatCard
          label="Operating Expenses"
          value={`${consolidatedSymbol}${formatValue(totals.operatingExpenses + totals.financeCosts + totals.otherExpenses)}`}
          icon={Wallet}
          tone="slate"
        />
        <SummaryStatCard
          label="Net Profit"
          value={`${consolidatedSymbol}${formatValue(totals.netProfit)}`}
          icon={DollarSign}
          tone={totals.netProfit >= 0 ? "emerald" : "rose"}
          valueClassName={cn(
            "text-2xl font-black",
            totals.netProfit >= 0 ? "text-emerald-600" : "text-rose-600",
          )}
        />
      </div>

      <Card className="rounded-[2rem] border border-slate-100 bg-white shadow-xl">
        <CardHeader className="border-b border-slate-50 p-8">
          <CardTitle className="text-xl font-black uppercase tracking-tight text-slate-900">
            Statement of Profit or Loss
          </CardTitle>
          <CardDescription className="font-medium text-slate-400">
            GL-backed report for {format(dateRange.from, "MMM d")} to{" "}
            {format(dateRange.to, "MMM d, yyyy")}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <TableUI>
            <TableBody>
              <TableRow className="bg-slate-50/70 hover:bg-slate-50/70">
                <TableCell
                  colSpan={3}
                  className="px-8 py-3 text-[11px] font-black uppercase tracking-widest text-slate-700"
                >
                  Revenue
                </TableCell>
              </TableRow>
              {renderLines(
                sections.revenue,
                "No revenue posted for this period",
              )}
              <TableRow className="bg-slate-50/40">
                <TableCell
                  colSpan={2}
                  className="text-right text-xs font-black uppercase tracking-wider text-slate-700"
                >
                  Total Revenue
                </TableCell>
                <TableCell className="text-right font-black text-slate-900">
                  {consolidatedSymbol}
                  {formatValue(totals.revenue)}
                </TableCell>
              </TableRow>
              <TableRow className="bg-slate-50/70 hover:bg-slate-50/70">
                <TableCell
                  colSpan={3}
                  className="px-8 py-3 text-[11px] font-black uppercase tracking-widest text-slate-700"
                >
                  Cost of Sales
                </TableCell>
              </TableRow>
              {renderLines(
                sections.costOfSales,
                "No cost of sales posted for this period",
              )}
              <TableRow className="bg-slate-900 hover:bg-slate-900 text-white">
                <TableCell
                  colSpan={2}
                  className="text-right text-xs font-black uppercase tracking-wider text-slate-300"
                >
                  Gross Profit
                </TableCell>
                <TableCell className="text-right text-lg font-black">
                  {consolidatedSymbol}
                  {formatValue(totals.grossProfit)}
                </TableCell>
              </TableRow>
              <TableRow className="bg-slate-50/70 hover:bg-slate-50/70">
                <TableCell
                  colSpan={3}
                  className="px-8 py-3 text-[11px] font-black uppercase tracking-widest text-slate-700"
                >
                  Other Income
                </TableCell>
              </TableRow>
              {renderLines(
                sections.otherIncome,
                "No other income posted for this period",
              )}
              <TableRow className="bg-slate-50/70 hover:bg-slate-50/70">
                <TableCell
                  colSpan={3}
                  className="px-8 py-3 text-[11px] font-black uppercase tracking-widest text-slate-700"
                >
                  Operating Expenses
                </TableCell>
              </TableRow>
              {renderLines(
                sections.operatingExpenses,
                "No operating expenses posted for this period",
              )}
              {sections.financeCosts.length > 0 &&
                renderLines(sections.financeCosts, "")}
              {sections.otherExpenses.length > 0 &&
                renderLines(sections.otherExpenses, "")}
              <TableRow
                className={cn(
                  "hover:bg-transparent",
                  totals.netProfit >= 0
                    ? "bg-emerald-50 text-emerald-900"
                    : "bg-rose-50 text-rose-900",
                )}
              >
                <TableCell
                  colSpan={2}
                  className="text-right  font-black uppercase tracking-wider"
                >
                  Net Profit / Loss
                </TableCell>
                <TableCell className="text-right text-xl font-black">
                  {consolidatedSymbol}
                  {formatValue(totals.netProfit)}
                </TableCell>
              </TableRow>
            </TableBody>
          </TableUI>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Expense Chart */}
        <Card className="border-none shadow-xl bg-white rounded-[2rem] overflow-hidden border border-slate-100">
          <CardHeader className="p-8 pb-0">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl font-black text-slate-900 font-display uppercase tracking-tight">
                  Expense Distribution
                </CardTitle>
                <CardDescription className="text-slate-400 font-medium tracking-tight">
                  Top category spending
                </CardDescription>
              </div>
              <div className="p-3 bg-indigo-50 rounded-2xl">
                <PieChartIcon className="w-5 h-5 text-indigo-600" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="h-[350px] p-6">
            {expenseBreakdown.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={expenseBreakdown}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={8}
                    dataKey="amount"
                    nameKey="category"
                    stroke="none"
                  >
                    {expenseBreakdown.map((entry: any, index: number) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={COLORS[index % COLORS.length]}
                        className="hover:opacity-80 transition-opacity"
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      borderRadius: "20px",
                      border: "none",
                      boxShadow: "0 20px 25px -5px rgb(0 0 0 / 0.1)",
                      padding: "12px 16px",
                    }}
                    formatter={(value: number) => [
                      `${consolidatedSymbol}${formatValue(value)}`,
                      "Amount",
                    ]}
                  />
                  <Legend
                    iconType="circle"
                    wrapperStyle={{ paddingTop: "20px" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 italic ">
                <Wallet className="w-8 h-8 mb-2 opacity-20" />
                No expense data available
              </div>
            )}
          </CardContent>
        </Card>

        {/* Expense Detailed Table */}
        <Card className="border-none shadow-xl bg-white rounded-[2rem] overflow-hidden border border-slate-100">
          <CardHeader className="p-8 border-b border-slate-50 bg-slate-50/30">
            <CardTitle className="text-xl font-black text-slate-900 font-display uppercase tracking-tight">
              Detailed Breakdown
            </CardTitle>
            <CardDescription className="text-slate-400 font-medium tracking-tight">
              Metric categorization
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50/50 text-[10px] uppercase font-black tracking-widest text-slate-500 border-b border-slate-100">
                  <th className="p-6 text-left">Category</th>
                  <th className="p-6 text-right">Amount</th>
                  <th className="p-6 text-right">Contribution</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {expenseBreakdown.map((item: any, idx: number) => (
                  <tr
                    key={idx}
                    className="hover:bg-slate-50 transition-colors duration-200 group"
                  >
                    <td className="p-6">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{
                            backgroundColor: COLORS[idx % COLORS.length],
                          }}
                        />
                        <span className="font-bold text-slate-700">
                          {item.category}
                        </span>
                      </div>
                    </td>
                    <td className="p-6 text-right font-black text-slate-900">
                      {consolidatedSymbol}
                      {formatValue(item.amount)}
                    </td>
                    <td className="p-6 text-right font-medium text-slate-400">
                      <Badge
                        variant="outline"
                        className="font-black text-[10px] bg-slate-50 group-hover:bg-white"
                      >
                        {totalExpenses > 0
                          ? ((item.amount / totalExpenses) * 100).toFixed(1)
                          : "0.0"}
                        %
                      </Badge>
                    </td>
                  </tr>
                ))}
                {expenseBreakdown.length === 0 && (
                  <tr>
                    <td
                      colSpan={3}
                      className="p-16 text-center text-slate-400 italic "
                    >
                      No expenses recorded for this period
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
