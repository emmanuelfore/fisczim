import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ClipboardCheck,
  ClipboardList,
  ExternalLink,
  FileText,
  Package,
  Search,
} from "lucide-react";

import { Layout } from "@/components/layout";
import { PageHeader } from "@/components/page-header";
import { apiFetch } from "@/lib/api";
import { useActiveCompany } from "@/hooks/use-active-company";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type PickListRow = {
  id: number;
  pickNumber: string;
  status: string;
  salesOrderId: number;
  orderNumber: string;
  customerName: string | null;
  locationCode: string | null;
  locationName: string | null;
  deliveryNumber: string | null;
  recipientName: string | null;
  podReference: string | null;
  podAttachmentUrl: string | null;
  lineCount: number;
  pickedQuantity: number;
  pickedAt: string | null;
  dispatchedAt: string | null;
  createdAt: string | null;
};

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "DRAFT", label: "Draft" },
  { value: "PICKED", label: "Picked" },
  { value: "DISPATCHED", label: "Dispatched" },
  { value: "CANCELLED", label: "Cancelled" },
];

function statusBadge(status: string) {
  switch (status) {
    case "DRAFT":
      return <Badge className="bg-amber-100 text-amber-700 border-amber-200">Draft</Badge>;
    case "PICKED":
      return <Badge className="bg-blue-100 text-blue-700 border-blue-200">Picked</Badge>;
    case "DISPATCHED":
      return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Dispatched</Badge>;
    case "CANCELLED":
      return <Badge className="bg-slate-100 text-slate-600 border-slate-200">Cancelled</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : format(date, "dd MMM yyyy");
}

export default function PickListsPage() {
  const { activeCompanyId } = useActiveCompany();
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  const {
    data: pickLists = [],
    isLoading,
    isError,
    refetch,
  } = useQuery<PickListRow[]>({
    queryKey: ["/api/pick-lists", activeCompanyId, statusFilter],
    queryFn: async () => {
      if (!activeCompanyId) return [];
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      const query = params.toString();
      const res = await apiFetch(`/api/pick-lists${query ? `?${query}` : ""}`);
      if (!res.ok) throw new Error("Failed to load pick lists");
      return res.json();
    },
    enabled: !!activeCompanyId,
  });

  const filtered = pickLists.filter((pick) => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return true;
    return [
      pick.pickNumber,
      pick.orderNumber,
      pick.customerName,
      pick.locationCode,
      pick.locationName,
      pick.deliveryNumber,
      pick.podReference,
    ].some((value) => value?.toLowerCase().includes(term));
  });

  const countFor = (status: string) =>
    pickLists.filter((pick) => pick.status === status).length;

  return (
    <Layout>
      <PageHeader
        title="Pick Lists"
        subtitle="Warehouse picking, dispatch notes and proof of delivery"
        actions={
          <Link href="/sales-orders">
            <Button variant="outline">Go to Sales Orders</Button>
          </Link>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Card className="border-none shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center">
              <ClipboardList className="w-5 h-5 text-slate-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{pickLists.length}</p>
              <p className="text-xs text-slate-500">Total Pick Lists</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center">
              <Package className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{countFor("DRAFT")}</p>
              <p className="text-xs text-slate-500">Draft</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
              <ClipboardCheck className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{countFor("PICKED")}</p>
              <p className="text-xs text-slate-500">Picked</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center">
              <FileText className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{countFor("DISPATCHED")}</p>
              <p className="text-xs text-slate-500">Dispatched</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="card-depth border-none overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-white flex flex-col sm:flex-row gap-3">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search pick #, order, customer, POD..."
              className="pl-9 border-slate-200 bg-slate-50 focus:bg-white transition-colors"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-12 text-center text-slate-500">Loading pick lists...</div>
          ) : isError ? (
            <div className="p-12 text-center text-slate-600">
              <p className="font-medium">Could not load pick lists.</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
                Retry
              </Button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <ClipboardCheck className="w-6 h-6 text-slate-400" />
              </div>
              <p className="font-medium">No pick lists found</p>
              <p className="text-sm mt-1">
                Prepare one from an approved sales order using Order Picking.
              </p>
            </div>
          ) : (
            <div className="w-full overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr>
                    <th className="data-table-header">Pick #</th>
                    <th className="data-table-header">Sales Order</th>
                    <th className="data-table-header">Customer</th>
                    <th className="data-table-header">Warehouse</th>
                    <th className="data-table-header text-center">Lines</th>
                    <th className="data-table-header text-right">Picked Qty</th>
                    <th className="data-table-header">Status</th>
                    <th className="data-table-header">Delivery / POD</th>
                    <th className="data-table-header">Dates</th>
                    <th className="data-table-header text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((pick) => (
                    <tr key={pick.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                      <td className="px-4 py-3 font-mono font-semibold text-slate-800">
                        {pick.pickNumber}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{pick.orderNumber}</td>
                      <td className="px-4 py-3 text-slate-700">{pick.customerName || "—"}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {pick.locationCode ? `${pick.locationCode} — ` : ""}
                        {pick.locationName || "—"}
                      </td>
                      <td className="px-4 py-3 text-center text-slate-700">{pick.lineCount}</td>
                      <td className="px-4 py-3 text-right text-slate-700">
                        {Number(pick.pickedQuantity || 0).toFixed(2)}
                      </td>
                      <td className="px-4 py-3">{statusBadge(pick.status)}</td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {pick.deliveryNumber && <div>DN: {pick.deliveryNumber}</div>}
                        {pick.podReference && <div>POD: {pick.podReference}</div>}
                        {pick.recipientName && <div>Received: {pick.recipientName}</div>}
                        {pick.podAttachmentUrl && (
                          <a
                            href={pick.podAttachmentUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                          >
                            Attachment <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                        {!pick.deliveryNumber && !pick.podReference && !pick.recipientName && !pick.podAttachmentUrl && "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        <div>Created: {formatDate(pick.createdAt)}</div>
                        {pick.pickedAt && <div>Picked: {formatDate(pick.pickedAt)}</div>}
                        {pick.dispatchedAt && <div>Dispatched: {formatDate(pick.dispatchedAt)}</div>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/sales-orders/${pick.salesOrderId}`}>
                          <Button variant="outline" size="sm" className="h-8">
                            Open Order
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </Layout>
  );
}
