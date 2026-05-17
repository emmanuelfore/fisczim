import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface BalanceSheetViewProps {
  companyId: number;
  dateRange: { from: Date; to: Date };
  consolidatedSymbol: string;
  consolidatedRate: number;
}

export function BalanceSheetView({ companyId, dateRange, consolidatedSymbol, consolidatedRate }: BalanceSheetViewProps) {
  const asOfDate = format(dateRange.to, 'yyyy-MM-dd');
  const { data, isLoading } = useQuery<any>({
    queryKey: [`/api/accounting/reports/balance-sheet`, { date: asOfDate }],
  });

  if (isLoading) {
    return <div className="text-center p-12 text-slate-400">Loading Balance Sheet...</div>;
  }

  if (!data) return null;

  const renderSection = (title: string, items: any[], total: number) => (
    <div className="mb-8">
      <h3 className="text-lg font-bold text-slate-800 mb-4 border-b border-slate-200 pb-2">{title}</h3>
      <Table>
        <TableBody>
          {items.map((item: any) => (
            <TableRow key={item.id} className="border-slate-50">
              <TableCell className="w-[120px] font-mono text-xs text-slate-500">{item.code}</TableCell>
              <TableCell className="font-medium text-slate-700">{item.name}</TableCell>
              <TableCell className="text-right font-semibold text-slate-900">
                {consolidatedSymbol}{(Number(item.balance) * consolidatedRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </TableCell>
            </TableRow>
          ))}
          {items.length === 0 && (
            <TableRow><TableCell colSpan={3} className="text-center text-slate-400 py-4">No accounts found</TableCell></TableRow>
          )}
          <TableRow className="bg-slate-50/50">
            <TableCell colSpan={2} className="font-bold text-slate-800 text-right uppercase text-xs tracking-wider">Total {title}</TableCell>
            <TableCell className="text-right font-black text-slate-900">
              {consolidatedSymbol}{(total * consolidatedRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );

  const rawAssets = data.assets || [];
  const rawLiabilities = data.liabilities || [];
  const rawEquity = data.equity || [];
  
  const totalAssets = rawAssets.reduce((sum: number, a: any) => sum + Number(a.balance), 0);
  const totalLiabilities = rawLiabilities.reduce((sum: number, a: any) => sum + Number(a.balance), 0);
  
  // Calculate Net Income and add it to Equity
  const rawRevenue = data.revenue || [];
  const rawExpenses = data.expenses || [];
  const totalRevenue = rawRevenue.reduce((sum: number, a: any) => sum + Number(a.balance), 0);
  const totalExpenses = rawExpenses.reduce((sum: number, a: any) => sum + Number(a.balance), 0);
  const netIncome = Math.abs(totalRevenue) - Math.abs(totalExpenses); // Simplified
  
  const totalEquityBeforeIncome = rawEquity.reduce((sum: number, a: any) => sum + Math.abs(Number(a.balance)), 0);
  const totalEquity = totalEquityBeforeIncome + netIncome;

  return (
    <Card className="rounded-3xl border-slate-200 overflow-hidden shadow-sm">
      <CardHeader className="bg-slate-50 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between p-6">
        <div>
          <CardTitle className="text-2xl font-black text-slate-800">Statement of Financial Position</CardTitle>
          <p className="text-slate-500 font-medium text-sm mt-1">As of {format(dateRange.to, "MMMM do, yyyy")}</p>
        </div>
      </CardHeader>
      <CardContent className="p-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          {/* Left Column: Assets */}
          <div>
            {renderSection("Assets", rawAssets, totalAssets)}
          </div>
          
          {/* Right Column: Liabilities & Equity */}
          <div>
            {renderSection("Liabilities", rawLiabilities, totalLiabilities)}
            
            <div className="mb-8">
              <h3 className="text-lg font-bold text-slate-800 mb-4 border-b border-slate-200 pb-2">Equity</h3>
              <Table>
                <TableBody>
                  {rawEquity.map((item: any) => (
                    <TableRow key={item.id} className="border-slate-50">
                      <TableCell className="w-[120px] font-mono text-xs text-slate-500">{item.code}</TableCell>
                      <TableCell className="font-medium text-slate-700">{item.name}</TableCell>
                      <TableCell className="text-right font-semibold text-slate-900">
                        {consolidatedSymbol}{(Math.abs(Number(item.balance)) * consolidatedRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="border-slate-50">
                    <TableCell className="w-[120px] font-mono text-xs text-slate-500">-</TableCell>
                    <TableCell className="font-medium text-slate-700 italic">Retained Earnings (Net Income)</TableCell>
                    <TableCell className="text-right font-semibold text-emerald-600">
                      {consolidatedSymbol}{(netIncome * consolidatedRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </TableCell>
                  </TableRow>
                  <TableRow className="bg-slate-50/50">
                    <TableCell colSpan={2} className="font-bold text-slate-800 text-right uppercase text-xs tracking-wider">Total Equity</TableCell>
                    <TableCell className="text-right font-black text-slate-900">
                      {consolidatedSymbol}{(totalEquity * consolidatedRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
            
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 mt-6 flex justify-between items-center">
              <span className="font-bold text-slate-800 uppercase text-sm tracking-wider">Total Liabilities & Equity</span>
              <span className="font-black text-slate-900 text-xl">
                {consolidatedSymbol}{((totalLiabilities + totalEquity) * consolidatedRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
