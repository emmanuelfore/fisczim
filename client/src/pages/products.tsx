import { Layout } from "@/components/layout";
import { Link, useLocation } from "wouter";
import {
  refreshProductQueries,
  refreshProductQueriesAsync,
  useProducts,
  useUpdateProduct,
} from "@/hooks/use-products";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useTaxConfig } from "@/hooks/use-tax-config";
import { Card, CardContent } from "@/components/ui/card";
import {
  Package,
  Search,
  ChevronLeft,
  ChevronRight,
  FileDown,
  Briefcase,
} from "lucide-react";
import { CreateProductDialog } from "@/components/products/create-product-dialog";
import { EditProductDialog } from "@/components/products/edit-product-dialog";
import { StockInDialog } from "@/components/products/stock-in-dialog";
import { StockAdjustmentDialog } from "@/components/products/stock-adjustment-dialog";
import { PriceAdjustmentDialog } from "@/components/products/price-adjustment-dialog";
import { DeleteButton } from "@/components/delete-button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CsvImportDialog } from "@/components/csv-import-dialog";
import { ManageCategoriesDialog } from "@/components/products/manage-categories-dialog";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { useBranchContext } from "@/lib/branch-context";
import { resolveMediaUrl } from "@/lib/media";
import { PageHeader } from "@/components/page-header";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  MoreVertical,
  Edit2,
  History,
  TrendingUp,
  PackagePlus,
  ShoppingCart,
  FileText,
  ArrowRight,
} from "lucide-react";

type TypeFilter = "all" | "product" | "service";

