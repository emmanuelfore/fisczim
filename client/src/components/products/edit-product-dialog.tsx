import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertProductSchema, type InsertProduct } from "@shared/schema";
import { useUpdateProduct } from "@/hooks/use-products";
import { useCostCenters } from "@/hooks/use-cost-centers";
import { useTaxConfig } from "@/hooks/use-tax-config";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Pencil, Loader2 } from "lucide-react";
import { type ReactNode, useState, useEffect } from "react";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { RecipeManager } from "./recipe-manager";
import { BatchVariationManager } from "./batch-variation-manager";
import { ChefHat, Pill, FlaskConical, Boxes } from "lucide-react";
import { ImageUpload } from "@/components/ui/image-upload";
import { HsCodeAssistant } from "@/components/products/hs-code-assistant";

interface Props {
  product: any;
  trigger?: ReactNode;
  children?: ReactNode;
}

export function EditProductDialog({ product, trigger, children }: Props) {
  const [open, setOpen] = useState(false);
  const updateProduct = useUpdateProduct();
  const { taxCategories, taxTypes } = useTaxConfig(product.companyId);
  const { toast } = useToast();

  // Refetch tax types every time the dialog opens to guarantee fresh data
  useEffect(() => {
    if (open) taxTypes.refetch();
  }, [open]);

  const { data: categories } = useQuery({
    queryKey: ["product-categories", product.companyId],
    queryFn: async () => {
      const res = await apiFetch(
        `/api/product-categories?companyId=${product.companyId}`,
      );
      if (!res.ok) throw new Error("Failed to fetch categories");
      return res.json();
    },
    enabled: open,
  });
  const { data: costCenters = [] } = useCostCenters(product.companyId);

  const isService = product.productType === "service";

  const form = useForm<InsertProduct>({
    resolver: zodResolver(insertProductSchema),
    defaultValues: {
      name: product.name,
      description: product.description || "",
      sku: product.sku || "",
      barcode: product.barcode || "",
      hsCode: product.hsCode || "",
      category: product.category || "",
      ownerGroup: product.ownerGroup || "",
      price: product.price?.toString() || "0.00",
      costPrice: product.costPrice?.toString() || "0.00",
      taxRate: product.taxRate?.toString() || "15.50",
      taxCategoryId: product.taxCategoryId,
      isActive: product.isActive,
      isTracked: product.isTracked,
      stockLevel: product.stockLevel?.toString() || "0",
      lowStockThreshold: product.lowStockThreshold?.toString() || "10",
      productType: product.productType,
      companyId: product.companyId,
      taxTypeId: product.taxTypeId,
      imageUrl: product.imageUrl || "",
      isIngredient: product.isIngredient ?? false,
      hasRecipe: product.hasRecipe ?? false,
      ...(("isForSale" in product) ? { isForSale: product.isForSale ?? true } : { isForSale: true }),
      isPrescriptionOnly: product.isPrescriptionOnly ?? false,
      batchTrackingEnabled: product.batchTrackingEnabled ?? false,
      brandName: product.brandName || "",
      genericName: product.genericName || "",
      oemPartNumber: (product as any).oemPartNumber || "",
      supplierPartNumber: (product as any).supplierPartNumber || "",
      fitmentNotes: (product as any).fitmentNotes || "",
      serialTrackingEnabled: (product as any).serialTrackingEnabled ?? false,
      warrantyTrackingEnabled:
        (product as any).warrantyTrackingEnabled ?? false,
      warrantyMonths: (product as any).warrantyMonths || 0,
      originalLanguageName: (product as any).originalLanguageName || "",
      originalLanguageCode: (product as any).originalLanguageCode || "",
      ...(product.unitOfMeasure
        ? { unitOfMeasure: product.unitOfMeasure }
        : {}),
    },
  });

  // Auto-update tax rate when category changes

  const onSubmit = async (data: InsertProduct) => {
    try {
      await updateProduct.mutateAsync({ id: product.id, data });
      toast({
        title: "Success",
        description: `${isService ? "Service" : "Product"} updated successfully.`,
      });
      setOpen(false);
    } catch (error: any) {
      console.error("Failed to update product:", error);
      toast({
        title: "Update Failed",
        description: error.message || "An unexpected error occurred.",
        variant: "destructive",
      });
    }
  };

  const isTracked = form.watch("isTracked");

  const [selectedTaxTypeId, setSelectedTaxTypeId] = useState<string>("");

  // Sync with initial product once taxTypes load (or dialog opens)
  useEffect(() => {
    if (!open || !taxTypes.data) return;
    // First try explicit taxTypeId from database
    if (product.taxTypeId) {
      setSelectedTaxTypeId(product.taxTypeId.toString());
      return;
    }
    // Fallback to heuristic for legacy data: match by rate
    const initial = taxTypes.data?.find((t: any) => {
      if (t.rate === product.taxRate?.toString()) {
        if (t.rate === "0" || t.rate === "0.00") {
          const isExempt =
            product.name?.toLowerCase().includes("exempt") ||
            product.description?.toLowerCase().includes("exempt");
          if (isExempt) {
            const zimraTaxId = t.zimraTaxId?.toString();
            return (
              zimraTaxId == "1" ||
              t.zimraCode === "C" ||
              t.zimraCode === "E" ||
              t.name.toLowerCase().includes("exempt")
            );
          }
          const zimraTaxId = t.zimraTaxId?.toString();
          return (
            zimraTaxId == "2" ||
            t.zimraCode === "D" ||
            t.name.toLowerCase().includes("zero")
          );
        }
        return true;
      }
      return false;
    });
    if (initial) setSelectedTaxTypeId(initial.id.toString());
  }, [taxTypes.data, product, open]);

  return (
    <Dialog
      open={open}
      onOpenChange={(val) => {
        setOpen(val);
        if (!val) setSelectedTaxTypeId(""); // Reset on close
      }}
    >
      <DialogTrigger asChild>
        {trigger || children ? (
          trigger || children
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 rounded-full hover:bg-violet-50 hover:text-primary transition-all"
          >
            <Pencil className="w-4 h-4 text-slate-400" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="w-[95vw] sm:max-w-3xl h-[95dvh] sm:h-[90vh] overflow-auto sm:overflow-auto rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-display font-bold text-slate-900">
            Edit {isService ? "Service" : "Product"}
          </DialogTitle>
          <DialogDescription>
            Update details for {product.name}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            onKeyDown={(e) => e.stopPropagation()}
            className="space-y-6 mt-4"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-slate-700 font-semibold">
                    {isService ? "Service Name" : "Product Name"}
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder={
                        isService ? "e.g. Consulting, Labor" : "e.g. Widget X"
                      }
                      {...field}
                      className="rounded-xl bg-slate-50 border-slate-200 focus-visible:ring-primary/20"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="imageUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-700 font-semibold uppercase text-[10px] tracking-widest">
                      Product Image
                    </FormLabel>
                    <FormControl>
                      <ImageUpload
                        value={field.value || ""}
                        onChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-700 font-semibold uppercase text-[10px] tracking-widest">
                      Category
                    </FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value || undefined}
                      value={field.value || undefined}
                    >
                      <FormControl>
                        <SelectTrigger className="rounded-xl bg-slate-50 border-slate-200 focus:ring-primary/20">
                          <SelectValue placeholder="Select Category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="rounded-xl shadow-xl">
                        {categories?.map((cat: any) => (
                          <SelectItem key={cat.id} value={cat.name}>
                            {cat.name}
                          </SelectItem>
                        ))}
                        {!categories?.some(
                          (c: any) => c.name === product.category,
                        ) &&
                          product.category && (
                            <SelectItem value={product.category}>
                              {product.category}
                            </SelectItem>
                          )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="ownerGroup"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-slate-700 font-semibold">
                    Cost Center
                  </FormLabel>
                  <Select
                    value={field.value || "none"}
                    onValueChange={(val) =>
                      form.setValue("ownerGroup", val === "none" ? "" : val, { shouldDirty: true })
                    }
                  >
                    <FormControl>
                      <SelectTrigger className="rounded-xl bg-slate-50 border-slate-200 focus:ring-primary/20">
                        <SelectValue placeholder="Select Cost Center" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="rounded-xl shadow-xl">
                      <SelectItem value="none">No Cost Center</SelectItem>
                      {costCenters.map((cc) => (
                        <SelectItem key={cc.id} value={cc.name}>
                          {cc.name} ({cc.code})
                        </SelectItem>
                      ))}
                      {field.value && !costCenters.some(cc => cc.name === field.value) && (
                        <SelectItem value={field.value}>
                          {field.value} (Legacy/Unmanaged)
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Optional. Used to separate reporting by cost center.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Status Flags Section */}
            {!isService && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <FormField
                  control={form.control}
                  name="isPrescriptionOnly"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-xl border border-dashed border-red-200 p-3 bg-red-50/30">
                      <div className="space-y-0.5">
                        <FormLabel className="text-xs font-bold text-red-900">
                          Prescription Only
                        </FormLabel>
                        <FormDescription className="text-[10px]">
                          Required for sale in POS
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value || false}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="batchTrackingEnabled"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-xl border border-dashed border-green-200 p-3 bg-green-50/30">
                      <div className="space-y-0.5">
                        <FormLabel className="text-xs font-bold text-green-900">
                          Track Batches
                        </FormLabel>
                        <FormDescription className="text-[10px]">
                          Track expiry & lot numbers
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value || false}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="isIngredient"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-xl border border-dashed border-amber-200 p-3 bg-amber-50/30">
                      <div className="space-y-0.5">
                        <FormLabel className="text-xs font-bold text-amber-900">
                          Ingredient / Source Stock
                        </FormLabel>
                        <FormDescription className="text-[10px]">
                          Can be used in recipes, bundles, or meat cuts
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value || false}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="hasRecipe"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-xl border border-dashed border-indigo-200 p-3 bg-indigo-50/30">
                      <div className="space-y-0.5">
                        <FormLabel className="text-xs font-bold text-indigo-900">
                          Has Recipe / BOM
                        </FormLabel>
                        <FormDescription className="text-[10px]">
                          Deduct ingredients or source stock when sold
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value || false}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={"isForSale" as any}
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-xl border border-dashed border-orange-200 p-3 bg-orange-50/30 col-span-full">
                      <div className="space-y-0.5">
                        <FormLabel className="text-xs font-bold text-orange-900">
                          Available for Sale (POS / Invoicing)
                        </FormLabel>
                        <FormDescription className="text-[10px]">
                          Turn OFF to hide this product from the POS and invoice product picker (e.g. raw materials for internal use only)
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value !== false}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            )}

            {/* Pharmacy Brand/Generic Names */}
            {!isService && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="brandName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-slate-700 font-semibold">
                        Brand Name
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g. Panadol"
                          {...field}
                          value={field.value || ""}
                          className="rounded-xl bg-slate-50 border-slate-200 focus-visible:ring-primary/20"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="genericName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-slate-700 font-semibold">
                        Generic Name
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g. Paracetamol"
                          {...field}
                          value={field.value || ""}
                          className="rounded-xl bg-slate-50 border-slate-200 focus-visible:ring-primary/20"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            {/* Batch & Variation Configuration */}
            {!isService && (
              <div className="flex justify-between items-center p-4 bg-emerald-50 border border-emerald-100 rounded-2xl animate-in slide-in-from-top-2 duration-300">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-emerald-600 text-white rounded-xl shadow-md shadow-emerald-100">
                    <Boxes className="w-5 h-5" />
                  </div>
                  <div className="space-y-0.5">
                    <p className=" font-black text-emerald-900">
                      Batches & Variations
                    </p>
                    <p className="text-[10px] text-emerald-700/70 font-bold uppercase tracking-wide">
                      Manage Expiry dates & Pack sizes
                    </p>
                  </div>
                </div>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 px-6 rounded-xl border-emerald-300 text-emerald-700 hover:bg-emerald-600 hover:text-white font-black text-xs shadow-sm transition-all"
                    >
                      Track Inventory
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-4xl rounded-[2.5rem] p-8">
                    <DialogHeader>
                      <DialogTitle className="text-3xl font-black font-display text-slate-900">
                        Inventory Tracking: {product.name}
                      </DialogTitle>
                      <DialogDescription className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">
                        Configure batches, expiry dates, and product variations
                      </DialogDescription>
                    </DialogHeader>
                    <BatchVariationManager
                      productId={product.id}
                      companyId={product.companyId}
                    />
                  </DialogContent>
                </Dialog>
              </div>
            )}

            {/* Recipe / source deduction management */}
            {form.watch("hasRecipe") && (
              <div className="flex justify-between items-center p-4 bg-indigo-50 border border-indigo-100 rounded-2xl animate-in slide-in-from-top-2 duration-300">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-md shadow-indigo-100">
                    <ChefHat className="w-5 h-5" />
                  </div>
                  <div className="space-y-0.5">
                    <p className=" font-black text-indigo-900">
                      Recipe / BOM Setup
                    </p>
                    <p className="text-[10px] text-indigo-700/70 font-bold uppercase tracking-wide">
                      Choose ingredients or source stock consumed on sale
                    </p>
                  </div>
                </div>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 px-6 rounded-xl border-indigo-300 text-indigo-700 hover:bg-indigo-600 hover:text-white font-black text-xs shadow-sm transition-all"
                    >
                      Manage Recipe
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-4xl rounded-[2.5rem] p-8">
                    <DialogHeader>
                      <DialogTitle className="text-3xl font-black font-display text-slate-900">
                        Recipe / BOM: {product.name}
                      </DialogTitle>
                      <DialogDescription className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">
                        Configure ingredients or source stock consumed on sale
                      </DialogDescription>
                    </DialogHeader>
                    <RecipeManager
                      productId={product.id}
                      companyId={product.companyId}
                    />
                  </DialogContent>
                </Dialog>
              </div>
            )}

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-slate-700 font-semibold">
                    Description
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Details..."
                      className="resize-none h-20 rounded-xl bg-slate-50 border-slate-200 focus-visible:ring-primary/20"
                      value={field.value || ""}
                      onChange={field.onChange}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Translation Settings */}
            <div className="rounded-2xl bg-amber-50/50 border border-amber-100 p-5 space-y-4">
              <h4 className=" font-bold text-amber-900 flex items-center gap-2">
                <span className="w-1.5 h-4 bg-amber-500 rounded-full"></span>
                Product Translations
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="originalLanguageName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-slate-700 font-semibold">
                        Original Name
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g. 苹果手机壳"
                          {...field}
                          value={field.value || ""}
                          className="rounded-xl bg-white border-amber-200 focus-visible:ring-amber-500/20"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="originalLanguageCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-slate-700 font-semibold">
                        Original Language
                      </FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value || undefined}
                        value={field.value || undefined}
                      >
                        <FormControl>
                          <SelectTrigger className="rounded-xl bg-white border-amber-200 focus:ring-amber-500/20">
                            <SelectValue placeholder="Select Language" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="rounded-xl shadow-xl">
                          <SelectItem value="zh">Chinese (Mandarin)</SelectItem>
                          <SelectItem value="ja">Japanese</SelectItem>
                          <SelectItem value="ko">Korean</SelectItem>
                          <SelectItem value="de">German</SelectItem>
                          <SelectItem value="fr">French</SelectItem>
                          <SelectItem value="es">Spanish</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {!isService && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5 space-y-4">
                <h4 className=" font-bold text-slate-800">Product Details</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="brandName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-slate-700 font-semibold">
                          Brand / Manufacturer
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g. Samsung, Dairibord, Willard"
                            value={field.value || ""}
                            onChange={field.onChange}
                            className="rounded-xl bg-white border-slate-200"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="oemPartNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-slate-700 font-semibold">
                          Item / Model Code
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Internal, model, or manufacturer code"
                            value={field.value || ""}
                            onChange={field.onChange}
                            className="rounded-xl bg-white border-slate-200 font-mono"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="supplierPartNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-slate-700 font-semibold">
                          Supplier Code
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Supplier SKU, catalogue code, or reference"
                            value={field.value || ""}
                            onChange={field.onChange}
                            className="rounded-xl bg-white border-slate-200 font-mono"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="fitmentNotes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-slate-700 font-semibold">
                        Compatibility / Usage Notes
                      </FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="e.g. compatible models, sizes, ingredients, pack details, or usage notes"
                          value={field.value || ""}
                          onChange={field.onChange}
                          className="resize-none rounded-xl bg-white border-slate-200"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <FormField
                    control={form.control}
                    name="batchTrackingEnabled"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-xl bg-white border border-slate-200 p-3">
                        <FormLabel className="text-xs font-bold text-slate-700">
                          Batch Tracking
                        </FormLabel>
                        <FormControl>
                          <Switch
                            checked={!!field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="serialTrackingEnabled"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-xl bg-white border border-slate-200 p-3">
                        <FormLabel className="text-xs font-bold text-slate-700">
                          Serial Tracking
                        </FormLabel>
                        <FormControl>
                          <Switch
                            checked={!!field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="warrantyTrackingEnabled"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-xl bg-white border border-slate-200 p-3">
                        <FormLabel className="text-xs font-bold text-slate-700">
                          Warranty Tracking
                        </FormLabel>
                        <FormControl>
                          <Switch
                            checked={!!field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="warrantyMonths"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-slate-700 font-semibold">
                          Warranty Period (Months)
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min="0"
                            value={field.value || 0}
                            onChange={(event) =>
                              field.onChange(Number(event.target.value || 0))
                            }
                            className="rounded-xl bg-white border-slate-200"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            )}

            {/* Tax Configuration Section */}
            <div className="rounded-2xl bg-blue-50/50 p-5 border border-blue-100 space-y-4">
              <h4 className=" font-bold text-blue-900 flex items-center gap-2">
                <span className="w-1.5 h-4 bg-blue-500 rounded-full"></span>
                Tax Configuration
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="taxRate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs uppercase tracking-wide text-blue-700 font-semibold">
                        ZIMRA Tax Type
                      </FormLabel>
                      <Select
                        onValueChange={(val) => {
                          setSelectedTaxTypeId(val);
                          const selectedType = taxTypes.data?.find(
                            (t: any) => t.id.toString() === val,
                          );
                          if (selectedType) {
                            field.onChange(selectedType.rate);
                            form.setValue("taxTypeId", selectedType.id);
                            form.setValue("taxCategoryId", null);
                          }
                        }}
                        value={selectedTaxTypeId || ""}
                      >
                        <FormControl>
                          <SelectTrigger className="rounded-xl bg-white border-blue-200 focus:ring-blue-500/20 text-slate-700">
                            <SelectValue placeholder="Select Tax Type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent position="popper" className="rounded-xl shadow-xl z-[9999]">
                          {taxTypes.data?.map((t: any) => (
                            <SelectItem key={t.id} value={t.id.toString()}>
                              {t.name} ({t.rate}%)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="hsCode"
                  render={({ field }) => (
                    <div className="space-y-3">
                      <FormItem>
                        <FormLabel className="text-xs uppercase tracking-wide text-blue-700 font-semibold">
                          HS Code
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder="8-digit HS code"
                            inputMode="numeric"
                            maxLength={8}
                            className="rounded-xl bg-white border-blue-200 focus-visible:ring-blue-500/20 font-mono "
                            value={(field.value || "")
                              .replace(/\D/g, "")
                              .slice(0, 8)}
                            onChange={(event) =>
                              field.onChange(
                                event.target.value
                                  .replace(/\D/g, "")
                                  .slice(0, 8),
                              )
                            }
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                      <HsCodeAssistant
                        getQuery={() => [
                          form.getValues("name"),
                          form.getValues("category"),
                          form.getValues("description"),
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        onSelect={(code) =>
                          form.setValue("hsCode", code, {
                            shouldDirty: true,
                            shouldValidate: true,
                          })
                        }
                      />
                    </div>
                  )}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <FormField
                control={form.control}
                name="costPrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-700 font-semibold">
                      Cost Price ($)
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.000001"
                        min="0"
                        {...field}
                        value={field.value ?? ""}
                        className="rounded-xl bg-slate-50 border-slate-200 focus-visible:ring-primary/20 font-mono"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-700 font-semibold">
                      Selling Price ($)
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        {...field}
                        className="rounded-xl bg-slate-50 border-slate-200 focus-visible:ring-primary/20 font-mono"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="sku"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-700 font-semibold">
                      SKU / Code <span className="text-red-500">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Required"
                        value={field.value || ""}
                        onChange={field.onChange}
                        className="rounded-xl bg-slate-50 border-slate-200 focus-visible:ring-primary/20 font-mono"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {!isService && (
                <FormField
                  control={form.control}
                  name="barcode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-slate-700 font-semibold">
                        Barcode
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Optional"
                          value={field.value || ""}
                          onChange={field.onChange}
                          className="rounded-xl bg-slate-50 border-slate-200 focus-visible:ring-primary/20 font-mono"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            <FormField
              control={form.control}
              name={"unitOfMeasure" as any}
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-slate-700 font-semibold">
                    Unit of Measure
                  </FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value || ""}
                  >
                    <FormControl>
                      <SelectTrigger className="rounded-xl bg-slate-50 border-slate-200 focus:ring-primary/20">
                        <SelectValue placeholder="Select unit (optional)" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="rounded-xl shadow-xl">
                      {[
                        "pcs",
                        "kg",
                        "g",
                        "mg",
                        "L",
                        "mL",
                        "m",
                        "cm",
                        "mm",
                        "box",
                        "pack",
                        "pair",
                        "set",
                        "dozen",
                        "bag",
                        "roll",
                        "sheet",
                        "tin",
                        "bottle",
                        "each",
                      ].map((u) => (
                        <SelectItem key={u} value={u}>
                          {u}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {!isService && (
              <div className="border border-slate-200 rounded-2xl p-5 space-y-4 bg-slate-50/50">
                <FormField
                  control={form.control}
                  name="isTracked"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-xl border border-slate-200 p-4 shadow-sm bg-white">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base font-semibold text-slate-700">
                          Track Inventory
                        </FormLabel>
                        <FormDescription>
                          Enable stock tracking for this item
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value || false}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                {isTracked && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="stockLevel"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-slate-700 font-semibold">
                            Current Stock
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              {...field}
                              value={field.value || "0"}
                              className="rounded-xl bg-white border-slate-200 focus-visible:ring-primary/20"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="lowStockThreshold"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-slate-700 font-semibold">
                            Low Stock Alert
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              {...field}
                              value={field.value || "10"}
                              className="rounded-xl bg-white border-slate-200 focus-visible:ring-primary/20"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}
              </div>
            )}

            <FormField
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-xl border-slate-200 border p-4 shadow-sm bg-slate-50">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base font-semibold text-slate-700">
                      Active Status
                    </FormLabel>
                    <FormDescription>
                      Inactive items won't appear in lists
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value ?? true}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                className="rounded-xl border-slate-200 text-slate-600 hover:text-slate-900"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={updateProduct.isPending}
                className="rounded-xl bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20"
              >
                {updateProduct.isPending && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                Save Changes
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
