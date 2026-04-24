import { Layout } from "@/components/layout";
import { PageHeader } from "@/components/page-header";
import { useProducts } from "@/hooks/use-products";
import { useInventoryAdjust } from "@/hooks/use-inventory";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useBranchContext } from "@/lib/branch-context";
import { Card, CardContent } from "@/components/ui/card";
import { Search, ChevronLeft, ChevronRight, Package, PlusCircle, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

const ITEMS_PER_PAGE = 20;
const ADJUSTMENT_TYPES = ["ADJUSTMENT", "SHRINKAGE", "CORRECTION", "DAMAGE", "EXPIRY"] as const;

type AdjustmentType = (typeof ADJUSTMENT_TYPES)[number];

type DraftAdjustment = {
  targetQuantity: string;
  type: AdjustmentType;
  notes: string;
};

const DEFAULT_DRAFT: DraftAdjustment = {
  targetQuantity: "",
  type: "ADJUSTMENT",
  notes: "",
};

export default function InventoryAdjustmentsPage() {
  const { activeCompanyId } = useActiveCompany();
  const { selectedBranchId } = useBranchContext();
  const { toast } = useToast();

  const companyId = activeCompanyId || 0;
  const branchId = selectedBranchId || undefined;

  const { data: products, isLoading } = useProducts(companyId, branchId);
  const adjustMutation = useInventoryAdjust(companyId);

  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [drafts, setDrafts] = useState<Record<number, DraftAdjustment>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showOnlyChanged, setShowOnlyChanged] = useState(false);

  const trackedProducts = useMemo(
    () => (products || []).filter((p) => p.isTracked && p.productType !== "service"),
    [products],
  );

  const getCurrentStock = (product: (typeof trackedProducts)[number]) => Number(product.branchStock || product.stockLevel || 0);

  const getDraftDelta = (product: (typeof trackedProducts)[number]) => {
    const draft = drafts[product.id];
    const target = Number.parseFloat(draft?.targetQuantity || "");
    if (!draft || Number.isNaN(target)) return null;
    return target - getCurrentStock(product);
  };

  const filteredProducts = useMemo(() => {
    const query = searchTerm.toLowerCase().trim();
    const searched = query
      ? trackedProducts.filter(
          (p) =>
            p.name.toLowerCase().includes(query) ||
            (p.sku || "").toLowerCase().includes(query) ||
            (p.barcode || "").toLowerCase().includes(query),
        )
      : trackedProducts;

    if (!showOnlyChanged) return searched;

    return searched.filter((p) => {
      const delta = getDraftDelta(p);
      return delta !== null && delta !== 0;
    });
  }, [trackedProducts, searchTerm, showOnlyChanged, drafts]);

  const totalPages = Math.ceil((filteredProducts?.length || 0) / ITEMS_PER_PAGE);
  const currentFilteredPage = Math.min(currentPage, totalPages || 1);
  const displayStart = (currentFilteredPage - 1) * ITEMS_PER_PAGE;

  const paginatedProducts = useMemo(() => {
    return filteredProducts?.slice(displayStart, displayStart + ITEMS_PER_PAGE);
  }, [filteredProducts, displayStart]);

  const changedItems = useMemo(() => {
    return Object.entries(drafts)
      .map(([productId, draft]) => {
        const id = Number(productId);
        const product = trackedProducts.find((p) => p.id === id);
        const currentStock = Number(product?.branchStock || product?.stockLevel || 0);
        const targetStock = Number.parseFloat(draft.targetQuantity);
        const delta = targetStock - currentStock;

        return {
          productId: id,
          quantity: delta,
          type: draft.type,
          notes: draft.notes.trim(),
          targetStock,
        };
      })
      .filter((d) => !Number.isNaN(d.targetStock) && d.quantity !== 0);
  }, [drafts, trackedProducts]);

  const changedItemsSet = useMemo(() => new Set(changedItems.map((item) => item.productId)), [changedItems]);

  const previewRows = useMemo(
    () =>
      (paginatedProducts || []).map((product) => {
        const rowDraft = drafts[product.id] || DEFAULT_DRAFT;
        const currentStock = getCurrentStock(product);
        const targetStock = Number.parseFloat(rowDraft.targetQuantity);
        const hasValidTarget = !Number.isNaN(targetStock);
        const delta = hasValidTarget ? targetStock - currentStock : 0;

        return {
          product,
          rowDraft,
          currentStock,
          hasValidTarget,
          targetStock,
          delta,
          isChanged: hasValidTarget && delta !== 0,
        };
      }),
    [paginatedProducts, drafts],
  );

  const updateDraft = (productId: number, patch: Partial<DraftAdjustment>) => {
    setDrafts((prev) => ({
      ...prev,
      [productId]: {
        ...DEFAULT_DRAFT,
        ...(prev[productId] || {}),
        ...patch,
      },
    }));
  };

  const resetDrafts = () => {
    setDrafts({});
  };

  const commitAdjustments = async () => {
    if (changedItems.length === 0) {
      toast({
        title: "No adjustments to submit",
        description: "Edit at least one product to a new stock quantity before committing.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const results = await Promise.allSettled(
        changedItems.map((item) =>
          adjustMutation.mutateAsync({
            productId: item.productId,
            quantity: item.quantity,
            type: item.type,
            notes: item.notes || undefined,
            branchId,
          }),
        ),
      );

      const successfulIds: number[] = [];
      let failedCount = 0;

      results.forEach((result, idx) => {
        if (result.status === "fulfilled") {
          successfulIds.push(changedItems[idx].productId);
        } else {
          failedCount += 1;
        }
      });

      if (successfulIds.length > 0) {
        setDrafts((prev) => {
          const next = { ...prev };
          successfulIds.forEach((id) => delete next[id]);
          return next;
        });
      }

      if (failedCount === 0) {
        toast({
          title: "Adjustments saved",
          description: `Successfully committed ${successfulIds.length} stock adjustments.`,
        });
      } else {
        toast({
          title: "Partial success",
          description: `${successfulIds.length} saved, ${failedCount} failed. Failed rows are still on screen.`,
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Adjustment failed",
        description: "Could not commit adjustments right now.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Layout>
      <PageHeader
        title="Stock Adjustments"
        subtitle="Search products and adjust multiple items from one screen"
        actions={
          <>
            <Link href="/inventory/stock-counts">
              <Button variant="outline" className="rounded-xl">
                <Package className="w-4 h-4 mr-2" />
                Stock Counts
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
            placeholder="Search products by name, SKU, or barcode..."
            className="pl-12 h-12 rounded-xl border-slate-200 bg-white shadow-sm focus:ring-violet-500/20 focus:border-violet-500 font-medium transition-all"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
          />
        </div>

        <div className="flex items-center gap-3 px-4 h-12 rounded-xl bg-white border border-slate-200 shadow-sm">
          <Switch
            id="only-changed"
            checked={showOnlyChanged}
            onCheckedChange={(checked) => {
              setShowOnlyChanged(checked);
              setCurrentPage(1);
            }}
          />
          <label htmlFor="only-changed" className="text-xs font-bold text-slate-600 uppercase tracking-wide cursor-pointer">
            Only Changed Rows
          </label>
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
            Reset Search
          </Button>
        )}
      </div>

      <Card className="border-none shadow-xl shadow-slate-200/50 bg-white/80 backdrop-blur-sm rounded-[2rem] overflow-hidden ring-1 ring-slate-100">
        <CardContent className="p-0 overflow-x-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-100">
                <th className="p-5 font-black text-slate-400 uppercase tracking-widest text-[10px]">Product</th>
                <th className="hidden md:table-cell p-5 font-black text-slate-400 uppercase tracking-widest text-[10px]">Current Stock</th>
                <th className="p-5 font-black text-slate-400 uppercase tracking-widest text-[10px]">Type</th>
                <th className="p-5 font-black text-slate-400 uppercase tracking-widest text-[10px]">New Stock Qty</th>
                <th className="hidden lg:table-cell p-5 font-black text-slate-400 uppercase tracking-widest text-[10px]">Live Diff</th>
                <th className="hidden xl:table-cell p-5 font-black text-slate-400 uppercase tracking-widest text-[10px]">Notes</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-600"></div>
                      Loading products...
                    </div>
                  </td>
                </tr>
              ) : previewRows?.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-slate-500">
                    <p className="font-bold text-lg">No products found</p>
                    <p className="text-sm">Try a different search term or disable changed-only filter</p>
                  </td>
                </tr>
              ) : (
                previewRows?.map(({ product, rowDraft, currentStock, hasValidTarget, targetStock, delta, isChanged }) => (
                  <tr
                    key={product.id}
                    className={cn(
                      "group border-b border-slate-50 hover:bg-slate-50/50 transition-colors",
                      changedItemsSet.has(product.id) && "bg-violet-50/30",
                    )}
                  >
                    <td className="p-4">
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-slate-100 flex items-center justify-center ring-1 ring-slate-200 shrink-0">
                          <Package className="w-4 h-4 md:w-5 md:h-5 text-slate-300" />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="font-display tracking-tight text-[13px] md:text-sm truncate">{product.name}</span>
                          <span className="text-[10px] text-slate-400 font-medium truncate">{product.sku || "NO SKU"}</span>
                        </div>
                      </div>
                    </td>

                    <td className="hidden md:table-cell p-4">
                      <span className="px-2 py-0.5 rounded-md font-mono text-[11px] font-bold bg-slate-100 text-slate-700">{currentStock}</span>
                    </td>

                    <td className="p-4">
                      <Select value={rowDraft.type} onValueChange={(v) => updateDraft(product.id, { type: v as AdjustmentType })}>
                        <SelectTrigger className="w-[150px] h-9 rounded-xl bg-white border-slate-200 font-bold text-[11px]">
                          <SelectValue placeholder="Type" />
                        </SelectTrigger>
                        <SelectContent>
                          {ADJUSTMENT_TYPES.map((type) => (
                            <SelectItem key={type} value={type}>
                              {type}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>

                    <td className="p-4">
                      <Input
                        type="number"
                        step="0.01"
                        placeholder={`${currentStock}`}
                        value={rowDraft.targetQuantity}
                        onChange={(e) => updateDraft(product.id, { targetQuantity: e.target.value })}
                        className="h-9 rounded-xl border-slate-200 bg-white font-mono font-bold text-sm"
                      />
                    </td>

                    <td className="hidden lg:table-cell p-4">
                      {!rowDraft.targetQuantity ? (
                        <span className="text-xs text-slate-400">Enter new stock qty</span>
                      ) : !hasValidTarget ? (
                        <span className="text-xs text-rose-600 font-semibold">Invalid number</span>
                      ) : (
                        <div className="flex flex-col">
                          <span className="text-xs text-slate-600 font-medium">
                            {currentStock} -&gt; {targetStock.toFixed(2)}
                          </span>
                          <span
                            className={cn(
                              "text-[11px] font-black",
                              delta === 0 ? "text-slate-400" : delta > 0 ? "text-emerald-600" : "text-rose-600",
                            )}
                          >
                            Delta {delta > 0 ? "+" : ""}
                            {delta.toFixed(2)} {isChanged ? "" : "(no change)"}
                          </span>
                        </div>
                      )}
                    </td>

                    <td className="hidden xl:table-cell p-4">
                      <Input
                        placeholder="Reason (optional)"
                        value={rowDraft.notes}
                        onChange={(e) => updateDraft(product.id, { notes: e.target.value })}
                        className="h-9 rounded-xl border-slate-200 bg-white"
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          <div className="flex flex-col lg:flex-row items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/30 gap-4">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              {filteredProducts?.length
                ? `Showing ${displayStart + 1}-${Math.min(displayStart + ITEMS_PER_PAGE, filteredProducts.length)} of ${filteredProducts.length}`
                : "No entries"}
            </div>

            <div className="flex items-center gap-2">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mr-2">
                Page {currentFilteredPage} of {totalPages || 1}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentFilteredPage === 1}
                className="rounded-xl h-8 text-[10px] font-bold border-slate-200"
              >
                <ChevronLeft className="h-3 w-3 mr-1" />
                Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.min(totalPages || 1, p + 1))}
                disabled={currentFilteredPage >= totalPages || totalPages === 0}
                className="rounded-xl h-8 text-[10px] font-bold border-slate-200"
              >
                Next
                <ChevronRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="sticky bottom-4 z-30 mt-4">
        <div className="rounded-2xl border border-slate-200 bg-white/95 backdrop-blur-xl shadow-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Pending {changedItems.length}</span>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Changed View {showOnlyChanged ? "On" : "Off"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={resetDrafts} className="rounded-xl" disabled={isSubmitting || changedItems.length === 0}>
              Reset
            </Button>
            <Button className="rounded-xl" onClick={commitAdjustments} disabled={isSubmitting || changedItems.length === 0}>
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Commit Adjustments"
              )}
            </Button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
