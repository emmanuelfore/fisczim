import { Layout } from "@/components/layout";
import { PageHeader } from "@/components/page-header";
import { useInventoryTransactions } from "@/hooks/use-inventory";
import { useProducts } from "@/hooks/use-products";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useBranchContext } from "@/lib/branch-context";
import { Card, CardContent } from "@/components/ui/card";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  History,
  Package,
  AlertCircle,
  PlusCircle,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Link } from "wouter";

const ITEMS_PER_PAGE = 20;
const ADJUSTMENT_TYPES = [
  "ADJUSTMENT",
  "SHRINKAGE",
  "CORRECTION",
  "DAMAGE",
  "EXPIRY",
];

export default function InventoryStockCountsPage() {
  const { activeCompanyId } = useActiveCompany();
  const { selectedBranchId } = useBranchContext();
  const companyId = activeCompanyId || 0;

  const { data: transactions, isLoading } = useInventoryTransactions(companyId);
  const { data: products } = useProducts(
    companyId,
    selectedBranchId || undefined,
  );

  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const filteredStockCounts = useMemo(() => {
    return transactions?.filter((t) => {
      const isAdjustment = ADJUSTMENT_TYPES.includes(t.type);
      if (!isAdjustment) return false;

      const isStockTakeRef = (t as any).referenceType === "STOCK_TAKE";
      const hasStockTakeNote = (t.notes || "")
        .toLowerCase()
        .includes("stock take");
      if (!isStockTakeRef && !hasStockTakeNote) return false;

      const product = products?.find((p) => p.id === t.productId);
      const query = searchTerm.toLowerCase();

      return (
        (product?.name || "").toLowerCase().includes(query) ||
        (product?.sku || "").toLowerCase().includes(query) ||
        (t.notes || "").toLowerCase().includes(query)
      );
    });
  }, [transactions, products, searchTerm]);

  const totalPages = Math.ceil(
    (filteredStockCounts?.length || 0) / ITEMS_PER_PAGE,
  );
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedStockCounts = filteredStockCounts?.slice(
    startIndex,
    startIndex + ITEMS_PER_PAGE,
  );

  return (
    <Layout>
      <PageHeader
        title="Stock Counts"
        subtitle="Committed stock-take entries and reconciliations"
        actions={
          <>
            <Link href="/inventory/adjustments">
              <Button variant="outline" className="rounded-xl">
                <History className="w-4 h-4 mr-2" />
                Stock Adjustments
              </Button>
            </Link>
            <Link href="/inventory/stock-take">
              <Button className="rounded-xl">
                <PlusCircle className="w-4 h-4 mr-2" />
                Record Stock Take
              </Button>
            </Link>
          </>
        }
      />

      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="relative flex-1 w-full sm:max-w-sm group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 group-hover:text-violet-500 transition-colors" />
          <Input
            placeholder="Search stock counts..."
            className="pl-12 h-12 rounded-xl border-slate-200 bg-white shadow-sm focus:ring-violet-500/20 focus:border-violet-500 font-medium transition-all"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
          />
        </div>

        {searchTerm && (
          <Button
            variant="ghost"
            onClick={() => {
              setSearchTerm("");
              setCurrentPage(1);
            }}
            className="text-slate-500 font-medium hover:text-slate-900 h-12 px-4 rounded-xl"
          >
            Reset
          </Button>
        )}
      </div>

      <Card className="border-none shadow-xl shadow-slate-200/50 bg-white/80 backdrop-blur-sm rounded-[2rem] overflow-hidden ring-1 ring-slate-100">
        <CardContent className="p-0 overflow-x-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-100">
                <th className="p-5 font-black text-slate-400 uppercase tracking-widest text-[10px]">
                  Date
                </th>
                <th className="p-5 font-black text-slate-400 uppercase tracking-widest text-[10px]">
                  Source
                </th>
                <th className="p-5 font-black text-slate-400 uppercase tracking-widest text-[10px]">
                  Product
                </th>
                <th className="p-5 font-black text-slate-400 uppercase tracking-widest text-[10px]">
                  Delta
                </th>
                <th className="hidden lg:table-cell p-5 font-black text-slate-400 uppercase tracking-widest text-[10px]">
                  Notes
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-600"></div>
                      Loading stock counts...
                    </div>
                  </td>
                </tr>
              ) : paginatedStockCounts?.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center">
                      <AlertCircle className="w-12 h-12 text-slate-200 mb-4" />
                      <p className="font-bold text-lg">No stock counts found</p>
                      <p className="">Committed stock-takes will appear here</p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedStockCounts?.map((t) => {
                  const product = products?.find((p) => p.id === t.productId);
                  const qty = Number(t.quantity);

                  return (
                    <tr
                      key={t.id}
                      className="group border-b border-slate-50 hover:bg-slate-50/50 transition-colors"
                    >
                      <td className="p-4">
                        <div className="flex flex-col min-w-0">
                          <span className="font-bold  text-slate-800">
                            {format(new Date(t.createdAt!), "MMM d, yyyy")}
                          </span>
                          <span className="text-[10px] font-medium text-slate-400">
                            {format(new Date(t.createdAt!), "HH:mm")}
                          </span>
                        </div>
                      </td>
                      <td className="p-4">
                        <Badge className="rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide bg-amber-50 text-amber-700 border-amber-100">
                          Stock Take
                        </Badge>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-3 overflow-hidden">
                          <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-slate-100 flex items-center justify-center ring-1 ring-slate-200 shrink-0">
                            <Package className="w-4 h-4 md:w-5 md:h-5 text-slate-300" />
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="font-display tracking-tight  truncate">
                              {product?.name || "Unknown Product"}
                            </span>
                            <span className="text-[10px] text-slate-400 font-medium truncate">
                              {product?.sku || "NO SKU"}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className="font-black  text-amber-700">
                          {qty > 0 ? "+" : ""}
                          {qty.toFixed(2)}
                        </span>
                      </td>
                      <td className="hidden lg:table-cell p-4  text-slate-500 max-w-[420px] truncate">
                        {t.notes || "No notes"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

          <div className="flex flex-col sm:flex-row items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/30 gap-4">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              {filteredStockCounts?.length
                ? `Showing ${startIndex + 1}-${Math.min(startIndex + ITEMS_PER_PAGE, filteredStockCounts.length)} of ${filteredStockCounts.length}`
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
    </Layout>
  );
}
