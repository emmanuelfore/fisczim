import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";

interface BalanceSheetViewProps {
  companyId: number;
  dateRange: { from: Date; to: Date };
  consolidatedSymbol: string;
  consolidatedRate: number;
  branchId?: number;
}

export function BalanceSheetView({
  companyId,
  dateRange,
  consolidatedSymbol,
  consolidatedRate,
  branchId,
}: BalanceSheetViewProps) {
  const asOfDate = format(dateRange.to, "yyyy-MM-dd");
  const branchParam = branchId ? `&branchId=${branchId}` : "";
  const { data, isLoading } = useQuery<any>({
    queryKey: [`/api/accounting/reports/balance-sheet`, { date: asOfDate, branchId }],
    queryFn: async () => {
      const res = await fetch(`/api/accounting/reports/balance-sheet?date=${asOfDate}${branchParam}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load balance sheet");
      return res.json();
    },
    enabled: !!companyId,
  });

  if (isLoading) {
    return (
      <div className="text-center p-12 text-slate-400">
        Loading Balance Sheet...
      </div>
    );
  }

  if (!data) return null;

  const renderSection = (title: string, items: any[], total: number) => (
    <div className="mb-8">
      <h3 className="text-lg font-bold text-slate-800 mb-4 border-b border-slate-200 pb-2">
        {title}
      </h3>
      <Table>
        <TableBody>
          {items.map((item: any) => (
            <TableRow key={item.id} className="border-slate-50">
              <TableCell className="w-[120px] font-mono text-xs text-slate-500">
                {item.code}
              </TableCell>
              <TableCell className="font-medium text-slate-700">
                {item.name}
              </TableCell>
              <TableCell className="text-right font-semibold text-slate-900">
                {consolidatedSymbol}
                {(Number(item.balance) * consolidatedRate).toLocaleString(
                  undefined,
                  { minimumFractionDigits: 2, maximumFractionDigits: 2 },
                )}
              </TableCell>
            </TableRow>
          ))}
          {items.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={3}
                className="text-center text-slate-400 py-4"
              >
                No accounts found
              </TableCell>
            </TableRow>
          )}
          <TableRow className="bg-slate-50/50">
            <TableCell
              colSpan={2}
              className="font-bold text-slate-800 text-right uppercase text-xs tracking-wider"
            >
              Total {title}
            </TableCell>
            <TableCell className="text-right font-black text-slate-900">
              {consolidatedSymbol}
              {(total * consolidatedRate).toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );

  const rawAssets = data.assets || [];
  const rawLiabilities = data.liabilities || [];
  const rawEquity = data.equity || [];

  const totalAssets = Number(
    data.totals?.assets ||
      rawAssets.reduce((sum: number, a: any) => sum + Number(a.balance), 0),
  );
  const totalLiabilities = Number(
    data.totals?.liabilities ||
      rawLiabilities.reduce(
        (sum: number, a: any) => sum + Number(a.balance),
        0,
      ),
  );
  const totalEquityBeforeIncome = Number(
    data.totals?.equity ||
      rawEquity.reduce((sum: number, a: any) => sum + Number(a.balance), 0),
  );
  const currentYearEarnings = Number(data.currentYearEarnings || 0);
  const totalEquity = totalEquityBeforeIncome + currentYearEarnings;
  const totalLiabilitiesAndEquity = Number(
    data.totals?.liabilitiesAndEquity || totalLiabilities + totalEquity,
  );
  const equationDifference = Number(
    data.totals?.equationDifference || totalAssets - totalLiabilitiesAndEquity,
  );

  return (
    <Card className="rounded-3xl border-slate-200 overflow-hidden shadow-sm">
      <CardHeader className="bg-slate-50 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between p-6">
        <div>
          <CardTitle className="text-2xl font-black text-slate-800">
            Statement of Financial Position
          </CardTitle>
          <p className="text-slate-500 font-medium  mt-1">
            As of {format(dateRange.to, "MMMM do, yyyy")}
          </p>
        </div>
      </CardHeader>
      <CardContent className="p-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          {/* Left Column: Assets */}
          <div>{renderSection("Assets", rawAssets, totalAssets)}</div>

          {/* Right Column: Liabilities & Equity */}
          <div>
            {renderSection("Liabilities", rawLiabilities, totalLiabilities)}

            <div className="mb-8">
              <h3 className="text-lg font-bold text-slate-800 mb-4 border-b border-slate-200 pb-2">
                Equity
              </h3>
              <Table>
                <TableBody>
                  {rawEquity.map((item: any) => (
                    <TableRow key={item.id} className="border-slate-50">
                      <TableCell className="w-[120px] font-mono text-xs text-slate-500">
                        {item.code}
                      </TableCell>
                      <TableCell className="font-medium text-slate-700">
                        {item.name}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-slate-900">
                        {consolidatedSymbol}
                        {(
                          Number(item.balance) * consolidatedRate
                        ).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="border-slate-50">
                    <TableCell className="w-[120px] font-mono text-xs text-slate-500">
                      -
                    </TableCell>
                    <TableCell className="font-medium text-slate-700 italic">
                      Current Year Earnings
                    </TableCell>
                    <TableCell
                      className={`text-right font-semibold ${currentYearEarnings >= 0 ? "text-emerald-600" : "text-rose-600"}`}
                    >
                      {consolidatedSymbol}
                      {(currentYearEarnings * consolidatedRate).toLocaleString(
                        undefined,
                        { minimumFractionDigits: 2, maximumFractionDigits: 2 },
                      )}
                    </TableCell>
                  </TableRow>
                  <TableRow className="bg-slate-50/50">
                    <TableCell
                      colSpan={2}
                      className="font-bold text-slate-800 text-right uppercase text-xs tracking-wider"
                    >
                      Total Equity
                    </TableCell>
                    <TableCell className="text-right font-black text-slate-900">
                      {consolidatedSymbol}
                      {(totalEquity * consolidatedRate).toLocaleString(
                        undefined,
                        { minimumFractionDigits: 2, maximumFractionDigits: 2 },
                      )}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 mt-6 flex justify-between items-center">
              <span className="font-bold text-slate-800 uppercase  tracking-wider">
                Total Liabilities & Equity
              </span>
              <span className="font-black text-slate-900 text-xl">
                {consolidatedSymbol}
                {(totalLiabilitiesAndEquity * consolidatedRate).toLocaleString(
                  undefined,
                  { minimumFractionDigits: 2, maximumFractionDigits: 2 },
                )}
              </span>
            </div>
            {Math.abs(equationDifference) >= 0.01 && (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3  font-medium text-amber-800">
                Balance sheet difference: {consolidatedSymbol}
                {(equationDifference * consolidatedRate).toLocaleString(
                  undefined,
                  { minimumFractionDigits: 2, maximumFractionDigits: 2 },
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
