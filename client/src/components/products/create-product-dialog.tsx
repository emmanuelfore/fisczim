import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertProductSchema, type InsertProduct } from "@shared/schema";
import { useCreateProduct } from "@/hooks/use-products";
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
import { Plus, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { ImageUpload } from "@/components/ui/image-upload";
import { HsCodeAssistant } from "@/components/products/hs-code-assistant";

export function CreateProductDialog({
  companyId,
  triggerLabel,
  defaultType = "good",
}: {
  companyId: number;
  triggerLabel?: string;
  defaultType?: "good" | "service";
}) {
  const resolvedLabel = triggerLabel ?? (defaultType === "service" ? "Add Service" : "Add Product");
  const [open, setOpen] = useState(false);
  const [isService, setIsService] = useState(defaultType === "service");
  const createProduct = useCreateProduct(companyId);
  const { taxCategories, taxTypes } = useTaxConfig(companyId);
  const { toast } = useToast();

  const { data: categories } = useQuery({
    queryKey: ["product-categories", companyId],
    queryFn: async () => {
      const res = await apiFetch(
        `/api/product-categories?companyId=${companyId}`,
      );
      if (!res.ok) throw new Error("Failed to fetch categories");
      return res.json();
    },
    enabled: open,
  });
  const { data: costCenters = [] } = useCostCenters(companyId);

  const form = useForm<InsertProduct>({
    resolver: zodResolver(insertProductSchema),
    defaultValues: {
      name: "",
      description: "",
      sku: "",
      barcode: "",
      hsCode: "",
      category: "",
      ownerGroup: "",
      price: "0.00",
      costPrice: "0.00",
      taxRate: "15.00",
      taxCategoryId: undefined, // Will be set by select
      brandName: "",
      oemPartNumber: "",
      supplierPartNumber: "",
      fitmentNotes: "",
      serialTrackingEnabled: false,
      batchTrackingEnabled: false,
      warrantyTrackingEnabled: false,
      warrantyMonths: 0,
      isActive: true,
      isTracked: true,
      stockLevel: "0",
      lowStockThreshold: "10",
      productType: "good",
      companyId: companyId,
      taxTypeId: undefined,
    },
  });

  // Update isTracked when isService changes
  useEffect(() => {
    if (isService) {
      form.setValue("isTracked", false);
      form.setValue("productType", "service");
    } else {
      form.setValue("isTracked", true);
      form.setValue("productType", "good");
    }
  }, [isService, form]);

  const onSubmit = async (data: InsertProduct) => {
    try {
      const { companyId: _, ...rest } = data;
      await createProduct.mutateAsync({ ...rest, productType: isService ? "service" : "good" });
      toast({
        title: "Success",
        description: `${isService ? "Service" : "Product"} created successfully.`,
      });
      setOpen(false);
      form.reset({
        ...form.getValues(),
        name: "",
        description: "",
        price: "0.00",
      });
    } catch (error: any) {
      console.error("Failed to create product:", error);
      toast({
        title: "Creation Failed",
        description: error.message || "An unexpected error occurred.",
        variant: "destructive",
      });
    }
  };

  const isTracked = form.watch("isTracked");

  const [selectedTaxTypeId, setSelectedTaxTypeId] = useState<
    string | undefined
  >(undefined);

  // Sync with default value or tax types load
  useEffect(() => {
    if (taxTypes.data && !selectedTaxTypeId && open) {
      const defaultType = taxTypes.data?.find(
        (t: any) => t.rate === form.getValues("taxRate"),
      );
      if (defaultType) setSelectedTaxTypeId(defaultType.id.toString());
    }
  }, [taxTypes.data, open]);

  return (
    <Dialog
      open={open}
      onOpenChange={(val) => {
        setOpen(val);
        if (!val) setSelectedTaxTypeId(undefined);
      }}
    >
      <DialogTrigger asChild>
        <Button className={`gap-2 rounded-xl transition-all duration-300 hover:-translate-y-0.5 ${
          defaultType === "service"
            ? "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 shadow-sm"
            : "bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white shadow-lg shadow-indigo-500/20"
        }`}>
          <Plus className="w-4 h-4" />
          {resolvedLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-display font-bold text-slate-900">
            Add New {isService ? "Service" : "Product"}
          </DialogTitle>
          <DialogDescription>
            Create a {isService ? "service offering" : "physical product"} to
            add to your invoices.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-5 py-4"
          >
            {/* Type Toggle */}
            <FormField
              control={form.control}
              name="productType"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-xl border border-slate-200 p-4 bg-slate-50">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base font-semibold text-slate-900">
                      {isService ? "Service" : "Product"}
                    </FormLabel>
                    <FormDescription className="text-sm text-slate-600">
                      {isService
                        ? "This is a service offering (no inventory tracking)"
                        : "This is a physical product (with inventory tracking)"}
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={isService}
                      onCheckedChange={(checked) => {
                        setIsService(checked);
                        field.onChange(checked ? "service" : "good");
                      }}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

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

            {/* Recipe / source deduction flags - only for products */}
            {!isService && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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
                          Turn OFF to hide from POS and invoice picker (e.g. raw materials for internal use only)
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
                        value={selectedTaxTypeId}
                      >
                        <FormControl>
                          <SelectTrigger className="rounded-xl bg-white border-blue-200 focus:ring-blue-500/20 text-slate-700">
                            <SelectValue placeholder="Select Tax Type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="rounded-xl shadow-xl">
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
                        initialQuery={[
                          form.watch("name"),
                          form.watch("category"),
                          form.watch("description"),
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

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                disabled={createProduct.isPending}
                className="rounded-xl bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20"
              >
                {createProduct.isPending && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                Save {isService ? "Service" : "Product"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
