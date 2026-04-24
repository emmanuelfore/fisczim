import { Layout } from "@/components/layout";
import { PageHeader } from "@/components/page-header";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useGrvs } from "@/hooks/use-grvs";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, ChevronLeft, ChevronRight, Truck, FileText, Download } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { format } from "date-fns";
import { GrnForm } from "@/components/inventory/grn-form";

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
        subtitle="GRV register and received stock documents"
        actions={<GrnForm />}
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

      <Card className="border-none shadow-xl shadow-slate-200/50 bg-white/80 backdrop-blur-sm rounded-[2rem] overflow-hidden ring-1 ring-slate-100">
        <CardContent className="p-0 overflow-x-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-100">
                <th className="p-5 font-black text-slate-400 uppercase tracking-widest text-[10px]">GRV No</th>
                <th className="p-5 font-black text-slate-400 uppercase tracking-widest text-[10px]">Date</th>
                <th className="p-5 font-black text-slate-400 uppercase tracking-widest text-[10px]">Supplier</th>
                <th className="p-5 font-black text-slate-400 uppercase tracking-widest text-[10px]">Lines</th>
                <th className="p-5 font-black text-slate-400 uppercase tracking-widest text-[10px]">Total Cost</th>
                <th className="p-5 font-black text-slate-400 uppercase tracking-widest text-[10px] text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-600"></div>
                      Loading goods received...
                    </div>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-slate-500">
                    <p className="font-bold text-lg">No GRVs found</p>
                    <p className="text-sm">Record goods received to create GRV documents.</p>
                  </td>
                </tr>
              ) : (
                rows.map((grv) => (
                  <tr key={grv.id} className="group border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="font-mono text-[10px] border-slate-200 bg-white">
                          {grv.grvNumber}
                        </Badge>
                      </div>
                    </td>
                    <td className="p-4 text-sm font-medium text-slate-700">
                      {grv.createdAt ? format(new Date(grv.createdAt), "dd MMM yyyy HH:mm") : "-"}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2 text-slate-700">
                        <Truck className="w-4 h-4 text-slate-400" />
                        <span className="font-medium">{grv.supplierName || "N/A"}</span>
                      </div>
                    </td>
                    <td className="p-4 text-sm font-semibold text-slate-700">{grv.lineCount}</td>
                    <td className="p-4 text-sm font-black text-slate-800">${Number(grv.totalCost || 0).toFixed(2)}</td>
                    <td className="p-4">
                      <div className="flex items-center justify-end gap-2">
                        <Link href={`/inventory/grvs/${encodeURIComponent(grv.id)}`}>
                          <Button variant="outline" size="sm" className="rounded-xl h-8 text-[10px] font-bold border-slate-200">
                            <FileText className="w-3.5 h-3.5 mr-1" />
                            View
                          </Button>
                        </Link>
                        <Link href={`/inventory/grvs/${encodeURIComponent(grv.id)}`}>
                          <Button size="sm" className="rounded-xl h-8 text-[10px] font-bold">
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
              {filtered.length ? `Showing ${startIndex + 1}-${Math.min(startIndex + ITEMS_PER_PAGE, filtered.length)} of ${filtered.length}` : "No entries"}
            </div>
            <div className="flex items-center gap-2">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mr-2">
                Page {Math.min(currentPage, totalPages || 1)} of {totalPages || 1}
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
                onClick={() => setCurrentPage((p) => Math.min(totalPages || 1, p + 1))}
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
    </Layout>
  );
}

