import { Layout } from "@/components/layout";
import { PageHeader } from "@/components/page-header";
import { useActiveCompany } from "@/hooks/use-active-company";
import {
  GdnListItem,
  useGrvs,
} from "@/hooks/use-grvs";
import { useProducts } from "@/hooks/use-products";
import { useSuppliers } from "@/hooks/use-suppliers";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Truck,
  FileText,
  Download,
  ClipboardCheck,
  Clock,
  CheckCircle2,
  Loader2,
  Plus,
  XCircle,
  Info,
  AlertTriangle,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { format } from "date-fns";

const ITEMS_PER_PAGE = 15;

export default function InventoryAccountPage() {
  const { activeCompanyId } = useActiveCompany();
  const companyId = activeCompanyId || 0;
  const { data: grvs, isLoading } = useGrvs(companyId);


  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const filtered = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    if (!q) return grvs || [];
    return (grvs || []).filter(
      (g) =>
        g.grvNumber.toLowerCase().includes(q) ||
        (g.supplierName || "").toLowerCase().includes(q) ||
        (g.notes || "").toLowerCase().includes(q),
    );
  }, [grvs, searchTerm]);

  const totalPages = Math.ceil((filtered.length || 0) / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const rows = filtered.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  return (
    <Layout>
      <PageHeader
        title="Goods Received"
        subtitle="Review draft GDNs and manage confirmed GRV stock documents"
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/inventory/grvs/new">
              <Button className="rounded-xl font-bold bg-blue-600 hover:bg-blue-700">
                <Plus className="w-4 h-4 mr-2" />
                Direct GRV
              </Button>
            </Link>
          </div>
        }
      />



      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="relative flex-1 w-full sm:max-w-sm group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 group-hover:text-violet-500 transition-colors" />
          <Input
            placeholder="Search GRV number or supplier..."
            className="pl-12 h-12 rounded-xl border-slate-200 bg-white shadow-sm focus:ring-violet-500/20 focus:border-violet-500 font-medium transition-all"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
          />
        </div>
      </div>

      <TooltipProvider>
        <Card className="border-none shadow-xl shadow-slate-200/50 bg-white/80 backdrop-blur-sm rounded-[2rem] overflow-hidden ring-1 ring-slate-100">
          <CardContent className="p-0 overflow-x-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-100">
                  <th className="p-5 font-black text-slate-400 uppercase tracking-widest text-[10px]">
                    GRV No
                  </th>
                  <th className="p-5 font-black text-slate-400 uppercase tracking-widest text-[10px]">
                    Status
                  </th>
                  <th className="p-5 font-black text-slate-400 uppercase tracking-widest text-[10px]">
                    3-Way Match
                  </th>
                  <th className="p-5 font-black text-slate-400 uppercase tracking-widest text-[10px]">
                    Supplier Invoice
                  </th>
                  <th className="p-5 font-black text-slate-400 uppercase tracking-widest text-[10px]">
                    Date
                  </th>
                  <th className="p-5 font-black text-slate-400 uppercase tracking-widest text-[10px]">
                    Supplier
                  </th>
                  <th className="p-5 font-black text-slate-400 uppercase tracking-widest text-[10px]">
                    Lines
                  </th>
                  <th className="p-5 font-black text-slate-400 uppercase tracking-widest text-[10px]">
                    Total Cost
                  </th>
                  <th className="p-5 font-black text-slate-400 uppercase tracking-widest text-[10px] text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={9} className="p-12 text-center text-slate-500">
                      <div className="flex flex-col items-center justify-center gap-3">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-600"></div>
                        Loading goods received...
                      </div>
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-12 text-center text-slate-500">
                      <p className="font-bold text-lg">No GRVs found</p>
                      <p className="">
                        Record goods received to create GRV documents.
                      </p>
                    </td>
                  </tr>
                ) : (
                  rows.map((grv) => (
                    <tr
                      key={grv.id}
                      className="group border-b border-slate-50 hover:bg-slate-50/50 transition-colors"
                    >
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge
                                variant="outline"
                                className={`font-mono text-[10px] border-slate-200 bg-white ${grv.journalEntry ? "cursor-help" : ""}`}
                              >
                                {grv.grvNumber}
                              </Badge>
                            </TooltipTrigger>
                            {grv.journalEntry && (
                              <TooltipContent className="p-3 bg-slate-900 border border-slate-800 text-white rounded-xl shadow-xl w-72">
                                <div className="space-y-2 text-xs">
                                  <p className="font-bold text-[10px] text-slate-400 uppercase tracking-wider">GL Accrual Posting</p>
                                  <p className="font-semibold text-slate-300">{grv.journalEntry.description}</p>
                                  <div className="border-t border-slate-800 pt-1.5 space-y-1 font-mono text-[10px]">
                                    {grv.journalEntry.lines.map((line: any, i: number) => (
                                      <div key={i} className="flex justify-between gap-4">
                                        <span className={line.type === "DEBIT" ? "text-emerald-400" : "text-blue-400 pl-2"}>
                                          {line.accountCode} {line.accountName}
                                        </span>
                                        <span className="font-bold text-slate-200">
                                          ${line.amount.toFixed(2)} ({line.type === "DEBIT" ? "Dr" : "Cr"})
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </TooltipContent>
                            )}
                          </Tooltip>
                        </div>
                      </td>
                      <td className="p-4">
                        <Badge
                          variant="secondary"
                          className={
                            grv.status === "DRAFT"
                              ? "bg-amber-100 text-amber-800 hover:bg-amber-100 border-none font-bold text-[10px]"
                              : "bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-none font-bold text-[10px]"
                          }
                        >
                          {grv.status || "POSTED"}
                        </Badge>
                      </td>
                      <td className="p-4">
                        <Badge
                          variant="secondary"
                          className={
                            grv.matchingStatus === "MATCHED"
                              ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-none font-bold text-[10px]"
                              : grv.matchingStatus === "QTY_MISMATCH"
                              ? "bg-rose-100 text-rose-800 hover:bg-rose-100 border-none font-bold text-[10px]"
                              : grv.matchingStatus === "PRICE_VARIANCE"
                              ? "bg-amber-100 text-amber-800 hover:bg-amber-100 border-none font-bold text-[10px]"
                              : "bg-slate-100 text-slate-500 hover:bg-slate-100 border-none font-bold text-[10px]"
                          }
                        >
                          {grv.matchingStatus === "MATCHED"
                            ? "3-Way Matched"
                            : grv.matchingStatus === "QTY_MISMATCH"
                            ? "Qty Mismatch"
                            : grv.matchingStatus === "PRICE_VARIANCE"
                            ? "Price Variance"
                            : "Invoice Pending"}
                        </Badge>
                      </td>
                      <td className="p-4">
                        {grv.status === "DRAFT" ? (
                          <span className="text-[10px] text-slate-400 italic">N/A (Draft GRV)</span>
                        ) : grv.invoiceId ? (
                          <Link href={`/supplier-invoices/${grv.invoiceId}`}>
                            <a className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors">
                              <FileText className="w-3.5 h-3.5" />
                              <span>Bill #{grv.invoiceNumber}</span>
                            </a>
                          </Link>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="bg-slate-50 text-slate-500 border-slate-200 font-bold text-[10px]">
                              Pending
                            </Badge>
                            <Link href={`/supplier-invoices/new?grvId=${grv.id}`}>
                              <a className="text-[10px] font-extrabold text-blue-600 hover:text-blue-800 transition-colors hover:underline">
                                + Create Bill
                              </a>
                            </Link>
                          </div>
                        )}
                      </td>
                      <td className="p-4  font-medium text-slate-700">
                        {grv.createdAt
                          ? format(new Date(grv.createdAt), "dd MMM yyyy HH:mm")
                          : "-"}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2 text-slate-700">
                          <Truck className="w-4 h-4 text-slate-400" />
                          <span className="font-medium">
                            {grv.supplierName || "N/A"}
                          </span>
                        </div>
                      </td>
                      <td className="p-4 font-semibold text-slate-700">
                        {grv.serialNumbers && grv.serialNumbers.length > 0 ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-help underline decoration-slate-300 decoration-dotted hover:text-violet-600 transition-colors">
                                {grv.lineCount}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="p-3 bg-slate-900 border border-slate-800 text-white rounded-xl shadow-xl max-w-xs">
                              <div className="space-y-1">
                                <p className="font-bold text-[10px] text-slate-400 uppercase tracking-wider">Received Serial/Batch Numbers</p>
                                <div className="flex flex-wrap gap-1 pt-1.5 font-mono text-[9px]">
                                  {grv.serialNumbers.map((s: string, idx: number) => (
                                    <Badge key={idx} variant="outline" className="bg-slate-800 text-slate-300 border-slate-700 text-[9px] font-mono leading-none">
                                      {s}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          grv.lineCount
                        )}
                      </td>
                      <td className="p-4 font-black text-slate-800">
                        {grv.landedCostsBreakdown && (grv.landedCostsBreakdown.freight > 0 || grv.landedCostsBreakdown.duty > 0 || grv.landedCostsBreakdown.handling > 0) ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-help underline decoration-slate-300 decoration-dotted hover:text-violet-600 transition-colors">
                                ${Number(grv.totalCost || 0).toFixed(2)}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="p-3 bg-slate-900 border border-slate-800 text-white rounded-xl shadow-xl w-60">
                              <div className="space-y-2 text-xs">
                                <p className="font-bold text-[10px] text-slate-400 uppercase tracking-wider">Landed Costs Breakdown</p>
                                <div className="space-y-1.5 font-mono text-[10px] text-slate-300">
                                  <div className="flex justify-between">
                                    <span>Freight:</span>
                                    <span className="font-bold text-slate-100">${grv.landedCostsBreakdown.freight.toFixed(2)}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>Customs Duty:</span>
                                    <span className="font-bold text-slate-100">${grv.landedCostsBreakdown.duty.toFixed(2)}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>Handling:</span>
                                    <span className="font-bold text-slate-100">${grv.landedCostsBreakdown.handling.toFixed(2)}</span>
                                  </div>
                                </div>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          `$${Number(grv.totalCost || 0).toFixed(2)}`
                        )}
                      </td>
                    <td className="p-4">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/inventory/grvs/${encodeURIComponent(grv.id)}`}
                        >
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-xl h-8 text-[10px] font-bold border-slate-200"
                          >
                            <FileText className="w-3.5 h-3.5 mr-1" />
                            View
                          </Button>
                        </Link>
                        <Link
                          href={`/inventory/grvs/${encodeURIComponent(grv.id)}`}
                        >
                          <Button
                            size="sm"
                            className="rounded-xl h-8 text-[10px] font-bold"
                          >
                            <Download className="w-3.5 h-3.5 mr-1" />
                            Download
                          </Button>
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          <div className="flex flex-col sm:flex-row items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/30 gap-4">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              {filtered.length
                ? `Showing ${startIndex + 1}-${Math.min(startIndex + ITEMS_PER_PAGE, filtered.length)} of ${filtered.length}`
                : "No entries"}
            </div>
            <div className="flex items-center gap-2">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mr-2">
                Page {Math.min(currentPage, totalPages || 1)} of{" "}
                {totalPages || 1}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="rounded-xl h-8 text-[10px] font-bold border-slate-200"
              >
                <ChevronLeft className="h-3 w-3 mr-1" />
                Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages || 1, p + 1))
                }
                disabled={currentPage >= totalPages || totalPages === 0}
                className="rounded-xl h-8 text-[10px] font-bold border-slate-200"
              >
                Next
                <ChevronRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      </TooltipProvider>
    </Layout>
  );
}


