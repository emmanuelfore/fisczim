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
import { apiRequest } from "@/lib/queryClient";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { RotateCcw, ShieldCheck } from "lucide-react";
import { useState } from "react";
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

export default function AccountingAuditTrailPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [pendingReverseId, setPendingReverseId] = useState<number | null>(null);
  const { data: entries = [], isLoading, isError, refetch } = useQuery<AuditEntry[]>({
    queryKey: ["/api/accounting/audit-trail"],
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
      queryClient.invalidateQueries({
        queryKey: ["/api/accounting/audit-trail"],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/journal"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/accounting/opening-balances"],
      });
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
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" /> Journal Audit
            </CardTitle>
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
                  entries.map((entry) => (
                    <TableRow key={entry.id} className="align-top">
                      <TableCell className="whitespace-nowrap">
                        {format(new Date(entry.entryDate), "dd MMM yyyy")}
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
                              {Number(line.amount).toFixed(2)}
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
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
