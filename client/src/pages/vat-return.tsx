import { useState } from "react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { Layout } from "@/components/layout";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FileText,
  Calculator,
  Calendar as CalendarIcon,
  ArrowUpRight,
  ArrowDownRight,
  Scale,
  CheckCircle2,
  Send,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

type CurrencyAmounts = Record<string, number>;

function formatCurrencyCode(amount: number, code = "USD") {
  const currencyCode = String(code || "USD").toUpperCase();
  try {
    return formatCurrency(Number(amount || 0), currencyCode);
  } catch {
    return `${currencyCode} ${Number(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}

function currencyLines(amounts: CurrencyAmounts = {}, includeCodes: string[] = []) {
  const normalized = Object.entries(amounts || {}).reduce((acc, [code, amount]) => {
    acc[String(code || "USD").toUpperCase()] = Number(amount || 0);
    return acc;
  }, {} as CurrencyAmounts);
  includeCodes.forEach((code) => {
    const currencyCode = String(code || "").toUpperCase();
    if (currencyCode && normalized[currencyCode] == null) normalized[currencyCode] = 0;
  });
  const entries = Object.entries(normalized).filter(([, amount]) => includeCodes.length > 0 || Math.abs(Number(amount || 0)) > 0.004);
  if (entries.length === 0) return <span>{formatCurrencyCode(0, "USD")}</span>;
  return (
    <span className="flex flex-col gap-1 leading-tight">
      {entries.map(([code, amount]) => (
        <span key={code}>{formatCurrencyCode(amount, code)}</span>
      ))}
    </span>
  );
}

export default function VatReturnPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [dateRange, setDateRange] = useState({
    from: format(startOfMonth(new Date()), "yyyy-MM-dd"),
    to: format(endOfMonth(new Date()), "yyyy-MM-dd"),
  });

  const { data: report, isLoading } = useQuery<any>({
    queryKey: [
      "/api/accounting/reports/vat-return",
      dateRange.from,
      dateRange.to,
    ],
    queryFn: async () => {
      const res = await apiFetch(
        `/api/accounting/reports/vat-return?startDate=${dateRange.from}&endDate=${dateRange.to}`,
      );
      if (!res.ok) throw new Error("Failed to fetch VAT report");
      return res.json();
    },
  });

  const { data: vatReturns = [] } = useQuery<any[]>({
    queryKey: ["/api/accounting/vat-returns"],
  });

  const currentReturnId = `VAT-${localStorage.getItem("selectedCompanyId") || ""}-${dateRange.from.replace(/-/g, "")}-${dateRange.to.replace(/-/g, "")}`;
  const currentLifecycle = vatReturns.find((row) => row.id === currentReturnId);
  const visibleCurrencyCodes = Array.from(new Set([
    "USD",
    "ZWG",
    ...Object.keys(report?.outputVatByCurrency || {}),
    ...Object.keys(report?.inputVatByCurrency || {}),
    ...Object.keys(report?.netVatByCurrency || {}),
  ]));

  const draftMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        "/api/accounting/vat-returns/draft",
        { startDate: dateRange.from, endDate: dateRange.to },
      );
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "VAT return draft created",
        description: "The current VAT calculation has been snapshotted.",
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/accounting/vat-returns"],
      });
    },
    onError: (error: any) =>
      toast({
        title: "Could not create draft",
        description: error.message,
        variant: "destructive",
      }),
  });

  const reviewMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        `/api/accounting/vat-returns/${currentLifecycle?.id}/review`,
      );
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "VAT return reviewed" });
      queryClient.invalidateQueries({
        queryKey: ["/api/accounting/vat-returns"],
      });
    },
    onError: (error: any) =>
      toast({
        title: "Could not mark reviewed",
        description: error.message,
        variant: "destructive",
      }),
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        `/api/accounting/vat-returns/${currentLifecycle?.id}/submit`,
        {},
      );
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "VAT return submitted",
        description: "A submitted snapshot has been preserved.",
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/accounting/vat-returns"],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/accounting/dashboard"],
      });
    },
    onError: (error: any) =>
      toast({
        title: "Could not submit VAT return",
        description: error.message,
        variant: "destructive",
      }),
  });

  return (
    <Layout hideHeaderTitle>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-orange-100 flex items-center justify-center text-orange-600">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold font-display text-slate-800">
                VAT Returns
              </h1>
              <p className=" text-slate-500">
                Fiscalized invoices only, excluding invoices with Red validation errors.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-white p-2 rounded-xl border border-slate-200">
            <div className="flex items-center gap-2 px-2">
              <CalendarIcon className="h-4 w-4 text-slate-400" />
              <Label className=" font-medium">Period:</Label>
            </div>
            <Input
              type="date"
              value={dateRange.from}
              onChange={(e) =>
                setDateRange({ ...dateRange, from: e.target.value })
              }
              className="h-8 w-36 border-none bg-slate-50 shadow-none focus-visible:ring-0"
            />
            <span className="text-slate-400">to</span>
            <Input
              type="date"
              value={dateRange.to}
              onChange={(e) =>
                setDateRange({ ...dateRange, to: e.target.value })
              }
              className="h-8 w-36 border-none bg-slate-50 shadow-none focus-visible:ring-0"
            />
          </div>
        </div>

        <Card>
          <CardContent className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className=" font-bold text-slate-800">VAT lifecycle</p>
              <p className="text-xs text-slate-500">
                Draft, review, submit, and preserve the return snapshot for this
                period.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                className={
                  currentLifecycle?.status === "SUBMITTED"
                    ? "bg-emerald-50 text-emerald-700"
                    : currentLifecycle?.status === "REVIEWED"
                      ? "bg-blue-50 text-blue-700"
                      : currentLifecycle?.status === "DRAFT"
                        ? "bg-amber-50 text-amber-700"
                        : "bg-slate-100 text-slate-600"
                }
              >
                {currentLifecycle?.status || "NOT DRAFTED"}
              </Badge>
              <Button
                variant="outline"
                disabled={
                  draftMutation.isPending ||
                  currentLifecycle?.status === "SUBMITTED"
                }
                onClick={() => draftMutation.mutate()}
              >
                <FileText className="mr-2 h-4 w-4" /> Draft
              </Button>
              <Button
                variant="outline"
                disabled={
                  !currentLifecycle ||
                  currentLifecycle.status === "SUBMITTED" ||
                  reviewMutation.isPending
                }
                onClick={() => reviewMutation.mutate()}
              >
                <CheckCircle2 className="mr-2 h-4 w-4" /> Review
              </Button>
              <Button
                disabled={
                  !currentLifecycle ||
                  currentLifecycle.status !== "REVIEWED" ||
                  submitMutation.isPending
                }
                onClick={() => submitMutation.mutate()}
              >
                <Send className="mr-2 h-4 w-4" /> Submit
              </Button>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="h-40 flex items-center justify-center border-2 border-dashed border-slate-200 rounded-2xl text-slate-500">
            Calculating...
          </div>
        ) : report ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="rounded-2xl border-slate-200 shadow-sm overflow-hidden">
              <div className="h-2 w-full bg-emerald-500" />
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className=" font-medium text-slate-500 uppercase tracking-widest">
                      Output VAT
                    </CardTitle>
                    <CardDescription>Tax collected on Sales</CardDescription>
                  </div>
                  <div className="h-8 w-8 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
                    <ArrowUpRight className="h-4 w-4" />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-black text-slate-800">
                  {currencyLines(report.outputVatByCurrency, visibleCurrencyCodes)}
                </div>
                <p className="mt-2 text-xs font-semibold text-slate-500">
                  {report.includedInvoiceCount || 0} eligible fiscal document{report.includedInvoiceCount === 1 ? "" : "s"}
                </p>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-slate-200 shadow-sm overflow-hidden">
              <div className="h-2 w-full bg-rose-500" />
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className=" font-medium text-slate-500 uppercase tracking-widest">
                      Input VAT
                    </CardTitle>
                    <CardDescription>Tax paid on Purchases</CardDescription>
                  </div>
                  <div className="h-8 w-8 rounded-full bg-rose-50 flex items-center justify-center text-rose-600">
                    <ArrowDownRight className="h-4 w-4" />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-black text-slate-800">
                  {currencyLines(report.inputVatByCurrency, visibleCurrencyCodes)}
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-slate-200 shadow-sm overflow-hidden bg-slate-50/50">
              <div className="h-2 w-full bg-indigo-500" />
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className=" font-black text-indigo-900 uppercase tracking-widest">
                      Net VAT Due
                    </CardTitle>
                    <CardDescription>
                      Total payable to Revenue Authority
                    </CardDescription>
                  </div>
                  <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600">
                    <Scale className="h-4 w-4" />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div
                  className={`text-4xl font-black ${report.netVat > 0 ? "text-rose-600" : report.netVat < 0 ? "text-emerald-600" : "text-slate-800"}`}
                >
                  {currencyLines(report.netVatByCurrency, visibleCurrencyCodes)}
                </div>
                {report.netVat < 0 && (
                  <p className="text-xs text-emerald-600 font-bold mt-1">
                    Refund Claimable
                  </p>
                )}
                {report.netVat > 0 && (
                  <p className="text-xs text-rose-600 font-bold mt-1">
                    Payment Required
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        ) : null}

        <Card className="rounded-2xl border-slate-200 bg-amber-50 border-amber-200">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className="mt-1 bg-amber-200/50 p-2 rounded-xl text-amber-700">
                <Calculator className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-amber-900 mb-1">
                  How is this calculated?
                </h3>
                <p className=" text-amber-800/80 mb-2">
                  The system aggregates compliant VAT records dynamically
                  between the selected dates, separated by currency.
                </p>
                <ul className=" text-amber-800 space-y-1 list-disc list-inside">
                  <li>
                    <strong>Output Tax:</strong> Sum of tax on fiscalized
                    sales documents that have synced to FDMS and have no Red validation errors.
                  </li>
                  <li>
                    <strong>Input Tax:</strong> Sum of explicitly recorded tax
                    applied on Supplier Invoices.
                  </li>
                  <li>
                    <strong>Net Tax:</strong> Simply Output minus Input. A
                    positive value means you owe tax. A negative value
                    represents an input credit.
                  </li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Return History</CardTitle>
            <CardDescription>
              Saved VAT snapshots for review and submission audit.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {vatReturns.length === 0 ? (
              <p className=" text-slate-500">No VAT return snapshots yet.</p>
            ) : (
              vatReturns.map((row) => (
                <div
                  key={row.id}
                  className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 "
                >
                  <span>
                    {row.startDate
                      ? format(new Date(row.startDate), "dd MMM yyyy")
                      : "-"}{" "}
                    to{" "}
                    {row.endDate
                      ? format(new Date(row.endDate), "dd MMM yyyy")
                      : "-"}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="font-bold">
                      {currencyLines(row.snapshot?.netVatByCurrency || { USD: Number(row.snapshot?.netVat || 0) }, visibleCurrencyCodes)}
                    </span>
                    <Badge variant="outline">{row.status}</Badge>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