export default function ProductsPage() {
  const [, setLocation] = useLocation();
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const { activeCompanyId } = useActiveCompany();
  const { selectedBranchId } = useBranchContext();
  const companyId = activeCompanyId || 0;
  const { data: allItems, isLoading } = useProducts(
    companyId,
    selectedBranchId || undefined,
  );
  const updateProduct = useUpdateProduct();
  const { taxTypes } = useTaxConfig(companyId || undefined);
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [taxFilter, setTaxFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const { toast } = useToast();

  useEffect(() => {
    if (!companyId) return;
    refreshProductQueries(queryClient, companyId);
  }, [companyId, selectedBranchId, queryClient]);

  const bulkDeleteMutation = useMutation({
    mutationFn: async () => {
      const response = await apiFetch(
        `/api/companies/${companyId}/products/bulk-delete`,
        {
          method: "DELETE",
        },
      );
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message || errorData.detail || "Failed to delete products",
        );
      }
    },
    onSuccess: () => {
      refreshProductQueries(queryClient, companyId);
      toast({
        title: "Items Deleted",
        description: "All products and services have been successfully deleted.",
        variant: "default",
      });
    },
    onError: (error) => {
      toast({
        title: "Delete Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Type-filtered base list
  const typeFilteredItems = useMemo(() => {
    if (!allItems) return [];
    if (typeFilter === "product") return allItems.filter(i => i.productType !== "service");
    if (typeFilter === "service") return allItems.filter(i => i.productType === "service");
    return allItems;
  }, [allItems, typeFilter]);

  const categoryOptions = useMemo(() => {
    const categories = new Set<string>();
    typeFilteredItems.forEach((item) => {
      const category = item.category?.trim();
      if (category) categories.add(category);
    });
    return Array.from(categories).sort((a, b) => a.localeCompare(b));
  }, [typeFilteredItems]);

  const filteredItems = typeFilteredItems?.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.sku && p.sku.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (p.description &&
        p.description.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesStatus =
      statusFilter === "all"
        ? true
        : statusFilter === "active"
          ? p.isActive
          : statusFilter === "inactive"
            ? !p.isActive
            : true;

    let matchesStock = true;
    if (stockFilter !== "all" && p.isTracked) {
      const stock = Number(p.stockLevel);
      const lowThreshold = Number(p.lowStockThreshold || 0);
      if (stockFilter === "in_stock") matchesStock = stock > 0;
      if (stockFilter === "low_stock") matchesStock = stock <= lowThreshold && stock > 0;
      if (stockFilter === "out_of_stock") matchesStock = stock <= 0;
    } else if (stockFilter !== "all" && !p.isTracked) {
      if (stockFilter === "low_stock" || stockFilter === "out_of_stock") matchesStock = false;
    }

    const matchesCategory =
      categoryFilter === "all" ? true : p.category === categoryFilter;

    const matchesTax =
      taxFilter === "all"
        ? true
        : parseFloat(p.taxRate || "0") === parseFloat(taxFilter);

    return matchesSearch && matchesStatus && matchesStock && matchesCategory && matchesTax;
  });

  const totalPages = Math.ceil((filteredItems?.length || 0) / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedItems = filteredItems?.slice(startIndex, startIndex + itemsPerPage);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1);
  };

  const resetFilters = () => {
    setSearchTerm("");
    setTypeFilter("all");
    setStatusFilter("all");
    setStockFilter("all");
    setCategoryFilter("all");
    setTaxFilter("all");
    setCurrentPage(1);
  };

  const productCount = allItems?.filter(i => i.productType !== "service").length ?? 0;
  const serviceCount = allItems?.filter(i => i.productType === "service").length ?? 0;

  const hasActiveFilters =
    searchTerm ||
    typeFilter !== "all" ||
    statusFilter !== "all" ||
    stockFilter !== "all" ||
    categoryFilter !== "all" ||
    taxFilter !== "all";

  return (
    <Layout>
      <PageHeader
        title="Products & Services"
        subtitle="Inventory, goods and service offerings"
        actions={
          <>
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  const res = await apiFetch(
                    `/api/export/products?companyId=${companyId}`,
                  );
                  if (!res.ok) throw new Error("Export failed");
                  const blob = await res.blob();
                  const url = window.URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `products_export_${new Date().toISOString().split("T")[0]}.csv`;
                  document.body.appendChild(a);
                  a.click();
                  window.URL.revokeObjectURL(url);
                  document.body.removeChild(a);
                } catch (err: any) {
                  toast({
                    title: "Export Failed",
                    description: err.message,
                    variant: "destructive",
                  });
                }
              }}
              disabled={!companyId}
              className="rounded-xl"
            >
              <FileDown className="w-4 h-4 mr-2" />
              Export CSV
            </Button>

            {companyId > 0 && allItems && allItems.length > 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="destructive"
                    className="rounded-xl"
                    disabled={bulkDeleteMutation.isPending}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    {bulkDeleteMutation.isPending ? "Deleting..." : "Delete All"}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete ALL products and services
                      from your inventory for this company. This action cannot
                      be undone. Historical transactions (invoices, receipts)
                      will keep standard text references.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => bulkDeleteMutation.mutate()}
                      className="bg-red-600 hover:bg-red-700"
                    >
                      Yes, Delete All
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}

            <ManageCategoriesDialog companyId={companyId} />
            <CsvImportDialog
              type="product"
              companyId={companyId}
              onSuccess={async () => {
                await refreshProductQueriesAsync(queryClient, companyId);
                setCurrentPage(1);
              }}
            />
            {companyId > 0 && (
              <Link href="/products/bulk-adjust">
                <Button
                  variant="outline"
                  className="rounded-xl flex-1 sm:flex-none gap-2"
                >
                  <TrendingUp className="w-4 h-4 text-emerald-600" />
                  Bulk Adjust Prices
                </Button>
              </Link>
            )}
            {companyId > 0 ? (
              <>
                <CreateProductDialog
                  companyId={companyId}
                  defaultType="service"
                  triggerLabel="Add Service"
                />
                <CreateProductDialog
                  companyId={companyId}
                  defaultType="good"
                  triggerLabel="Add Product"
                />
              </>
            ) : (
              <Button disabled variant="outline" className="rounded-xl flex-1 sm:flex-none">
                Select a Company First
              </Button>
            )}
          </>
        }
      />

      {/* Type filter tabs */}
      <div className="flex items-center gap-1 mb-4 bg-slate-100 p-1 rounded-xl w-fit">
        {(["all", "product", "service"] as TypeFilter[]).map((t) => {
          const count = t === "all" ? (allItems?.length ?? 0) : t === "product" ? productCount : serviceCount;
          const label = t === "all" ? "All" : t === "product" ? "Products" : "Services";
          return (
            <button
              key={t}
              onClick={() => { setTypeFilter(t); setCurrentPage(1); setStockFilter("all"); }}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                typeFilter === t
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {t === "service" ? (
                <Briefcase className="w-3.5 h-3.5" />
              ) : (
                <Package className="w-3.5 h-3.5" />
              )}
              {label}
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                typeFilter === t ? "bg-slate-100 text-slate-600" : "bg-slate-200 text-slate-500"
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="admin-panel mb-4 flex flex-col gap-3 p-4 md:flex-row md:items-center">
        <div className="relative flex-1 w-full sm:max-w-sm group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#64748B] transition-colors" />
          <Input
            placeholder="Search products, services, SKU..."
            className="pl-9"
            value={searchTerm}
            onChange={handleSearch}
          />
        </div>

        <div className="flex gap-2 flex-wrap">
          <Select
            value={statusFilter}
            onValueChange={(v) => { setStatusFilter(v); setCurrentPage(1); }}
          >
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>

          {/* Only show stock filter when not viewing services-only */}
          {typeFilter !== "service" && (
            <Select
              value={stockFilter}
              onValueChange={(v) => { setStockFilter(v); setCurrentPage(1); }}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Stock Level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stock</SelectItem>
                <SelectItem value="in_stock">In Stock</SelectItem>
                <SelectItem value="low_stock">Low Stock</SelectItem>
                <SelectItem value="out_of_stock">Out of Stock</SelectItem>
              </SelectContent>
            </Select>
          )}

          <Select
            value={categoryFilter}
            onValueChange={(v) => { setCategoryFilter(v); setCurrentPage(1); }}
          >
            <SelectTrigger className="w-[170px]">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categoryOptions.map((category) => (
                <SelectItem key={category} value={category}>
                  {category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={taxFilter}
            onValueChange={(v) => { setTaxFilter(v); setCurrentPage(1); }}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Tax Class" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Taxes</SelectItem>
              {taxTypes.data?.map((t: any) => (
                <SelectItem key={t.id} value={t.rate.toString()}>
                  {t.name} ({t.rate}%)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {hasActiveFilters && (
          <Button variant="ghost" onClick={resetFilters} className="text-[#64748B]">
            Reset
          </Button>
        )}
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-0 overflow-x-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-[#F8FAFC] border-b border-[#E5E7EB]">
                <th className="px-5 py-3 font-semibold text-[#64748B] uppercase tracking-wide text-[12px] w-[40%] md:w-auto">
                  Name
                </th>
                <th className="hidden lg:table-cell px-5 py-3 font-semibold text-[#64748B] uppercase tracking-wide text-[12px]">
                  Code
                </th>
                <th className="hidden xl:table-cell px-5 py-3 font-semibold text-[#64748B] uppercase tracking-wide text-[12px]">
                  Details
                </th>
                <th className="hidden sm:table-cell px-5 py-3 font-semibold text-[#64748B] uppercase tracking-wide text-[12px]">
                  Category
                </th>
                <th className="px-5 py-3 font-semibold text-[#64748B] uppercase tracking-wide text-[12px]">
                  Price
                </th>
                <th className="px-5 py-3 font-semibold text-[#64748B] uppercase tracking-wide text-[12px]">
                  Stock
                </th>
                <th className="hidden lg:table-cell px-5 py-3 font-semibold text-[#64748B] uppercase tracking-wide text-[12px]">
                  Tax
                </th>
                <th className="p-5 w-16 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-600"></div>
                      Loading...
                    </div>
                  </td>
                </tr>
              ) : paginatedItems?.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center">
                      {typeFilter === "service" ? (
                        <Briefcase className="w-12 h-12 text-slate-200 mb-4" />
                      ) : (
                        <Package className="w-12 h-12 text-slate-200 mb-4" />
                      )}
                      <p className="font-bold text-lg">
                        No {typeFilter === "service" ? "services" : typeFilter === "product" ? "products" : "items"} found
                      </p>
                      <p>Try adjusting your filters</p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedItems?.map((p) => {
                  const isService = p.productType === "service";
                  const matchedType = taxTypes.data?.find((t: any) => {
                    if (p.taxTypeId) return t.id === p.taxTypeId;
                    if (parseFloat(t.rate) === parseFloat(p.taxRate || "0")) {
                      if (parseFloat(p.taxRate || "0") === 0) {
                        const isExempt =
                          p.name.toLowerCase().includes("exempt") ||
                          p.description?.toLowerCase().includes("exempt");
                        if (isExempt) {
                          const zimraTaxId = t.zimraTaxId?.toString();
                          return (
                            zimraTaxId == "1" ||
                            t.zimraCode === "C" ||
                            t.zimraCode === "E" ||
                            t.name.toLowerCase().includes("exempt")
                          );
                        }
                        return t.zimraTaxId === "2" || t.name.toLowerCase().includes("zero");
                      }
                      return true;
                    }
                    return false;
                  });

                  return (
                    <tr
                      key={p.id}
                      className={`group border-b border-[#F1F5F9] hover:bg-[#F8FAFC] transition-colors cursor-default ${!p.isActive ? "opacity-50 grayscale" : ""}`}
                    >
                      <td className="px-5 py-4 font-bold text-[#0F172A] w-[50%] md:w-auto">
                        <div className="flex items-center gap-3 overflow-hidden">
                          {p.imageUrl ? (
                            <img
                              src={resolveMediaUrl(p.imageUrl)}
                              alt={p.name}
                              className="w-8 h-8 md:w-10 md:h-10 rounded-lg object-cover shadow-sm bg-slate-100 ring-1 ring-slate-200 shrink-0"
                              onError={(e) => (e.currentTarget.style.display = "none")}
                            />
                          ) : (
                            <div className={`w-8 h-8 md:w-10 md:h-10 rounded-lg flex items-center justify-center ring-1 shrink-0 ${
                              isService
                                ? "bg-blue-50 ring-blue-100"
                                : "bg-slate-100 ring-slate-200"
                            }`}>
                              {isService ? (
                                <Briefcase className="w-4 h-4 md:w-5 md:h-5 text-blue-400" />
                              ) : (
                                <Package className="w-4 h-4 md:w-5 md:h-5 text-slate-300" />
                              )}
                            </div>
                          )}
                          <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold tracking-tight truncate">
                                {p.name}
                              </span>
                              {isService && (
                                <Badge
                                  variant="outline"
                                  className="text-[9px] text-blue-600 border-blue-200 bg-blue-50 px-1.5 py-0 shrink-0 font-bold uppercase tracking-wider"
                                >
                                  Service
                                </Badge>
                              )}
                            </div>
                            {!p.isActive && (
                              <span className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider w-fit mt-0.5">
                                Inactive
                              </span>
                            )}
                            {p.description && (
                              <span className="text-[10px] text-slate-400 font-medium truncate max-w-full">
                                {p.description}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="hidden lg:table-cell px-5 py-4 font-mono text-xs font-bold text-slate-500">
                        {p.sku || "—"}
                      </td>
                      <td className="hidden xl:table-cell px-5 py-4">
                        <div className="flex flex-col gap-1">
                          {p.hsCode && (
                            <div className="text-[10px] font-bold text-slate-400 font-mono uppercase">
                              HS: {p.hsCode}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="hidden md:table-cell px-5 py-4">
                        {p.category ? (
                          <Badge
                            variant="secondary"
                            className="bg-slate-100 text-slate-600 font-bold text-[10px] uppercase tracking-wider px-2 py-0.5 whitespace-nowrap"
                          >
                            {p.category}
                          </Badge>
                        ) : (
                          <span className="text-slate-300 text-xs font-bold">—</span>
                        )}
                      </td>
                      <td className="px-5 py-4 font-bold text-[#0F172A] tracking-tight">
                        ${Number(p.price).toFixed(2)}
                      </td>
                      <td className="px-5 py-4">
                        {isService ? (
                          <span className="text-[10px] text-slate-400 font-bold uppercase">
                            N/A
                          </span>
                        ) : p.isTracked ? (
                          <div className="flex items-center gap-2">
                            <span
                              className={`${Number(p.stockLevel) <= Number(p.lowStockThreshold || 0) ? "text-red-600 bg-red-50" : "text-slate-700 bg-slate-100"} px-2 py-0.5 rounded-md font-mono text-[11px] font-bold`}
                            >
                              {p.stockLevel}
                            </span>
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-400 font-bold uppercase">
                            ∞
                          </span>
                        )}
                      </td>
                      <td className="hidden lg:table-cell px-5 py-4">
                        {matchedType ? (
                          <Badge
                            variant="outline"
                            className="bg-white text-slate-600 border-slate-200 font-bold text-[10px] uppercase tracking-wider shadow-sm whitespace-nowrap"
                          >
                            {matchedType.name}
                          </Badge>
                        ) : (
                          <span className="text-slate-400 text-[10px] font-bold">
                            {p.taxRate}%
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-900 transition-all active:scale-90"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            className="w-56 bg-white/95 backdrop-blur-xl border-slate-200 rounded-2xl shadow-2xl p-2 z-50"
                          >
                            <div className="px-3 py-2 border-b border-slate-100 mb-1">
                              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                {isService ? "Service Management" : "Inventory Management"}
                              </p>
                            </div>

                            {!isService && p.isTracked && (
                              <>
                                <DropdownMenuItem
                                  onSelect={(e) => e.preventDefault()}
                                  className="p-0 rounded-xl mb-1 focus:bg-transparent"
                                >
                                  <StockInDialog product={p} companyId={companyId}>
                                    <div className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-emerald-700 hover:bg-emerald-50 cursor-pointer font-bold transition-all text-xs">
                                      <PackagePlus className="w-4 h-4" />
                                      <span>Stock In</span>
                                    </div>
                                  </StockInDialog>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onSelect={(e) => e.preventDefault()}
                                  className="p-0 rounded-xl mb-1 focus:bg-transparent"
                                >
                                  <StockAdjustmentDialog
                                    product={p}
                                    companyId={companyId}
                                    branchId={selectedBranchId || undefined}
                                  >
                                    <div className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-amber-700 hover:bg-amber-50 cursor-pointer font-bold transition-all text-xs">
                                      <History className="w-4 h-4" />
                                      <span>Manual Adjust</span>
                                    </div>
                                  </StockAdjustmentDialog>
                                </DropdownMenuItem>
                              </>
                            )}

                            <DropdownMenuItem
                              onSelect={(e) => e.preventDefault()}
                              className="p-0 rounded-xl mb-1 focus:bg-transparent"
                            >
                              <PriceAdjustmentDialog product={p} companyId={companyId}>
                                <div className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-indigo-700 hover:bg-indigo-50 cursor-pointer font-bold transition-all text-xs">
                                  <TrendingUp className="w-4 h-4" />
                                  <span>Manage Price</span>
                                </div>
                              </PriceAdjustmentDialog>
                            </DropdownMenuItem>

                            <DropdownMenuSeparator className="my-1 bg-slate-100" />

                            <DropdownMenuItem
                              className="rounded-xl mb-1"
                              asChild
                            >
                              <Link href={`/sales-orders/new?productId=${p.id}`}>
                                <div className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-indigo-700 hover:bg-indigo-50 cursor-pointer font-bold transition-all text-xs">
                                  <ShoppingCart className="w-4 h-4" />
                                  <span>Create Sales Order</span>
                                  <ArrowRight className="w-3 h-3 ml-auto" />
                                </div>
                              </Link>
                            </DropdownMenuItem>

                            <DropdownMenuItem
                              className="rounded-xl mb-1"
                              asChild
                            >
                              <Link href={`/invoices?productId=${p.id}`}>
                                <div className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-slate-700 hover:bg-slate-50 cursor-pointer font-bold transition-all text-xs">
                                  <FileText className="w-4 h-4" />
                                  <span>View Sales History</span>
                                  <ArrowRight className="w-3 h-3 ml-auto" />
                                </div>
                              </Link>
                            </DropdownMenuItem>

                            {!isService && (
                              <DropdownMenuItem
                                className="rounded-xl mb-1"
                                asChild
                              >
                                <Link href={`/inventory/purchase-orders/new?productId=${p.id}`}>
                                  <div className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-slate-700 hover:bg-slate-50 cursor-pointer font-bold transition-all text-xs">
                                    <ShoppingCart className="w-4 h-4" />
                                    <span>Create Purchase Order</span>
                                    <ArrowRight className="w-3 h-3 ml-auto" />
                                  </div>
                                </Link>
                              </DropdownMenuItem>
                            )}

                            <DropdownMenuSeparator className="my-1 bg-slate-100" />

                            <DropdownMenuItem
                              onSelect={(e) => e.preventDefault()}
                              className="p-0 rounded-xl mb-1 focus:bg-transparent"
                            >
                              <EditProductDialog product={p}>
                                <div className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-slate-700 hover:bg-slate-50 cursor-pointer font-bold transition-all text-xs">
                                  <Edit2 className="w-4 h-4" />
                                  <span>Edit</span>
                                </div>
                              </EditProductDialog>
                            </DropdownMenuItem>

                            <DropdownMenuItem
                              onSelect={(e) => e.preventDefault()}
                              className="p-0 rounded-xl focus:bg-transparent"
                            >
                              <DeleteButton
                                title={`Delete ${isService ? "Service" : "Product"}`}
                                description={`Are you sure you want to delete ${p.name}? This will remove it from active inventory.`}
                                onConfirm={async () => {
                                  await updateProduct.mutateAsync({
                                    id: p.id,
                                    data: { isActive: false },
                                    companyId,
                                  });
                                }}
                                isDeleting={updateProduct.isPending}
                              >
                                <div className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-red-600 hover:bg-red-50 cursor-pointer font-bold transition-all text-xs">
                                  <Trash2 className="w-4 h-4" />
                                  <span>Delete</span>
                                </div>
                              </DeleteButton>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

          {/* Pagination Controls */}
          <div className="flex flex-col sm:flex-row items-center justify-between px-5 py-4 border-t border-[#E5E7EB] bg-white gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                Items per page
              </span>
              <Select
                value={itemsPerPage.toString()}
                onValueChange={(v) => {
                  setItemsPerPage(parseInt(v));
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="w-[70px] h-8 text-[10px] bg-white font-bold border-slate-200">
                  <SelectValue placeholder="10" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
              {filteredItems && (
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-2">
                  Showing {startIndex + 1}–
                  {Math.min(startIndex + itemsPerPage, filteredItems.length)}{" "}
                  of {filteredItems.length}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mr-2">
                Page {currentPage} of {totalPages || 1}
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
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
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
