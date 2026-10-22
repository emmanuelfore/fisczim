import { Layout } from "@/components/layout";
import { useState, useMemo } from "react";
import { useProducts, useBulkAdjustPrice } from "@/hooks/use-products";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Link, useLocation } from "wouter";
import {
  Loader2,
  ChevronLeft,
  Search,
  SlidersHorizontal,
  AlertTriangle,
  Coins,
  Percent,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function BulkPriceAdjustmentPage() {
  const [, setLocation] = useLocation();
  const { activeCompanyId } = useActiveCompany();
  const companyId = activeCompanyId || 0;
  const { toast } = useToast();

  // Queries
  const { data: allProducts, isLoading: productsLoading } =
    useProducts(companyId);
  const bulkAdjustMutation = useBulkAdjustPrice(companyId);

  const { data: categories } = useQuery<any[]>({
    queryKey: ["/api/product-categories", companyId],
    queryFn: async () => {
      const res = await apiFetch(
        `/api/product-categories?companyId=${companyId}`,
      );
      if (!res.ok) throw new Error("Failed to fetch categories");
      return res.json();
    },
    enabled: !!companyId,
  });

  // State
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [draftPrices, setDraftPrices] = useState<Record<number, string>>({});

  // Bulk math operations state
  const [bulkAction, setBulkAction] = useState<
    | "percentage_increase"
    | "percentage_decrease"
    | "fixed_increase"
    | "fixed_decrease"
    | "set_price"
  >("percentage_increase");
  const [bulkValue, setBulkValue] = useState("");
  const [bulkBasis, setBulkBasis] = useState<"current_price" | "cost_price">(
    "current_price",
  );
  const [applyTarget, setApplyTarget] = useState<"filtered" | "all">(
    "filtered",
  );

  // Metadata state
  const [reason, setReason] = useState("");

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);

  // Filter products
  const filteredProducts = useMemo(() => {
    if (!allProducts) return [];
    return allProducts.filter((product) => {
      const matchesSearch =
        product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (product.sku &&
          product.sku.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesCategory =
        selectedCategory === "all" || product.category === selectedCategory;

      return matchesSearch && matchesCategory;
    });
  }, [allProducts, searchTerm, selectedCategory]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
  const paginatedProducts = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredProducts.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredProducts, currentPage, itemsPerPage]);

  // Apply Bulk Adjustment Math logic
  const handleApplyBulkAction = () => {
    const value = parseFloat(bulkValue);
    if (isNaN(value) || value < 0) {
      toast({
        title: "Invalid Value",
        description: "Please enter a valid positive number for adjustment.",
        variant: "destructive",
      });
      return;
    }

    const targetList =
      applyTarget === "filtered" ? filteredProducts : allProducts || [];
    if (targetList.length === 0) {
      toast({
        title: "No Products",
        description: "There are no products in the selected scope to adjust.",
        variant: "destructive",
      });
      return;
    }

    const updatedDrafts = { ...draftPrices };
    let successCount = 0;

    targetList.forEach((product) => {
      // Basis price calculation
      let basePrice = 0;
      if (bulkBasis === "cost_price") {
        basePrice = product.costPrice
          ? parseFloat(product.costPrice.toString())
          : 0;
      } else {
        basePrice = parseFloat(product.price.toString());
      }

      // If basis is cost price but cost price is 0 or null, skip or warn
      if (
        bulkBasis === "cost_price" &&
        (!product.costPrice || basePrice === 0)
      ) {
        return; // Skip products with no cost price when using cost price basis
      }

      let calculatedPrice = basePrice;
      switch (bulkAction) {
        case "percentage_increase":
          calculatedPrice = basePrice * (1 + value / 100);
          break;
        case "percentage_decrease":
          calculatedPrice = basePrice * (1 - value / 100);
          break;
        case "fixed_increase":
          calculatedPrice = basePrice + value;
          break;
        case "fixed_decrease":
          calculatedPrice = basePrice - value;
          break;
        case "set_price":
          calculatedPrice = value;
          break;
      }

      // Ensure price is not negative
      if (calculatedPrice < 0) {
        calculatedPrice = 0;
      }

      updatedDrafts[product.id] = calculatedPrice.toFixed(2);
      successCount++;
    });

    setDraftPrices(updatedDrafts);
    toast({
      title: "Draft prices updated",
      description: `Calculated new draft prices for ${successCount} products successfully.`,
    });
  };

  // Clear all drafts
  const handleClearDrafts = () => {
    setDraftPrices({});
    toast({
      title: "Drafts cleared",
      description: "All draft price adjustments have been reset.",
    });
  };

  // Submit adjustments
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!reason.trim()) {
      toast({
        title: "Reason Required",
        description: "Please enter a valid reason for this price change batch.",
        variant: "destructive",
      });
      return;
    }

    // Build the adjustments payload (only send products that have actual changes)
    const adjustmentsPayload = Object.entries(draftPrices)
      .map(([idStr, newPriceStr]) => {
        const productId = parseInt(idStr);
        const product = allProducts?.find((p) => p.id === productId);
        if (!product) return null;

        const currentPrice = parseFloat(product.price.toString());
        const targetPrice = parseFloat(newPriceStr);

        if (!Number.isFinite(targetPrice) || targetPrice < 0) return null;

        // Skip if new price is identical to current price
        if (currentPrice === targetPrice) return null;

        return {
          productId,
          newPrice: targetPrice,
        };
      })
      .filter(
        (adj): adj is { productId: number; newPrice: number } => adj !== null,
      );

    if (adjustmentsPayload.length === 0) {
      toast({
        title: "No Changes To Commit",
        description:
          "You haven't changed any prices or the drafts match the current prices.",
        variant: "destructive",
      });
      return;
    }

    try {
      await bulkAdjustMutation.mutateAsync({
        companyId,
        reason: reason.trim(),
        adjustments: adjustmentsPayload,
      });

      toast({
        title: "Prices Committed",
        description: `Successfully updated selling prices for ${adjustmentsPayload.length} products.`,
      });

      setDraftPrices({});
      setReason("");
      setLocation("/products");
    } catch (err: any) {
      toast({
        title: "Update Failed",
        description: err.message || "An error occurred while updating prices.",
        variant: "destructive",
      });
    }
  };

  // Check how many items actually differ
  const changedItemsCount = useMemo(() => {
    return Object.entries(draftPrices).filter(([idStr, newPriceStr]) => {
      const productId = parseInt(idStr);
      const product = allProducts?.find((p) => p.id === productId);
      if (!product) return false;
      return parseFloat(product.price.toString()) !== parseFloat(newPriceStr);
    }).length;
  }, [draftPrices, allProducts]);

  return (
    <Layout hideHeaderTitle>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link href="/products">
            <Button variant="ghost" size="icon" className="rounded-full">
              <ChevronLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-black text-slate-900 leading-none mb-1">
              Bulk Price Matrix
            </h1>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
              Global Product Catalog Pricing Control
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-8">
        {/* Filters and Bulk Math panel */}
        <Card className="lg:col-span-1 border-none shadow-xl bg-white rounded-3xl ring-1 ring-slate-100/50 flex flex-col overflow-hidden">
          <CardHeader className="border-b border-slate-50 px-6 py-4 bg-slate-50/40">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-slate-800" />
              <CardTitle className=" font-bold text-slate-900">
                Control Panel
              </CardTitle>
            </div>
            <CardDescription className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              Filters & Bulk Operations
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 flex flex-col gap-5">
            {/* Search */}
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                Search Products
              </label>
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="SKU or product name..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="pl-10 rounded-xl h-10 border-slate-100 focus:ring-primary/5 text-xs font-semibold"
                />
              </div>
            </div>

            {/* Category Filter */}
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                Filter Category
              </label>
              <Select
                value={selectedCategory}
                onValueChange={(val) => {
                  setSelectedCategory(val);
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="rounded-xl h-10 border-slate-100 focus:ring-primary/5 text-xs font-semibold">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent className="rounded-2xl border-slate-50 shadow-2xl">
                  <SelectItem
                    value="all"
                    className="text-xs font-bold rounded-xl"
                  >
                    All Categories
                  </SelectItem>
                  {categories?.map((c) => (
                    <SelectItem
                      key={c.id}
                      value={c.name}
                      className="text-xs font-bold rounded-xl"
                    >
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Bulk Actions Section */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                  Smart Adjuster
                </span>
                <Badge
                  variant="outline"
                  className="bg-slate-50 text-[9px] font-bold text-slate-500 border-slate-100 py-0.5"
                >
                  Draft Engine
                </Badge>
              </div>

              {/* Action type */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                  Operation
                </label>
                <Select
                  value={bulkAction}
                  onValueChange={(val: any) => setBulkAction(val)}
                >
                  <SelectTrigger className="rounded-xl h-9 border-slate-100 text-[11px] font-semibold">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl border-slate-50 shadow-2xl">
                    <SelectItem
                      value="percentage_increase"
                      className="text-[11px] font-bold rounded-xl"
                    >
                      % Increase
                    </SelectItem>
                    <SelectItem
                      value="percentage_decrease"
                      className="text-[11px] font-bold rounded-xl"
                    >
                      % Decrease
                    </SelectItem>
                    <SelectItem
                      value="fixed_increase"
                      className="text-[11px] font-bold rounded-xl"
                    >
                      + Fixed Amount
                    </SelectItem>
                    <SelectItem
                      value="fixed_decrease"
                      className="text-[11px] font-bold rounded-xl"
                    >
                      - Fixed Amount
                    </SelectItem>
                    <SelectItem
                      value="set_price"
                      className="text-[11px] font-bold rounded-xl"
                    >
                      = Set Fixed Price
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Basis selector */}
              {bulkAction !== "set_price" && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                    Relative To (Basis)
                  </label>
                  <Select
                    value={bulkBasis}
                    onValueChange={(val: any) => setBulkBasis(val)}
                  >
                    <SelectTrigger className="rounded-xl h-9 border-slate-100 text-[11px] font-semibold">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl border-slate-50 shadow-2xl">
                      <SelectItem
                        value="current_price"
                        className="text-[11px] font-bold rounded-xl"
                      >
                        Current Selling Price
                      </SelectItem>
                      <SelectItem
                        value="cost_price"
                        className="text-[11px] font-bold rounded-xl"
                      >
                        Cost Price (Markup Base)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Adjustment value */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                  Adjustment Amount / Value
                </label>
                <div className="relative">
                  <Input
                    type="number"
                    placeholder={
                      bulkAction.startsWith("percentage") ? "10" : "5.00"
                    }
                    value={bulkValue}
                    onChange={(e) => setBulkValue(e.target.value)}
                    className="rounded-xl h-9 border-slate-100 pr-10 text-xs font-mono font-black"
                  />
                  <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                    {bulkAction.startsWith("percentage") ? (
                      <Percent className="w-3.5 h-3.5" />
                    ) : (
                      <Coins className="w-3.5 h-3.5" />
                    )}
                  </div>
                </div>
              </div>

              {/* Apply Scope */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                  Apply Scope
                </label>
                <Select
                  value={applyTarget}
                  onValueChange={(val: any) => setApplyTarget(val)}
                >
                  <SelectTrigger className="rounded-xl h-9 border-slate-100 text-[11px] font-semibold">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl border-slate-50 shadow-2xl">
                    <SelectItem
                      value="filtered"
                      className="text-[11px] font-bold rounded-xl"
                    >
                      Filtered ({filteredProducts.length} items)
                    </SelectItem>
                    <SelectItem
                      value="all"
                      className="text-[11px] font-bold rounded-xl"
                    >
                      All Catalog ({allProducts?.length || 0} items)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2 mt-2">
                <Button
                  type="button"
                  onClick={handleApplyBulkAction}
                  className="rounded-xl h-10 bg-slate-900 text-white hover:bg-slate-800 font-black text-xs uppercase tracking-widest shadow-lg shadow-slate-900/10"
                >
                  Calculate Drafts
                </Button>
                {Object.keys(draftPrices).length > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleClearDrafts}
                    className="rounded-xl h-10 border-slate-100 hover:bg-slate-50 font-black text-xs uppercase tracking-widest text-slate-500 hover:text-slate-700"
                  >
                    Clear Drafts
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Matrix Table list */}
        <Card className="lg:col-span-3 border-none shadow-xl bg-white rounded-3xl ring-1 ring-slate-100/50 flex flex-col overflow-hidden">
          <CardHeader className="border-b border-slate-50 px-8 py-4 bg-slate-50/40 flex flex-row items-center justify-between">
            <div>
              <CardTitle className=" font-bold text-slate-900">
                Adjustments Sheet
              </CardTitle>
              <CardDescription className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                Showing {filteredProducts.length} of {allProducts?.length || 0}{" "}
                products
              </CardDescription>
            </div>
            {changedItemsCount > 0 && (
              <Badge className="bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-50 text-[10px] font-black uppercase tracking-wider py-1 px-3">
                {changedItemsCount} Products Modified
              </Badge>
            )}
          </CardHeader>

          <CardContent className="p-0 flex-1 flex flex-col justify-between">
            {productsLoading ? (
              <div className="flex flex-col items-center justify-center py-32 text-slate-400">
                <Loader2 className="w-8 h-8 animate-spin mb-4" />
                <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
                  Loading catalog matrix...
                </span>
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-32 text-slate-400">
                <AlertTriangle className="w-10 h-10 mb-4 text-slate-300" />
                <p className="font-bold text-slate-800 mb-1">
                  No products found
                </p>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Try modifying search filters
                </p>
              </div>
            ) : (
              <div className="flex flex-col h-full">
                <ScrollArea className="flex-1">
                  <div className="w-full overflow-auto">
                    <Table>
                      <TableHeader className="bg-slate-50/30">
                        <TableRow className="border-b border-slate-100">
                          <TableHead className="w-10 text-center font-black text-slate-400 text-[9px] uppercase tracking-wider py-3">
                            #
                          </TableHead>
                          <TableHead className="font-black text-slate-400 text-[9px] uppercase tracking-wider">
                            Product details
                          </TableHead>
                          <TableHead className="w-28 text-right font-black text-slate-400 text-[9px] uppercase tracking-wider">
                            Cost Price
                          </TableHead>
                          <TableHead className="w-28 text-right font-black text-slate-400 text-[9px] uppercase tracking-wider">
                            Current Price
                          </TableHead>
                          <TableHead className="w-36 text-center font-black text-slate-400 text-[9px] uppercase tracking-wider">
                            New Price
                          </TableHead>
                          <TableHead className="w-36 text-center font-black text-slate-400 text-[9px] uppercase tracking-wider">
                            Markup / Margin
                          </TableHead>
                          <TableHead className="w-36 text-center font-black text-slate-400 text-[9px] uppercase tracking-wider">
                            Variance
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedProducts.map((product, idx) => {
                          const originalPrice = parseFloat(
                            product.price.toString(),
                          );
                          const costPrice = product.costPrice
                            ? parseFloat(product.costPrice.toString())
                            : 0;

                          // Check if we have draft price
                          const newPriceStr =
                            draftPrices[product.id] !== undefined
                              ? draftPrices[product.id]
                              : "";
                          const hasDraft = newPriceStr !== "";
                          const newPrice = hasDraft
                            ? parseFloat(newPriceStr)
                            : originalPrice;

                          // Difference
                          const diff = newPrice - originalPrice;
                          const pct =
                            originalPrice > 0
                              ? (diff / originalPrice) * 100
                              : 0;

                          // Profit Margin relative to cost
                          const markup =
                            costPrice > 0
                              ? ((newPrice - costPrice) / costPrice) * 100
                              : null;
                          const margin =
                            newPrice > 0
                              ? ((newPrice - costPrice) / newPrice) * 100
                              : null;
                          const isNegativeMargin =
                            costPrice > 0 && newPrice < costPrice;

                          return (
                            <TableRow
                              key={product.id}
                              className="group hover:bg-slate-50/50 border-b border-slate-50 transition-all"
                            >
                              <TableCell className="text-center align-middle py-2.5">
                                <span className="text-[10px] font-black text-slate-300">
                                  {(currentPage - 1) * itemsPerPage + idx + 1}
                                </span>
                              </TableCell>
                              <TableCell className="align-middle">
                                <div className="flex flex-col">
                                  <span className="font-bold text-slate-800  leading-tight group-hover:text-primary transition-colors">
                                    {product.name}
                                  </span>
                                  <div className="flex items-center gap-1.5 mt-0.5">
                                    <span className="text-[9px] font-black text-slate-400 uppercase font-mono tracking-wider">
                                      {product.sku || "No SKU"}
                                    </span>
                                    {product.category && (
                                      <>
                                        <span className="w-1 h-1 rounded-full bg-slate-200" />
                                        <Badge
                                          variant="outline"
                                          className="text-[8px] font-black uppercase text-slate-400 border-slate-100 py-0 px-1.5 bg-slate-50"
                                        >
                                          {product.category}
                                        </Badge>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="text-right align-middle font-mono text-[11px] font-semibold text-slate-500">
                                {costPrice > 0
                                  ? `$${costPrice.toFixed(2)}`
                                  : "-"}
                              </TableCell>
                              <TableCell className="text-right align-middle font-mono text-[11px] font-bold text-slate-600">
                                ${originalPrice.toFixed(2)}
                              </TableCell>
                              <TableCell className="align-middle py-1 text-center">
                                <div className="relative inline-block w-28">
                                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-400">
                                    $
                                  </span>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    placeholder={originalPrice.toFixed(2)}
                                    value={newPriceStr}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setDraftPrices({
                                        ...draftPrices,
                                        [product.id]: val,
                                      });
                                    }}
                                    className={`pl-6 h-8 text-xs font-mono font-black text-center rounded-lg border-slate-100 focus:ring-primary/5 shadow-none ${
                                      hasDraft
                                        ? "bg-amber-50/20 border-amber-200 text-amber-900 focus:border-amber-400"
                                        : ""
                                    }`}
                                  />
                                </div>
                              </TableCell>
                              <TableCell className="align-middle text-center">
                                {costPrice > 0 ? (
                                  <div className="flex flex-col items-center">
                                    <span
                                      className={`text-[10px] font-bold ${isNegativeMargin ? "text-rose-600 font-extrabold" : "text-slate-600"}`}
                                    >
                                      Margin:{" "}
                                      {margin !== null
                                        ? `${margin.toFixed(1)}%`
                                        : "-"}
                                    </span>
                                    <span className="text-[8px] text-slate-400 font-bold uppercase tracking-tight">
                                      Markup:{" "}
                                      {markup !== null
                                        ? `${markup.toFixed(1)}%`
                                        : "-"}
                                    </span>
                                    {isNegativeMargin && (
                                      <Badge className="bg-rose-50 text-rose-600 border-rose-100 text-[8px] font-bold uppercase py-0 px-1 mt-0.5 flex gap-0.5 items-center">
                                        <AlertTriangle className="w-2 h-2 text-rose-500" />{" "}
                                        Loss-Selling
                                      </Badge>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-[10px] font-bold text-slate-400">
                                    No Cost
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="align-middle text-center">
                                {hasDraft && diff !== 0 ? (
                                  <Badge
                                    className={`text-[9px] font-black tracking-wider uppercase py-0.5 px-2 ${
                                      diff > 0
                                        ? "bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-50"
                                        : "bg-rose-50 text-rose-700 border-rose-100 hover:bg-rose-50"
                                    }`}
                                  >
                                    {diff > 0 ? "+" : ""}
                                    {diff.toFixed(2)} ({diff > 0 ? "+" : ""}
                                    {pct.toFixed(1)}%)
                                  </Badge>
                                ) : (
                                  <span className="text-[10px] text-slate-300 font-black">
                                    —
                                  </span>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </ScrollArea>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-6 py-4 border-t border-slate-50 bg-slate-50/10">
                    <span className="text-xs text-slate-400 font-bold uppercase">
                      Page {currentPage} of {totalPages}
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={currentPage === 1}
                        onClick={() =>
                          setCurrentPage((c) => Math.max(1, c - 1))
                        }
                        className="rounded-xl h-8 w-8 hover:bg-slate-100"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={currentPage === totalPages}
                        onClick={() =>
                          setCurrentPage((c) => Math.min(totalPages, c + 1))
                        }
                        className="rounded-xl h-8 w-8 hover:bg-slate-100"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Commit Controls panel (matches bottom log controls) */}
      {changedItemsCount > 0 && (
        <Card className="border-none shadow-2xl bg-white rounded-3xl overflow-hidden ring-1 ring-slate-100/50 mb-12">
          <form onSubmit={handleSubmit}>
            <CardContent className="p-6 bg-slate-900 text-white flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="flex flex-col md:flex-row gap-6 items-start md:items-center flex-1 w-full">
                <div className="flex flex-col">
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-0.5">
                    Price Adjustment Batch
                  </span>
                  <span className="text-xl font-black">
                    {changedItemsCount}{" "}
                    <span className="text-[10px] font-bold text-slate-500">
                      Products Modified
                    </span>
                  </span>
                </div>

                <div className="hidden md:block w-px h-10 bg-white/10" />

                <div className="flex flex-col gap-1 flex-1 w-full">
                  <label className="text-[9px] font-bold uppercase text-slate-400 tracking-wider">
                    Adjustment Reason (Required)
                  </label>
                  <Input
                    placeholder="E.g., Suppliers increased pricing, Annual pricing revision..."
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    required
                    className="rounded-xl h-11 bg-white/5 border-white/10 focus:ring-primary/10 text-xs shadow-none text-white placeholder-slate-500 font-medium"
                  />
                </div>
              </div>

              <div className="flex gap-3 w-full md:w-auto justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleClearDrafts}
                  className="rounded-xl px-6 h-11 font-black uppercase text-[10px] tracking-widest text-slate-400 hover:text-white hover:bg-white/5 transition-all"
                >
                  Reset
                </Button>
                <Button
                  type="submit"
                  disabled={bulkAdjustMutation.isPending}
                  className="rounded-xl px-8 bg-white text-slate-900 hover:bg-white/90 shadow-none font-black uppercase tracking-widest text-[10px] h-11 min-w-[200px]"
                >
                  {bulkAdjustMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saving changes...
                    </>
                  ) : (
                    "Commit Price Changes"
                  )}
                </Button>
              </div>
            </CardContent>
          </form>
        </Card>
      )}
    </Layout>
  );
}
