import { Layout } from "@/components/layout";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { History, Briefcase, FileText, ArrowRight } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";
import { Link } from "wouter";

export default function DepreciationRecordsPage() {
  const { data: runs, isLoading } = useQuery<any[]>({
    queryKey: ["/api/accounting/fixed-assets/depreciation-runs"],
  });

  return (
    <Layout hideHeaderTitle>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600">
              <History className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold font-display text-slate-800">
                Depreciation Records
              </h1>
              <p className="text-slate-500">
                Review automatic and manual asset depreciation history
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6">
          <Card className="rounded-2xl border-slate-200">
            <CardHeader className="border-b border-slate-100 bg-slate-50/50">
              <CardTitle className="text-slate-800 text-lg">History Log</CardTitle>
              <CardDescription>
                All past depreciation calculations and journal postings.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-slate-50/50">
                  <TableRow>
                    <TableHead className="pl-6">Date</TableHead>
                    <TableHead>Asset Details</TableHead>
                    <TableHead>Journal Reference</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead className="text-right pr-6 font-bold">
                      Depreciated Amount
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="h-32 text-center text-slate-400"
                      >
                        Loading records...
                      </TableCell>
                    </TableRow>
                  ) : !runs || runs.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="h-32 text-center text-slate-400"
                      >
                        <div className="flex flex-col items-center justify-center space-y-2">
                          <History className="h-8 w-8 text-slate-300" />
                          <span>No depreciation records found.</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    runs.map((run: any) => (
                      <TableRow
                        key={run.id}
                        className="hover:bg-slate-50 border-slate-100"
                      >
                        <TableCell className="pl-6 font-medium text-slate-600">
                          {format(new Date(run.date), "MMM d, yyyy")}
                        </TableCell>
                        <TableCell>
                          <p className="font-bold text-slate-800">
                            {run.assetName}
                          </p>
                          <p className="text-xs text-slate-500 font-mono">
                            SN: {run.assetSerialNumber || "N/A"}
                          </p>
                        </TableCell>
                        <TableCell>
                          {run.journalEntryId ? (
                            <Link href={`/accounting/ledger/${run.journalEntryId}`}>
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline cursor-pointer">
                                <FileText className="h-3 h-3" />
                                Journal #{run.journalEntryId}
                                <ArrowRight className="h-3 w-3" />
                              </span>
                            </Link>
                          ) : (
                            <span className="text-xs text-slate-400">N/A</span>
                          )}
                        </TableCell>
                        <TableCell className="text-slate-600 text-sm max-w-xs truncate">
                          {run.notes || "System depreciation run."}
                        </TableCell>
                        <TableCell className="text-right pr-6 font-black text-rose-600 text-base">
                          {formatCurrency(Number(run.amount))}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
