import { Layout } from "@/components/layout";
import { PageHeader } from "@/components/page-header";
import { useState, useRef, useMemo } from "react";
import { useProducts } from "@/hooks/use-products";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useBranchContext } from "@/lib/branch-context";
import { useInventoryAdjust } from "@/hooks/use-inventory";
import { type Product } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Search,
  Download,
  Upload,
  ChevronLeft,
  CheckCircle2,
  AlertCircle,
  TrendingDown,
  TrendingUp,
  ShieldCheck,
  Loader2,
  ArrowRightLeft,
  Package,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";

export default function StockTakePage() {
  const [, setLocation] = useLocation();
  const { activeCompanyId } = useActiveCompany();
  const { selectedBranchId } = useBranchContext();
  const companyId = activeCompanyId || 0;
  const branchId = selectedBranchId || undefined;

  const { toast } = useToast();
  const { data: allProducts, isLoading } = useProducts(companyId, branchId);
  const adjustMutation = useInventoryAdjust(companyId);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<Map<number, Product>>(new Map());
  const [counts, setCounts] = useState<Map<number, number>>(new Map());
  const [isProcessing, setIsProcessing] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const trackedProducts = useMemo(() => allProducts?.filter((p) => p.isTracked && !p.isService) || [], [allProducts]);

  const filteredProducts = useMemo(
    () =>
      trackedProducts.filter(
        (p) => p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.sku?.toLowerCase().includes(searchTerm.toLowerCase()),
      ),
    [trackedProducts, searchTerm],
  );

  const discrepancyCount = useMemo(
    () =>
      Array.from(counts.entries()).filter(
        ([id, cnt]) => cnt !== Number(selectedProducts.get(id)?.branchStock || selectedProducts.get(id)?.stockLevel || 0),
      ).length,
    [counts, selectedProducts],
  );

  const toggleProduct = (product: Product) => {
    const newSelected = new Map(selectedProducts);
    if (newSelected.has(product.id)) {
      newSelected.delete(product.id);
    } else {
      newSelected.set(product.id, product);
    }
    setSelectedProducts(newSelected);
  };

  const addAll = () => {
    const newSelected = new Map<number, Product>();
    trackedProducts.forEach((p) => newSelected.set(p.id, p));
    setSelectedProducts(newSelected);
  };

  const clearAll = () => {
    setSelectedProducts(new Map());
  };

  const handleNextToCount = () => {
    if (selectedProducts.size === 0) {
      toast({
        title: "Selection Required",
        description: "Please select at least one product to continue.",
        variant: "destructive",
      });
      return;
    }

    const newCounts = new Map<number, number>();
    selectedProducts.forEach((p) => newCounts.set(p.id, Number(p.branchStock || p.stockLevel || 0)));
    setCounts(newCounts);
    setStep(2);
  };

  const updateCount = (productId: number, val: string) => {
    const num = parseFloat(val);
    const newCounts = new Map(counts);
    newCounts.set(productId, Number.isNaN(num) ? 0 : num);
    setCounts(newCounts);
  };

  const exportSheet = () => {
    const data = Array.from(selectedProducts.values()).map((p) => ({
      ID: p.id,
      "Product Name": p.name,
      SKU: p.sku || "N/A",
      "Expected Stock": Number(p.branchStock || p.stockLevel || 0),
      "Counted Stock": Number(p.branchStock || p.stockLevel || 0),
      Unit: p.unit || "units",
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Stock Take");
    XLSX.writeFile(wb, `Stock-Take-${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: "binary" });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws) as any[];

      const newCounts = new Map(counts);
      data.forEach((row) => {
        const id = row.ID;
        const counted = row["Counted Stock"];
        if (id && selectedProducts.has(id) && typeof counted === "number") {
          newCounts.set(id, counted);
        }
      });
      setCounts(newCounts);
      toast({
        title: "Import Successful",
        description: `Updated counts for ${data.length} items.`,
      });
    };
    reader.readAsBinaryString(file);
    e.target.value = "";
  };

  const varianceData = useMemo(() => {
    return Array.from(selectedProducts.values()).map((p) => {
      const expected = Number(p.branchStock || p.stockLevel || 0);
      const counted = counts.get(p.id) || 0;
      const variance = counted - expected;
      const unitCost = Number(p.unitCost || 0);
      const varianceValue = variance * unitCost;

      return {
        ...p,
        expected,
        counted,
        variance,
        varianceValue,
      };
    });
  }, [selectedProducts, counts]);

  const totalVarianceValue = useMemo(() => varianceData.reduce((sum, item) => sum + item.varianceValue, 0), [varianceData]);

  const handleCommit = async () => {
    setIsProcessing(true);
    try {
      const itemsToAdjust = varianceData.filter((v) => v.variance !== 0);

      for (const item of itemsToAdjust) {
        await adjustMutation.mutateAsync({
          productId: item.id,
          quantity: item.variance,
          type: "CORRECTION",
          notes: `Stock Take Correction - Expected: ${item.expected}, Counted: ${item.counted}`,
          branchId,
        });
      }

      toast({
        title: "Inventory Updated",
        description: `Successfully adjusted ${itemsToAdjust.length} items based on stock take counts.`,
      });
      setLocation("/inventory/adjustments");
    } catch (error) {
      toast({
        title: "Error committing adjustments",
        description: "Something went wrong during the sync process.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Layout>
      <PageHeader
        title="Stock Take"
        subtitle="Count stock, review variances, and commit corrections"
        actions={
          <>
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => (step > 1 ? setStep((step - 1) as 1 | 2 | 3) : setLocation("/inventory/adjustments"))}
            >
              <ChevronLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <div className="flex bg-slate-100 rounded-xl h-10 p-1 items-center">
              {[
                { s: 1, label: "Scope" },
                { s: 2, label: "Counting" },
                { s: 3, label: "Review" },
              ].map((m) => (
                <button
                  key={m.s}
                  type="button"
                  onClick={() => setStep(m.s as 1 | 2 | 3)}
                  className={cn(
                    "px-4 h-8 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                    step === m.s ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700",
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </>
        }
      />

      {step === 1 && (
        <Card className="border-none shadow-xl shadow-slate-200/50 bg-white/80 backdrop-blur-sm rounded-[2rem] overflow-hidden ring-1 ring-slate-100 h-[calc(100vh-220px)] flex flex-col">
          <CardContent className="p-0 h-full flex flex-col">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-6 border-b border-slate-100 bg-slate-50/30">
              <div className="relative flex-1 w-full sm:max-w-sm group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 group-hover:text-violet-500 transition-colors" />
                <Input
                  placeholder="Search products..."
                  className="pl-12 h-12 rounded-xl border-slate-200 bg-white shadow-sm focus:ring-violet-500/20 focus:border-violet-500 font-medium transition-all"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="rounded-xl" onClick={addAll}>
                  Select All
                </Button>
                <Button variant="ghost" className="rounded-xl" onClick={clearAll}>
                  Clear
                </Button>
              </div>
            </div>

            <ScrollArea className="flex-1 px-4 py-3">
              {isLoading ? (
                <div className="py-24 text-center text-slate-500">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-violet-600" />
                  Loading products...
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="py-24 text-center text-slate-500">
                  <AlertCircle className="w-10 h-10 mx-auto mb-3 text-slate-300" />
                  No tracked products match your search.
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                  {filteredProducts.map((p) => {
                    const isSelected = selectedProducts.has(p.id);
                    return (
                      <button
                        type="button"
                        key={p.id}
                        onClick={() => toggleProduct(p)}
                        className={cn(
                          "text-left p-4 rounded-xl border transition-colors bg-white hover:bg-slate-50",
                          isSelected ? "border-violet-500 ring-1 ring-violet-200" : "border-slate-200",
                        )}
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="min-w-0">
                            <p className="font-bold text-sm text-slate-900 truncate">{p.name}</p>
                            <p className="text-[10px] text-slate-400 font-mono truncate">{p.sku || "N/A"}</p>
                          </div>
                          {isSelected ? <CheckCircle2 className="w-4 h-4 text-violet-600 shrink-0" /> : null}
                        </div>
                        <p className="font-mono font-bold text-slate-700 text-sm">{p.branchStock || p.stockLevel || 0}</p>
                      </button>
                    );
                  })}
                </div>
              )}
            </ScrollArea>

            <div className="flex flex-col sm:flex-row items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/30 gap-4">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Selected {selectedProducts.size} items</div>
              <Button className="rounded-xl" onClick={handleNextToCount}>
                Proceed to Counting
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card className="border-none shadow-xl shadow-slate-200/50 bg-white/80 backdrop-blur-sm rounded-[2rem] overflow-hidden ring-1 ring-slate-100 h-[calc(100vh-220px)] flex flex-col">
          <CardContent className="p-0 h-full flex flex-col">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-6 border-b border-slate-100 bg-slate-50/30">
              <div>
                <h3 className="text-lg font-black text-slate-900">Count Stock</h3>
                <p className="text-sm text-muted-foreground">Enter physical counts for selected products.</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="rounded-xl" onClick={exportSheet}>
                  <Download className="w-4 h-4 mr-2" />
                  Export
                </Button>
                <Button className="rounded-xl" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="w-4 h-4 mr-2" />
                  Import
                </Button>
                <input type="file" ref={fileInputRef} onChange={handleImport} accept=".csv,.xlsx,.xls" className="hidden" />
              </div>
            </div>

            <ScrollArea className="flex-1">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-100">
                    <th className="p-4 font-black text-slate-400 uppercase tracking-widest text-[10px] w-14 text-center">#</th>
                    <th className="p-4 font-black text-slate-400 uppercase tracking-widest text-[10px]">Product</th>
                    <th className="p-4 font-black text-slate-400 uppercase tracking-widest text-[10px] text-center">Expected</th>
                    <th className="p-4 font-black text-slate-400 uppercase tracking-widest text-[10px] text-center">Counted</th>
                    <th className="p-4 font-black text-slate-400 uppercase tracking-widest text-[10px] text-right">Variance</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from(selectedProducts.values()).map((p, idx) => {
                    const expected = Number(p.branchStock || p.stockLevel || 0);
                    const counted = counts.get(p.id) || 0;
                    const variance = counted - expected;

                    return (
                      <tr key={p.id} className="group border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                        <td className="p-4 text-center text-[10px] font-bold text-slate-400">{idx + 1}</td>
                        <td className="p-4">
                          <div className="flex flex-col min-w-0">
                            <span className="font-bold text-sm text-slate-900 truncate">{p.name}</span>
                            <span className="text-[10px] text-slate-400 font-mono truncate">{p.sku || "N/A"}</span>
                          </div>
                        </td>
                        <td className="p-4 text-center">
                          <Badge variant="outline" className="font-mono text-xs text-slate-600">
                            {expected}
                          </Badge>
                        </td>
                        <td className="p-4 text-center">
                          <Input
                            type="number"
                            className="h-9 rounded-xl border-slate-200 bg-white text-center font-mono font-bold max-w-[120px] mx-auto"
                            value={counts.get(p.id) ?? ""}
                            onChange={(e) => updateCount(p.id, e.target.value)}
                          />
                        </td>
                        <td className="p-4 text-right">
                          {variance === 0 ? (
                            <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Matched</span>
                          ) : (
                            <Badge
                              className={cn(
                                "font-mono text-xs",
                                variance > 0 ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-rose-50 text-rose-700 border-rose-100",
                              )}
                            >
                              {variance > 0 ? "+" : ""}
                              {variance.toFixed(2)}
                            </Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </ScrollArea>

            <div className="flex flex-col sm:flex-row items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/30 gap-4">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Audited {selectedProducts.size} | Discrepancies {discrepancyCount}
              </div>
              <Button className="rounded-xl" onClick={() => setStep(3)}>
                Review Variances
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <Card className="lg:col-span-8 border-none shadow-xl shadow-slate-200/50 bg-white/80 backdrop-blur-sm rounded-[2rem] overflow-hidden ring-1 ring-slate-100 h-[calc(100vh-220px)] flex flex-col">
            <CardContent className="p-0 h-full flex flex-col">
              <div className="p-6 border-b border-slate-100 bg-slate-50/30">
                <h3 className="text-lg font-black text-slate-900">Variance Review</h3>
                <p className="text-sm text-muted-foreground">Confirm variance impact before committing corrections.</p>
              </div>

              <ScrollArea className="flex-1">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-100">
                      <th className="p-4 font-black text-slate-400 uppercase tracking-widest text-[10px]">Product</th>
                      <th className="p-4 font-black text-slate-400 uppercase tracking-widest text-[10px] text-center">Variance</th>
                      <th className="p-4 font-black text-slate-400 uppercase tracking-widest text-[10px] text-right">Value Impact</th>
                    </tr>
                  </thead>
                  <tbody>
                    {varianceData.map((item) => (
                      <tr key={item.id} className="group border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                        <td className="p-4">
                          <div className="flex flex-col min-w-0">
                            <span className="font-bold text-sm text-slate-900 truncate">{item.name}</span>
                            <span className="text-[10px] text-slate-400 truncate">
                              Expected {item.expected} | Counted {item.counted}
                            </span>
                          </div>
                        </td>
                        <td className="p-4 text-center">
                          <Badge
                            className={cn(
                              "font-mono text-xs",
                              item.variance === 0
                                ? "bg-slate-100 text-slate-500 border-slate-200"
                                : item.variance > 0
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                                  : "bg-rose-50 text-rose-700 border-rose-100",
                            )}
                          >
                            {item.variance > 0 ? "+" : ""}
                            {item.variance.toFixed(2)}
                          </Badge>
                        </td>
                        <td className="p-4 text-right font-mono font-bold text-sm text-slate-800">
                          {item.varianceValue < 0 ? "-" : item.varianceValue > 0 ? "+" : ""}$
                          {Math.abs(item.varianceValue).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollArea>
            </CardContent>
          </Card>

          <div className="lg:col-span-4 flex flex-col gap-6">
            <Card
              className={cn(
                "border-none shadow-xl shadow-slate-200/50 rounded-[2rem] overflow-hidden ring-1 p-8",
                totalVarianceValue === 0
                  ? "bg-white/80 ring-slate-100"
                  : totalVarianceValue > 0
                    ? "bg-emerald-50/80 ring-emerald-100"
                    : "bg-rose-50/80 ring-rose-100",
              )}
            >
              <CardContent className="p-0 text-center">
                <div className="mx-auto w-14 h-14 rounded-xl flex items-center justify-center mb-4 bg-white ring-1 ring-slate-200">
                  {totalVarianceValue === 0 ? (
                    <ShieldCheck className="w-7 h-7 text-slate-500" />
                  ) : totalVarianceValue > 0 ? (
                    <TrendingUp className="w-7 h-7 text-emerald-600" />
                  ) : (
                    <TrendingDown className="w-7 h-7 text-rose-600" />
                  )}
                </div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Total Impact</p>
                <h3 className="text-3xl font-black tracking-tight text-slate-900">
                  {totalVarianceValue < 0 ? "-" : totalVarianceValue > 0 ? "+" : ""}$
                  {Math.abs(totalVarianceValue).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </h3>
              </CardContent>
            </Card>

            <Card className="border-none shadow-xl shadow-slate-200/50 bg-white/80 backdrop-blur-sm rounded-[2rem] overflow-hidden ring-1 ring-slate-100 p-6">
              <CardContent className="p-0 space-y-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                    <ArrowRightLeft className="w-5 h-5 text-slate-600" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Corrections</p>
                    <p className="font-black text-slate-900">{varianceData.filter((v) => v.variance !== 0).length} Items</p>
                  </div>
                </div>

                <Button
                  className="w-full rounded-xl"
                  disabled={isProcessing || varianceData.filter((v) => v.variance !== 0).length === 0}
                  onClick={handleCommit}
                >
                  {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Commit Reconciliation"}
                </Button>

                <Button variant="ghost" className="w-full rounded-xl" onClick={() => setStep(2)}>
                  Back to Counting
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </Layout>
  );
}
