import { Layout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/utils";
import {
  AlertTriangle,
  Banknote,
  ClipboardList,
  CreditCard,
  Receipt,
  Scale,
  ShieldCheck,
} from "lucide-react";
import { Link } from "wouter";

export default function AccountingDashboardPage() {
  const { data, isLoading, isError, refetch } = useQuery<any>({
    queryKey: ["/api/accounting/dashboard"],
  });

  const cards = [
    { label: "Cashbook Position", value: data?.cashBalance, icon: Banknote },
    { label: "Receivables", value: data?.receivables, icon: CreditCard },
    { label: "Payables", value: data?.payables, icon: Receipt },
    { label: "VAT Due", value: data?.vatDue, icon: Scale },
    {
      label: "Unallocated Receipts",
      value: data?.unallocatedReceipts,
      icon: ClipboardList,
    },
    {
      label: "Unallocated Supplier Payments",
      value: data?.unallocatedSupplierPayments,
      icon: ClipboardList,
    },
  ];

  return (
    <Layout hideHeaderTitle>
      <div className="space-y-6">
        {isError && (
          <div className="flex items-center justify-between gap-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
            <p className="text-sm font-semibold text-rose-700">
              Could not load accounting dashboard. Showing cached or zero values.
            </p>
            <Button variant="outline" size="sm" className="shrink-0 rounded-lg" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-800 font-display">
              Accounting Dashboard
            </h2>
            <p className=" text-slate-500">
              Cash, receivables, payables, VAT, allocations, period status, and
              accounting alerts.
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/accounting/allocations">
              <Button variant="outline">Allocate Payments</Button>
            </Link>
            <Link href="/accounting/reports/vat-return">
              <Button>VAT Returns</Button>
            </Link>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => (
            <Card key={card.label}>
              <CardContent className="flex items-center justify-between p-5">
                <div>
                  <p className="text-xs font-black uppercase tracking-wider text-slate-400">
                    {card.label}
                  </p>
                  <p className="mt-2 text-2xl font-bold text-slate-900">
                    {isLoading
                      ? "..."
                      : formatCurrency(Number(card.value || 0))}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3 text-slate-500">
                  <card.icon className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5" /> Period & Reconciliation
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 ">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Current period</span>
                <Badge variant="outline">
                  {data?.currentPeriod?.name || "No period"}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Period status</span>
                <Badge
                  className={
                    data?.currentPeriod?.status === "CLOSED"
                      ? "bg-rose-50 text-rose-700"
                      : "bg-emerald-50 text-emerald-700"
                  }
                >
                  {data?.currentPeriod?.status || "Not configured"}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Unreconciled bank lines</span>
                <span className="font-bold">
                  {data?.unreconciledBankLines || 0}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" /> Alerts
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {isLoading ? (
                <p className=" text-slate-500">Loading alerts...</p>
              ) : isError ? (
                <p className=" text-amber-700">Could not load alerts.</p>
              ) : data?.alerts?.length ? (
                data.alerts.map((alert: any, index: number) => (
                  <div
                    key={index}
                    className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2  text-amber-800"
                  >
                    {alert.title}
                  </div>
                ))
              ) : (
                <p className=" text-emerald-700">No major accounting alerts.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
