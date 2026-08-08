import { Layout } from "@/components/layout";
import { useSalesOrders } from "@/hooks/use-sales-orders";
import { Button } from "@/components/ui/button";
import {
  Search,
  ClipboardList,
  ChevronLeft,
  ChevronRight,
  Calendar,
  ShoppingCart,
  Package,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Plane,
  Ship,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Link, useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { useActiveCompany } from "@/hooks/use-active-company";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { format, subDays, subMonths, startOfDay, endOfDay } from "date-fns";
import { cn } from "@/lib/utils";

const ORDER_TYPE_TABS = [
  { value: "all", label: "All Orders", icon: ClipboardList },
  { value: "cash_and_carry", label: "Cash & Carry", icon: ShoppingCart },
  { value: "preorder", label: "Preorder", icon: Package },
  { value: "lay_by", label: "Lay-by", icon: Clock },
];

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "draft", label: "Draft" },
  { value: "awaiting_deposit", label: "Awaiting Deposit" },
  { value: "approved", label: "Approved" },
  { value: "awaiting_shipment", label: "Awaiting Shipment" },
  { value: "in_transit", label: "In Transit" },
  { value: "arrived", label: "Arrived" },
  { value: "ready_for_collection", label: "Ready for Collection" },
  { value: "active", label: "Active" },
  { value: "payment_due", label: "Payment Due" },
  { value: "overdue", label: "Overdue" },
  { value: "defaulted", label: "Defaulted" },
  { value: "confirmed", label: "Confirmed" },
  { value: "invoiced", label: "Invoiced" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

function getStatusColor(status: string) {
  switch (status?.toLowerCase()) {
    case "draft": return "bg-slate-100 text-slate-700 border-slate-300";
    case "awaiting_deposit": return "bg-amber-100 text-amber-700 border-amber-300";
    case "approved": return "bg-emerald-100 text-emerald-700 border-emerald-300";
    case "awaiting_shipment": return "bg-blue-100 text-blue-700 border-blue-300";
    case "in_transit": return "bg-sky-100 text-sky-700 border-sky-300";
    case "arrived": return "bg-teal-100 text-teal-700 border-teal-300";
    case "ready_for_collection": return "bg-green-100 text-green-700 border-green-300";
    case "active": return "bg-indigo-100 text-indigo-700 border-indigo-300";
    case "payment_due": return "bg-orange-100 text-orange-700 border-orange-300";
    case "overdue": return "bg-red-100 text-red-700 border-red-300";
    case "defaulted": return "bg-rose-100 text-rose-800 border-rose-300";
    case "confirmed": return "bg-emerald-100 text-emerald-700 border-emerald-300";
    case "invoiced": return "bg-purple-100 text-purple-700 border-purple-300";
    case "completed": return "bg-gray-100 text-gray-700 border-gray-300";
    case "cancelled": return "bg-red-100 text-red-700 border-red-300";
    default: return "bg-slate-100 text-slate-700 border-slate-300";
  }
}

function OrderTypeBadge({ order }: { order: any }) {
  if (order.orderType === "preorder") {
    return order.preorderType === "air" ? (
      <Badge className="bg-sky-100 text-sky-700 border-sky-300 gap-1">
        <Plane className="w-3 h-3" /> Air
      </Badge>
    ) : (
      <Badge className="bg-blue-100 text-blue-700 border-blue-300 gap-1">
        <Ship className="w-3 h-3" /> Sea
      </Badge>
    );
  }
  if (order.orderType === "lay_by") {
    return (
      <Badge className="bg-indigo-100 text-indigo-700 border-indigo-300 gap-1">
        <Clock className="w-3 h-3" /> Lay-by
      </Badge>
    );
  }
  return (
    <Badge className="bg-slate-100 text-slate-600 border-slate-300 gap-1">
      <ShoppingCart className="w-3 h-3" /> C&C
    </Badge>
  );
}

export default function SalesOrdersPage() {
  const { activeCompanyId } = useActiveCompany();
  const { data: orders, isLoading } = useSalesOrders(activeCompanyId);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeTab, setTypeTab] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  const applyDateFilter = (order: any) => {
    if (dateFilter === "all") return true;
    const orderDate = new Date(order.issueDate);
    const now = new Date();
    switch (dateFilter) {
      case "today": return orderDate >= startOfDay(now) && orderDate <= endOfDay(now);
      case "last_7_days": return orderDate >= startOfDay(subDays(now, 7));
      case "last_30_days": return orderDate >= startOfDay(subDays(now, 30));
      case "last_3_months": return orderDate >= startOfDay(subMonths(now, 3));
      case "custom":
        if (!customStartDate || !customEndDate) return true;
        return orderDate >= new Date(customStartDate) && orderDate <= new Date(customEndDate);
      default: return true;
    }
  };

  const filteredOrders = orders?.filter((order) => {
    const matchesSearch =
      order.orderNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.customer?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.total?.toString().includes(searchTerm);
    const matchesType = typeTab === "all" || order.orderType === typeTab;
    const matchesStatus = statusFilter === "all" || order.status === statusFilter;
    const matchesDate = applyDateFilter(order);
    return matchesSearch && matchesType && matchesStatus && matchesDate;
  });

  // Summary stats
  const pendingApprovals = orders?.filter(o => o.approvalStatus === 'pending').length || 0;
  const activeLayBys = orders?.filter(o => o.orderType === 'lay_by' && !['completed','cancelled','defaulted'].includes(o.status)).length || 0;
  const activePreorders = orders?.filter(o => o.orderType === 'preorder' && !['completed','cancelled'].includes(o.status)).length || 0;

  const totalPages = Math.ceil((filteredOrders?.length || 0) / itemsPerPage);
  const paginatedOrders = filteredOrders?.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <Layout>
      <PageHeader
        title="Sales Orders"
        subtitle="Manage orders, preorders, lay-bys and fulfillment"
        actions={
          <Link href="/sales-orders/new">
            <Button>Create Sales Order</Button>
          </Link>
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Card className="border-none shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
              <ClipboardList className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{orders?.length || 0}</p>
              <p className="text-xs text-slate-500">Total Orders</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{pendingApprovals}</p>
              <p className="text-xs text-slate-500">Pending Approvals</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center">
              <Clock className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{activeLayBys}</p>
              <p className="text-xs text-slate-500">Active Lay-bys</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-sky-50 flex items-center justify-center">
              <Package className="w-5 h-5 text-sky-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{activePreorders}</p>
              <p className="text-xs text-slate-500">Active Preorders</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="card-depth border-none overflow-hidden">
        {/* Type Tabs */}
        <div className="flex border-b border-slate-100 bg-white overflow-x-auto">
          {ORDER_TYPE_TABS.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.value}
                onClick={() => { setTypeTab(tab.value); setCurrentPage(1); }}
                className={cn(
                  "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                  typeTab === tab.value
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                )}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
                {tab.value !== 'all' && (
                  <span className="ml-1 text-xs rounded-full bg-slate-100 px-1.5 py-0.5">
                    {orders?.filter(o => o.orderType === tab.value).length || 0}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Filters */}
        <div className="p-4 border-b border-slate-100 bg-white space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search orders..."
                className="pl-9 border-slate-200 bg-slate-50 focus:bg-white transition-colors"
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setCurrentPage(1); }}>
                <SelectTrigger className="w-[170px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={dateFilter} onValueChange={setDateFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Date" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="last_7_days">Last 7 Days</SelectItem>
                  <SelectItem value="last_30_days">Last 30 Days</SelectItem>
                  <SelectItem value="last_3_months">Last 3 Months</SelectItem>
                  <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {dateFilter === "custom" && (
            <div className="flex gap-2 items-center">
              <Calendar className="w-4 h-4 text-slate-400" />
              <Input type="date" value={customStartDate} onChange={(e) => setCustomStartDate(e.target.value)} className="w-auto" />
              <span className="text-slate-500">to</span>
              <Input type="date" value={customEndDate} onChange={(e) => setCustomEndDate(e.target.value)} className="w-auto" />
            </div>
          )}
        </div>

        <CardContent className="p-0">
          {/* Mobile View */}
          <div className="grid grid-cols-1 gap-4 p-4 md:hidden bg-slate-50/50">
            {isLoading ? (
              <div className="p-8 text-center text-slate-500">Loading orders...</div>
            ) : filteredOrders?.length === 0 ? (
              <div className="p-12 text-center text-slate-500">
                <div className="flex flex-col items-center justify-center">
                  <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mb-3">
                    <ClipboardList className="w-6 h-6 text-slate-400" />
                  </div>
                  <p className="font-medium">No sales orders found</p>
                </div>
              </div>
            ) : (
              paginatedOrders?.map((order) => (
                <div key={order.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between">
                    <div className="flex flex-col gap-1">
                      <span className="font-mono font-bold text-slate-700">{order.orderNumber}</span>
                      <span className="text-xs text-slate-500">{new Date(order.issueDate).toLocaleDateString()}</span>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="font-semibold text-slate-900">${Number(order.total).toFixed(2)}</span>
                      <Badge className={getStatusColor(order.status)}>{order.status.replace(/_/g, ' ')}</Badge>
                    </div>
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-100 pt-2">
                    <div>
                      <span className="text-[10px] uppercase text-slate-500 tracking-wider block mb-0.5">Customer</span>
                      <span className="text-sm font-medium text-slate-900">{order.customer?.name || '—'}</span>
                    </div>
                    <OrderTypeBadge order={order} />
                  </div>
                  {order.approvalStatus === 'pending' && (
                    <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Pending Approval
                    </div>
                  )}
                  <div className="flex justify-end mt-1">
                    <Link href={`/sales-orders/${order.id}`}>
                      <Button variant="outline" size="sm" className="h-8 rounded-lg text-slate-600 hover:text-blue-600">View Order</Button>
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Desktop Table */}
          <div className="hidden md:block w-full overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr>
                  <th className="data-table-header">Order #</th>
                  <th className="data-table-header">Date</th>
                  <th className="data-table-header">Customer</th>
                  <th className="data-table-header">Type</th>
                  <th className="data-table-header">Total</th>
                  <th className="data-table-header">Status</th>
                  <th className="data-table-header text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={7} className="p-8 text-center text-slate-500">Loading orders...</td></tr>
                ) : filteredOrders?.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-12 text-center text-slate-500">
                      <div className="flex flex-col items-center justify-center">
                        <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mb-3">
                          <ClipboardList className="w-6 h-6 text-slate-400" />
                        </div>
                        <p className="font-medium">No sales orders found</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedOrders?.map((order) => (
                    <tr key={order.id} className="data-table-row group">
                      <td className="data-table-cell">
                        <div className="flex flex-col">
                          <span className="font-mono font-bold text-slate-700">{order.orderNumber}</span>
                          {order.approvalStatus === 'pending' && (
                            <span className="text-[10px] text-amber-600 flex items-center gap-0.5 mt-0.5">
                              <AlertTriangle className="w-3 h-3" /> Needs Approval
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="data-table-cell text-slate-500">{new Date(order.issueDate).toLocaleDateString()}</td>
                      <td className="data-table-cell font-medium text-slate-900">{order.customer?.name || '—'}</td>
                      <td className="data-table-cell"><OrderTypeBadge order={order} /></td>
                      <td className="data-table-cell font-semibold text-slate-900">${Number(order.total).toFixed(2)}</td>
                      <td className="data-table-cell">
                        <Badge className={getStatusColor(order.status)}>{order.status.replace(/_/g, ' ')}</Badge>
                      </td>
                      <td className="data-table-cell text-right">
                        <Link href={`/sales-orders/${order.id}`}>
                          <Button variant="ghost" size="sm" className="h-8">View</Button>
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>

        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
            <div className="text-sm text-slate-600">
              Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredOrders?.length || 0)} of {filteredOrders?.length || 0} orders
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="h-8">
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum: number;
                  if (totalPages <= 5) pageNum = i + 1;
                  else if (currentPage <= 3) pageNum = i + 1;
                  else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                  else pageNum = currentPage - 2 + i;
                  return (
                    <Button key={pageNum} variant={currentPage === pageNum ? "default" : "outline"} size="sm" onClick={() => setCurrentPage(pageNum)} className="h-8 w-8">
                      {pageNum}
                    </Button>
                  );
                })}
              </div>
              <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="h-8">
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </Layout>
  );
}
