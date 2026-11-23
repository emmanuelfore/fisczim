import { Layout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/use-permissions";
import { useActiveCompany } from "@/hooks/use-active-company";
import { apiRequest } from "@/lib/queryClient";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { RotateCcw, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/utils";
import {
  accountingKey,
  fetchAccounting,
  invalidateAccountingCache,
} from "@/lib/accounting-query";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type AuditEntry = {
  id: number;
  entryDate: string;
  description: string;
  sourceDocument: string;
  actor: string;
  reversalStatus: "ACTIVE" | "REVERSED" | "REVERSAL";
  lines: Array<{
    id: number;
    accountCode: string;
    accountName: string;
    type: string;
    amount: string;
  }>;
};

const PAGE_SIZE = 20;

// The reversal route parses a date-only body with `new Date("YYYY-MM-DD")`,
// which is stored as UTC midnight. Formatting that timestamp in the browser's
// local zone shifts it to the previous day west of UTC, so use the date part.
function formatEntryDate(value: string) {
  const dateOnly = value?.slice(0, 10);
  return dateOnly
    ? format(new Date(`${dateOnly}T12:00:00`), "dd MMM yyyy")
    : "-";
}

export default function AccountingAuditTrailPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { activeCompany, activeCompanyId: companyId } = useActiveCompany();
  const currency = activeCompany?.currency || "USD";
  const [pendingReverseId, setPendingReverseId] = useState<number | null>(null);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const { can } = usePermissions();
  const canReverse = can("accounting.journal.reverse");

  // The audit-trail endpoint has no date parameters, so narrow the fetched rows
  // in the browser and keep the request cache keyed by the selected range.
  const { data: allEntries = [], isLoading, isError, refetch } = useQuery<AuditEntry[]>({
    queryKey: accountingKey("audit-trail", companyId, fromDate, toDate),
    enabled: !!companyId,
    queryFn: () =>
      fetchAccounting<AuditEntry[]>("/api/accounting/audit-trail", {
        from: fromDate,
        to: toDate,
      }),
  });

  const reverseMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest(
        "POST",
        `/api/accounting/journal/${id}/reverse`,
        {
          date: format(new Date(), "yyyy-MM-dd"),
          reason: `Reversal requested from accounting audit trail`,
        },
      );
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Journal reversed",
        description: "A reversing journal has been posted.",
      });
      invalidateAccountingCache(queryClient);
    },
    onError: (error: any) => {
      toast({
        title: "Could not reverse journal",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const badgeClass = (status: string) => {
    if (status === "REVERSED")
      return "bg-amber-50 text-amber-700 border-amber-100";
    if (status === "REVERSAL")
      return "bg-slate-100 text-slate-700 border-slate-200";
    return "bg-emerald-50 text-emerald-700 border-emerald-100";
  };

  const entries = useMemo(
    () =>
      allEntries.filter((entry) => {
        const date = entry.entryDate?.slice(0, 10);
        if (!date) return true;
        if (fromDate && date < fromDate) return false;
        if (toDate && date > toDate) return false;
        return true;
      }),
    [allEntries, fromDate, toDate],
  );
  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageEntries = entries.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  return (
    <Layout hideHeaderTitle>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 font-display">
            Posting Audit Trail
          </h2>
          <p className=" text-slate-500">
            Trace source documents, journal entries, debit/credit lines, actors,
            and reversals.
          </p>
        </div>
        <Card>
          <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" /> Journal Audit
            </CardTitle>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label htmlFor="audit-from" className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  From
                </Label>
                <Input
                  id="audit-from"
                  type="date"
                  value={fromDate}
                  onChange={(event) => {
                    setFromDate(event.target.value);
                    setPage(1);
                  }}
                  className="h-9 rounded-lg"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="audit-to" className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  To
                </Label>
                <Input
                  id="audit-to"
                  type="date"
                  value={toDate}
                  onChange={(event) => {
                    setToDate(event.target.value);
                    setPage(1);
                  }}
                  className="h-9 rounded-lg"
                />
              </div>
              {(fromDate || toDate) && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 rounded-lg"
                  onClick={() => {
                    setFromDate("");
                    setToDate("");
                    setPage(1);
                  }}
                >
                  Clear
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Lines</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center">
                      Loading audit trail...
                    </TableCell>
                  </TableRow>
                ) : isError ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center">
                      <div className="flex flex-col items-center justify-center gap-3">
                        <span className="text-rose-600 font-semibold">
                          Could not load the audit trail.
                        </span>
                        <Button variant="outline" size="sm" className="rounded-lg" onClick={() => refetch()}>
                          Retry
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : entries.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="h-24 text-center text-slate-500"
                    >
                      No postings found.
                    </TableCell>
                  </TableRow>
                ) : (
                  pageEntries.map((entry) => (
                    <TableRow key={entry.id} className="align-top">
                      <TableCell className="whitespace-nowrap">
                        {formatEntryDate(entry.entryDate)}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {entry.sourceDocument}
                      </TableCell>
                      <TableCell>
                        <div className="font-semibold text-slate-800">
                          #{entry.id} {entry.description}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {entry.lines?.map((line) => (
                            <div
                              key={line.id}
                              className="text-xs text-slate-600"
                            >
                              <span className="font-mono">
                                {line.accountCode}
                              </span>{" "}
                              {line.accountName} · {line.type}{" "}
                              {formatCurrency(Number(line.amount), currency)}
                            </div>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {entry.actor}
                      </TableCell>
                      <TableCell>
                        <Badge className={badgeClass(entry.reversalStatus)}>
                          {entry.reversalStatus}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {canReverse && (
                        <AlertDialog
                          open={pendingReverseId === entry.id}
                          onOpenChange={(open) =>
                            !open && setPendingReverseId(null)
                          }
                        >
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={
                                entry.reversalStatus !== "ACTIVE" ||
                                reverseMutation.isPending
                              }
                              onClick={() => setPendingReverseId(entry.id)}
                            >
                              <RotateCcw className="mr-2 h-4 w-4" /> Reverse
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                Reverse journal #{entry.id}?
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                A reversing journal entry will be posted on{" "}
                                {format(new Date(), "dd MMM yyyy")}. This cannot
                                be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() =>
                                  reverseMutation.mutate(entry.id)
                                }
                              >
                                Reverse Entry
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            {!isError && entries.length > PAGE_SIZE && (
              <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
                <p className="text-xs font-semibold text-slate-500">
                  Page {safePage} of {totalPages}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={safePage <= 1}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={safePage >= totalPages}
                    onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
