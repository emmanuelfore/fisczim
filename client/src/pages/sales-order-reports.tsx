import { Layout } from "@/components/layout";
import { PageHeader } from "@/components/page-header";
import { useSalesOrderReports } from "@/hooks/use-sales-orders";
import { useActiveCompany } from "@/hooks/use-active-company";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Plane, Ship, Clock, Package, AlertTriangle, Download } from "lucide-react";
import { format, differenceInDays } from "date-fns";

const TABS = [
  { value: "preorders", label: "Preorder Reports", icon: Package },
  { value: "lay-bys", label: "Lay-by Reports", icon: Clock },
  { value: "bundles", label: "Bundle Reports", icon: Package },
] as const;

export default function SalesOrderReportsPage() {
  const { activeCompanyId } = useActiveCompany();
  const [activeTab, setActiveTab] = useState<'preorders' | 'lay-bys' | 'bundles'>('preorders');
  const { data, isLoading } = useSalesOrderReports(activeCompanyId, activeTab);

  const exportCSV = () => {
    if (!data) return;
    let headers: string[] = [];
    let rows: string[][] = [];
    let filename = `sales-orders-${activeTab}-${format(new Date(), 'yyyy-MM-dd')}.csv`;

    if (activeTab === 'preorders') {
      headers = ['Order Number', 'Customer', 'Preorder Type', 'Total', 'Deposit Paid', 'Remaining Balance', 'Status', 'Expected Arrival'];
      rows = (data.all || []).map((o: any) => [
        o.orderNumber,
        o.customer?.name || 'N/A',
        o.preorderType || 'N/A',
        Number(o.total).toFixed(2),
        Number(o.depositPaid || 0).toFixed(2),
        Number(o.remainingBalance || 0).toFixed(2),
        o.status,
        o.expectedArrival ? format(new Date(o.expectedArrival), 'yyyy-MM-dd') : 'N/A',
      ]);
    } else if (activeTab === 'lay-bys') {
      headers = ['Order Number', 'Customer', 'Duration (Months)', 'Total', 'Deposit Paid', 'Remaining Balance', 'Status'];
      rows = (data.all || []).map((o: any) => [
        o.orderNumber,
        o.customer?.name || 'N/A',
        o.layByDuration?.toString() || '3',
        Number(o.total).toFixed(2),
        Number(o.depositPaid || 0).toFixed(2),
        Number(o.remainingBalance || 0).toFixed(2),
        o.status,
      ]);
    } else if (activeTab === 'bundles') {
      headers = ['Bundle Name', 'SKU', 'Selling Price', 'Status', 'Item Count'];
      rows = (data.bundles || []).map((b: any) => [
        b.name,
        b.sku,
        Number(b.sellingPrice).toFixed(2),
        b.isActive ? 'Active' : 'Inactive',
        b.items?.length?.toString() || '0',
      ]);
    }

    const csvContent = [headers.join(','), ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.click();
  };

  return (
    <Layout>
      <div className="flex justify-between items-center mb-4">
        <PageHeader title="Sales Order Reports" subtitle="Analytics for preorders, lay-bys, and compound products" />
        <Button variant="outline" size="sm" onClick={exportCSV} disabled={isLoading || !data}>
          <Download className="w-4 h-4 mr-2" /> Export CSV
        </Button>
      </div>

      <div className="flex border-b border-slate-200 mb-6 bg-white rounded-t-xl overflow-hidden">
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={cn(
                "flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors",
                activeTab === tab.value ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-700"
              )}
            >
              <Icon className="w-4 h-4" />{tab.label}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="p-12 text-center text-slate-500">Loading report data...</div>
      ) : (
        <>
          {activeTab === 'preorders' && data && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="border-none shadow-sm"><CardContent className="p-4"><p className="text-2xl font-bold">{data.active?.length || 0}</p><p className="text-xs text-slate-500 mt-1">Active Preorders</p></CardContent></Card>
                <Card className="border-none shadow-sm"><CardContent className="p-4"><p className="text-2xl font-bold text-red-600">{data.delayed?.length || 0}</p><p className="text-xs text-slate-500 mt-1">Delayed Orders</p></CardContent></Card>
                <Card className="border-none shadow-sm"><CardContent className="p-4"><p className="text-2xl font-bold text-emerald-600">${Number(data.depositsCollected || 0).toFixed(2)}</p><p className="text-xs text-slate-500 mt-1">Deposits Collected</p></CardContent></Card>
                <Card className="border-none shadow-sm"><CardContent className="p-4"><p className="text-2xl font-bold text-amber-600">${Number(data.outstandingBalances || 0).toFixed(2)}</p><p className="text-xs text-slate-500 mt-1">Outstanding Balances</p></CardContent></Card>
              </div>

              {data.delayed?.length > 0 && (
                <Card className="border-none shadow-sm">
                  <CardHeader><CardTitle className="flex items-center gap-2 text-red-600"><AlertTriangle className="w-5 h-5" />Delayed Preorders — Refund Recommendations</CardTitle></CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead><tr><th className="data-table-header">Order #</th><th className="data-table-header">Customer</th><th className="data-table-header">Type</th><th className="data-table-header">Expected Arrival</th><th className="data-table-header">Days Overdue</th><th className="data-table-header">Balance Due</th><th className="data-table-header">Action</th></tr></thead>
                        <tbody>
                          {data.delayed.map((order: any) => (
                            <tr key={order.id} className="data-table-row">
                              <td className="data-table-cell font-mono font-bold">{order.orderNumber}</td>
                              <td className="data-table-cell">{order.customer?.name}</td>
                              <td className="data-table-cell">{order.preorderType === 'air' ? <Badge className="bg-sky-100 text-sky-700 gap-1"><Plane className="w-3 h-3" />Air</Badge> : <Badge className="bg-blue-100 text-blue-700 gap-1"><Ship className="w-3 h-3" />Sea</Badge>}</td>
                              <td className="data-table-cell">{order.expectedArrival ? format(new Date(order.expectedArrival), 'dd/MM/yyyy') : '—'}</td>
                              <td className="data-table-cell"><span className="text-red-600 font-medium">{order.expectedArrival ? differenceInDays(new Date(), new Date(order.expectedArrival)) : '—'} days</span></td>
                              <td className="data-table-cell font-semibold">${Number(order.remainingBalance || 0).toFixed(2)}</td>
                              <td className="data-table-cell"><Badge className="bg-rose-100 text-rose-700">Recommend Refund</Badge></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card className="border-none shadow-sm">
                <CardHeader><CardTitle>All Preorders</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead><tr><th className="data-table-header">Order #</th><th className="data-table-header">Customer</th><th className="data-table-header">Type</th><th className="data-table-header">Total</th><th className="data-table-header">Deposit Paid</th><th className="data-table-header">Balance</th><th className="data-table-header">Status</th></tr></thead>
                      <tbody>
                        {data.all?.map((order: any) => (
                          <tr key={order.id} className="data-table-row">
                            <td className="data-table-cell font-mono font-bold">{order.orderNumber}</td>
                            <td className="data-table-cell">{order.customer?.name}</td>
                            <td className="data-table-cell">{order.preorderType === 'air' ? <Badge className="bg-sky-100 text-sky-700 gap-1"><Plane className="w-3 h-3" />Air</Badge> : <Badge className="bg-blue-100 text-blue-700 gap-1"><Ship className="w-3 h-3" />Sea</Badge>}</td>
                            <td className="data-table-cell font-semibold">${Number(order.total).toFixed(2)}</td>
                            <td className="data-table-cell text-emerald-700">${Number(order.depositPaid || 0).toFixed(2)}</td>
                            <td className="data-table-cell text-amber-700">${Number(order.remainingBalance || 0).toFixed(2)}</td>
                            <td className="data-table-cell"><Badge className="capitalize">{order.status?.replace(/_/g, ' ')}</Badge></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === 'lay-bys' && data && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="border-none shadow-sm"><CardContent className="p-4"><p className="text-2xl font-bold">{data.active?.length || 0}</p><p className="text-xs text-slate-500 mt-1">Active Lay-bys</p></CardContent></Card>
                <Card className="border-none shadow-sm"><CardContent className="p-4"><p className="text-2xl font-bold text-amber-600">{data.upcomingPayments?.length || 0}</p><p className="text-xs text-slate-500 mt-1">Upcoming Payments (30d)</p></CardContent></Card>
                <Card className="border-none shadow-sm"><CardContent className="p-4"><p className="text-2xl font-bold text-red-600">{data.defaulted?.length || 0}</p><p className="text-xs text-slate-500 mt-1">Defaulted</p></CardContent></Card>
                <Card className="border-none shadow-sm"><CardContent className="p-4"><p className="text-2xl font-bold text-emerald-600">{data.completed?.length || 0}</p><p className="text-xs text-slate-500 mt-1">Completed</p></CardContent></Card>
              </div>
              <Card className="border-none shadow-sm">
                <CardHeader><CardTitle>All Lay-by Orders</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead><tr><th className="data-table-header">Order #</th><th className="data-table-header">Customer</th><th className="data-table-header">Duration</th><th className="data-table-header">Total</th><th className="data-table-header">Paid</th><th className="data-table-header">Balance</th><th className="data-table-header">Status</th></tr></thead>
                      <tbody>
                        {data.all?.map((order: any) => (
                          <tr key={order.id} className="data-table-row">
                            <td className="data-table-cell font-mono font-bold">{order.orderNumber}</td>
                            <td className="data-table-cell">{order.customer?.name}</td>
                            <td className="data-table-cell">{order.layByDuration} months</td>
                            <td className="data-table-cell font-semibold">${Number(order.total).toFixed(2)}</td>
                            <td className="data-table-cell text-emerald-700">${Number(order.depositPaid || 0).toFixed(2)}</td>
                            <td className="data-table-cell text-amber-700">${Number(order.remainingBalance || 0).toFixed(2)}</td>
                            <td className="data-table-cell"><Badge className="capitalize">{order.status?.replace(/_/g, ' ')}</Badge></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === 'bundles' && data && (
            <Card className="border-none shadow-sm">
              <CardHeader><CardTitle>Compound Products</CardTitle></CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead><tr><th className="data-table-header">Bundle Name</th><th className="data-table-header">SKU</th><th className="data-table-header">Components</th><th className="data-table-header">Price</th><th className="data-table-header">Status</th></tr></thead>
                    <tbody>
                      {data.bundles?.map((bundle: any) => (
                        <tr key={bundle.id} className="data-table-row">
                          <td className="data-table-cell font-medium">{bundle.name}</td>
                          <td className="data-table-cell font-mono text-slate-600">{bundle.sku}</td>
                          <td className="data-table-cell"><div className="flex flex-wrap gap-1">{bundle.items?.map((item: any) => (<span key={item.id} className="text-xs bg-slate-100 rounded px-2 py-0.5">{item.product?.name} ×{Number(item.quantity)}</span>))}</div></td>
                          <td className="data-table-cell font-semibold">${Number(bundle.sellingPrice).toFixed(2)}</td>
                          <td className="data-table-cell"><Badge className={bundle.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}>{bundle.isActive ? 'Active' : 'Inactive'}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </Layout>
  );
}
