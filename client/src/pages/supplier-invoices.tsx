import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Plus, Search, FileText } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";
import { useActiveCompany } from "@/hooks/use-active-company";
import { usePurchaseOrders } from "@/hooks/use-purchase-orders";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { type Account, type Supplier } from "@shared/schema";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

export default function SupplierInvoicesPage() {
  const {
    activeCompany,
    activeCompanyId,
    isLoading: isCompanyLoading,
  } = useActiveCompany();
  const companyId = activeCompanyId || 0;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const isNewFromQuery = searchParams.get("new") === "true";
  const defaultType = searchParams.get("type") || "Invoice";
  const defaultRefId = searchParams.get("referenceId") || "";

  const [searchTerm, setSearchTerm] = useState("");
  const { data: invoices, isLoading } = useQuery<any[]>({
    queryKey: [`/api/companies/${companyId}/supplier-invoices`],
    enabled: !!companyId,
  });

  const filteredInvoices = invoices?.filter(
    (inv) =>
      inv.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (inv.supplier?.name || "")
        .toLowerCase()
        .includes(searchTerm.toLowerCase()),
  );

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <Search className="h-5 w-5" />
            </div>
            <div className="relative group min-w-[320px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-primary transition-colors" />
              <Input
                placeholder="Search by invoice number or supplier..."
                className="pl-9 h-11 bg-white border-slate-200 rounded-xl shadow-sm focus:ring-primary/20"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <Button
            onClick={() => setLocation("/supplier-invoices/new")}
            disabled={!companyId}
            className="h-11 px-6 rounded-xl font-bold bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20 transition-all active:scale-95 flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            <span>Create Bill</span>
          </Button>
        </div>

        <Card className="border-slate-200/60 shadow-sm overflow-hidden rounded-2xl">
          <CardHeader className="bg-white border-b border-slate-100 px-6 py-5">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-bold text-slate-800 font-display">
                Supplier Invoices (Accounts Payable)
              </CardTitle>
              <Badge
                variant="outline"
                className="bg-slate-50 text-slate-500 font-bold border-slate-200 px-3 py-1 rounded-lg"
              >
                {filteredInvoices?.length || 0} Invoices
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-slate-50/50">
                <TableRow className="hover:bg-transparent border-slate-100">
                  <TableHead className="w-[120px] font-bold text-slate-500 uppercase text-[11px] tracking-wider pl-6">
                    Invoice #
                  </TableHead>
                  <TableHead className="font-bold text-slate-500 uppercase text-[11px] tracking-wider">
                    Date
                  </TableHead>
                  <TableHead className="font-bold text-slate-500 uppercase text-[11px] tracking-wider">
                    Supplier
                  </TableHead>
                  <TableHead className="font-bold text-slate-500 uppercase text-[11px] tracking-wider">
                    Source
                  </TableHead>
                  <TableHead className="font-bold text-slate-500 uppercase text-[11px] tracking-wider">
                    Type
                  </TableHead>
                  <TableHead className="font-bold text-slate-500 uppercase text-[11px] tracking-wider">
                    Status
                  </TableHead>
                  <TableHead className="text-right font-bold text-slate-500 uppercase text-[11px] tracking-wider">
                    Subtotal
                  </TableHead>
                  <TableHead className="text-right font-bold text-slate-500 uppercase text-[11px] tracking-wider">
                    VAT
                  </TableHead>
                  <TableHead className="text-right pr-6 font-bold text-slate-500 uppercase text-[11px] tracking-wider">
                    Total Amount
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i} className="animate-pulse border-slate-50">
                      <TableCell colSpan={7} className="h-16 bg-slate-50/20" />
                    </TableRow>
                  ))
                ) : filteredInvoices?.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="h-32 text-center text-slate-400 font-medium"
                    >
                      No supplier invoices found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredInvoices?.map((invoice) => (
                    <TableRow
                      key={invoice.id}
                      className="hover:bg-slate-50/50 border-slate-50 transition-colors group cursor-pointer"
                      onClick={() => setLocation("/supplier-invoices/" + invoice.id)}
                    >
                      <TableCell className="font-bold text-slate-900 pl-6 group-hover:text-primary transition-colors flex items-center gap-2">
                        <FileText className="w-4 h-4 text-slate-400" />
                        {invoice.invoiceNumber}
                      </TableCell>
                      <TableCell className="text-slate-600 font-medium ">
                        {format(new Date(invoice.date), "dd MMM yyyy")}
                      </TableCell>
                      <TableCell className="font-bold text-slate-700">
                        {invoice.supplier?.name || "Unknown"}
                      </TableCell>
                      <TableCell className="text-slate-600 font-medium">
                        {invoice.purchaseOrder?.poNumber ||
                          invoice.grvReference ||
                          "-"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            invoice.transactionType === "DebitNote"
                              ? "bg-purple-50 text-purple-600 border-purple-100"
                              : invoice.transactionType === "CreditNote"
                                ? "bg-cyan-50 text-cyan-600 border-cyan-100"
                                : "bg-slate-50 text-slate-600 border-slate-100"
                          }
                        >
                          {invoice.transactionType === "DebitNote" ? "DEBIT NOTE" : invoice.transactionType === "CreditNote" ? "CREDIT NOTE" : "BILL"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            invoice.status === "paid"
                              ? "bg-emerald-50 text-emerald-600 border-emerald-100"
                              : invoice.status === "partial"
                                ? "bg-amber-50 text-amber-600 border-amber-100"
                                : "bg-rose-50 text-rose-600 border-rose-100"
                          }
                        >
                          {invoice.status.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-slate-700">
                        {formatCurrency(
                          Number(invoice.totalAmount || 0) -
                            Number(invoice.taxAmount || 0),
                          invoice.currency,
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-slate-700">
                        {formatCurrency(
                          Number(invoice.taxAmount || 0),
                          invoice.currency,
                        )}
                      </TableCell>
                      <TableCell className="text-right pr-6 font-bold text-slate-900">
                        {formatCurrency(
                          Number(invoice.totalAmount),
                          invoice.currency,
                        )}
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
