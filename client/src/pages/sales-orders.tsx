import { Layout } from "@/components/layout";
import { useSalesOrders } from "@/hooks/use-sales-orders";
import { Button } from "@/components/ui/button";
import { Search, ClipboardList, Filter, FileText, ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/status-badge";
import { Link, useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { useActiveCompany } from "@/hooks/use-active-company";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { format, subDays, subMonths, startOfDay, endOfDay } from "date-fns";

export default function SalesOrdersPage() {
  const { activeCompanyId } = useActiveCompany();
  const { data: orders, isLoading } = useSalesOrders(activeCompanyId);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case "draft": return "bg-slate-100 text-slate-700 border-slate-300";
      case "sent": return "bg-blue-100 text-blue-700 border-blue-300";
      case "confirmed": return "bg-emerald-100 text-emerald-700 border-emerald-300";
      case "invoiced": return "bg-purple-100 text-purple-700 border-purple-300";
      case "closed": return "bg-gray-100 text-gray-700 border-gray-300";
      case "cancelled": return "bg-red-100 text-red-700 border-red-300";
      default: return "bg-slate-100 text-slate-700 border-slate-300";
    }
  };

  const applyDateFilter = (order: any) => {
    if (dateFilter === "all") return true;
    
    const orderDate = new Date(order.issueDate);
    const now = new Date();
    
    switch (dateFilter) {
      case "today":
        return orderDate >= startOfDay(now) && orderDate <= endOfDay(now);
      case "last_7_days":
        return orderDate >= startOfDay(subDays(now, 7));
      case "last_30_days":
        return orderDate >= startOfDay(subDays(now, 30));
      case "last_3_months":
        return orderDate >= startOfDay(subMonths(now, 3));
      case "custom":
        if (!customStartDate || !customEndDate) return true;
        return orderDate >= new Date(customStartDate) && orderDate <= new Date(customEndDate);
      default:
        return true;
    }
  };

  const filteredOrders = orders?.filter(
    (order) => {
      const matchesSearch =
        order.orderNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.customer?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.total?.toString().includes(searchTerm);
      
      const matchesStatus = statusFilter === "all" || order.status === statusFilter;
      const matchesDate = applyDateFilter(order);
      
      return matchesSearch && matchesStatus && matchesDate;
    }
  );

  const totalPages = Math.ceil((filteredOrders?.length || 0) / itemsPerPage);
  const paginatedOrders = filteredOrders?.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <Layout>
      <PageHeader
        title="Sales Orders"
        subtitle="Manage customer orders and fulfillment"
        actions={
          <Link href="/sales-orders/new">
            <Button>Create Sales Order</Button>
          </Link>
        }
      />

      <Card className="card-depth border-none overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-white space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search orders..."
                className="pl-9 border-slate-200 bg-slate-50 focus:bg-white transition-colors"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                  <SelectItem value="invoiced">Invoiced</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
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
              <Input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="w-auto"
              />
              <span className="text-slate-500">to</span>
              <Input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="w-auto"
              />
            </div>
          )}
        </div>

        <CardContent className="p-0">
          <div className="w-full overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr>
                  <th className="data-table-header">Order #</th>
                  <th className="hidden sm:table-cell data-table-header">Date</th>
                  <th className="data-table-header">Customer</th>
                  <th className="data-table-header">Total</th>
                  <th className="data-table-header">Status</th>
                  <th className="data-table-header text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-500">
                      Loading orders...
                    </td>
                  </tr>
                ) : filteredOrders?.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-12 text-center text-slate-500">
                      <div className="flex flex-col items-center justify-center">
                        <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mb-3">
                          <ClipboardList className="w-6 h-6 text-slate-400" />
                        </div>
                        <p className="font-medium">No sales orders found</p>
                        <p className="text-xs mt-1">
                          Convert a quotation to create a sales order.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedOrders?.map((order) => (
                    <tr key={order.id} className="data-table-row group">
                      <td className="data-table-cell">
                        <div className="flex flex-col gap-1">
                          <span className="font-mono font-bold text-slate-700">
                            {order.orderNumber}
                          </span>
                        </div>
                      </td>
                      <td className="hidden sm:table-cell data-table-cell text-slate-500">
                        {new Date(order.issueDate).toLocaleDateString()}
                      </td>
                      <td className="data-table-cell font-medium text-slate-900">
                        {order.customer?.name}
                      </td>
                      <td className="data-table-cell font-semibold text-slate-900">
                        ${Number(order.total).toFixed(2)}
                      </td>
                      <td className="data-table-cell">
                        <Badge className={getStatusColor(order.status)}>
                          {order.status}
                        </Badge>
                      </td>
                      <td className="data-table-cell text-right">
                        <div className="flex justify-end gap-2">
                          <Link href={`/sales-orders/${order.id}`}>
                            <Button variant="ghost" size="sm" className="h-8">
                              View
                            </Button>
                          </Link>
                        </div>
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
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="h-8"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }
                  return (
                    <Button
                      key={pageNum}
                      variant={currentPage === pageNum ? "default" : "outline"}
                      size="sm"
                      onClick={() => setCurrentPage(pageNum)}
                      className="h-8 w-8"
                    >
                      {pageNum}
                    </Button>
                  );
                })}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="h-8"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </Layout>
  );
}
