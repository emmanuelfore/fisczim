import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";

interface CashFlowViewProps {
  companyId: number;
  dateRange: { from: Date; to: Date };
  consolidatedSymbol: string;
  consolidatedRate: number;
}

export function CashFlowView({ companyId, dateRange, consolidatedSymbol, consolidatedRate }: CashFlowViewProps) {
  const fromQuery = format(dateRange.from, 'yyyy-MM-dd');
  const toQuery = format(dateRange.to, 'yyyy-MM-dd');
  
  const { data, isLoading } = useQuery<any>({
    queryKey: [`/api/accounting/reports/cash-flow`, { from: fromQuery, to: toQuery }],
  });

  if (isLoading) {
    return <div className="text-center p-12 text-slate-400">Loading Cash Flow Statement...</div>;
  }

  if (!data) return null;

  const inflows = data.inflows || [];
  const outflows = data.outflows || [];
  const netCashFlow = data.netCashFlow || 0;

  const groupedInflows = inflows.reduce((acc: any, curr: any) => {
    const desc = curr.description || "Other Receipts";
    acc[desc] = (acc[desc] || 0) + Number(curr.amount);
    return acc;
  }, {});
  
  const groupedOutflows = outflows.reduce((acc: any, curr: any) => {
    const desc = curr.description || "Other Payments";
    acc[desc] = (acc[desc] || 0) + Number(curr.amount);
    return acc;
  }, {});

  return (
    <Card className="rounded-3xl border-slate-200 overflow-hidden shadow-sm">
      <CardHeader className="bg-slate-50 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between p-6">
        <div>
          <CardTitle className="text-2xl font-black text-slate-800">Statement of Cash Flows</CardTitle>
          <p className="text-slate-500 font-medium text-sm mt-1">For the period {format(dateRange.from, "MMM d")} to {format(dateRange.to, "MMM d, yyyy")}</p>
        </div>
      </CardHeader>
      <CardContent className="p-8">
        <div className="max-w-4xl mx-auto space-y-8">
          
          <div>
            <div className="flex items-center gap-2 mb-4 border-b border-slate-200 pb-2">
              <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
                <ArrowDownLeft className="text-emerald-600 w-4 h-4" />
              </div>
              <h3 className="text-lg font-bold text-slate-800">Cash Inflows</h3>
            </div>
            <Table>
              <TableBody>
                {Object.entries(groupedInflows).map(([desc, amount]: [string, any]) => (
                  <TableRow key={desc} className="border-slate-50 hover:bg-slate-50/50">
                    <TableCell className="font-medium text-slate-700">{desc}</TableCell>
                    <TableCell className="text-right font-semibold text-emerald-600">
                      {consolidatedSymbol}{(amount * consolidatedRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </TableCell>
                  </TableRow>
                ))}
                {Object.keys(groupedInflows).length === 0 && (
                  <TableRow><TableCell colSpan={2} className="text-center text-slate-400 py-4">No cash inflows</TableCell></TableRow>
                )}
                <TableRow className="bg-slate-50/30">
                  <TableCell className="font-bold text-slate-800 text-right uppercase text-xs tracking-wider">Total Inflows</TableCell>
                  <TableCell className="text-right font-black text-emerald-700">
                    {consolidatedSymbol}{(inflows.reduce((s: number, i: any) => s + Number(i.amount), 0) * consolidatedRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-4 border-b border-slate-200 pb-2">
              <div className="w-8 h-8 rounded-full bg-rose-100 flex items-center justify-center">
                <ArrowUpRight className="text-rose-600 w-4 h-4" />
              </div>
              <h3 className="text-lg font-bold text-slate-800">Cash Outflows</h3>
            </div>
            <Table>
              <TableBody>
                {Object.entries(groupedOutflows).map(([desc, amount]: [string, any]) => (
                  <TableRow key={desc} className="border-slate-50 hover:bg-slate-50/50">
                    <TableCell className="font-medium text-slate-700">{desc}</TableCell>
                    <TableCell className="text-right font-semibold text-rose-600">
                      ({consolidatedSymbol}{(amount * consolidatedRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                    </TableCell>
                  </TableRow>
                ))}
                {Object.keys(groupedOutflows).length === 0 && (
                  <TableRow><TableCell colSpan={2} className="text-center text-slate-400 py-4">No cash outflows</TableCell></TableRow>
                )}
                <TableRow className="bg-slate-50/30">
                  <TableCell className="font-bold text-slate-800 text-right uppercase text-xs tracking-wider">Total Outflows</TableCell>
                  <TableCell className="text-right font-black text-rose-700">
                    ({consolidatedSymbol}{(outflows.reduce((s: number, o: any) => s + Number(o.amount), 0) * consolidatedRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>

          <div className={`p-6 rounded-2xl border ${netCashFlow >= 0 ? "bg-emerald-50 border-emerald-100 text-emerald-900" : "bg-rose-50 border-rose-100 text-rose-900"} flex justify-between items-center`}>
            <span className="font-bold uppercase tracking-widest text-sm">Net Increase (Decrease) in Cash</span>
            <span className="text-2xl font-black">
              {netCashFlow < 0 ? "(" : ""}{consolidatedSymbol}{(Math.abs(netCashFlow) * consolidatedRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{netCashFlow < 0 ? ")" : ""}
            </span>
          </div>
          
        </div>
      </CardContent>
    </Card>
  );
}
