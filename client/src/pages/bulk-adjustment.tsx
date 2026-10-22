import { QuantityInput } from "@/components/ui/quantity-input";
import { Layout } from "@/components/layout";
import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useInventoryAdjust } from "@/hooks/use-inventory";
import { useProducts } from "@/hooks/use-products";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useBranchContext } from "@/lib/branch-context";
import { type Product } from "@shared/schema";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  PlusCircle,
  Loader2,
  Trash2,
  AlertCircle,
  ArrowRightLeft,
  Search,
  ChevronLeft,
  Package,
  Plus,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {

  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const itemSchema = z.object({
  productId: z.number({ required_error: "Required" }),
  variationId: z.number().optional(),
  actualQuantity: z
    .string()
    .transform((v) => parseFloat(v))
    .pipe(z.number().min(0)),
  type: z.enum(["ADJUSTMENT", "SHRINKAGE", "CORRECTION", "DAMAGE", "EXPIRY"]),
  notes: z.string().optional(),
});

const bulkAdjustmentSchema = z.object({
  items: z.array(itemSchema).min(1, "At least one item is required"),
  globalNotes: z.string().optional(),
});

type BulkAdjustmentFormValues = z.infer<typeof bulkAdjustmentSchema>;

export default function BulkAdjustmentPage() {
  const [, setLocation] = useLocation();
  const { activeCompanyId } = useActiveCompany();
  const { selectedBranchId } = useBranchContext();
  const companyId = activeCompanyId || 0;
  const branchId = selectedBranchId || undefined;

  const { toast } = useToast();
  const { data: allProducts } = useProducts(companyId, branchId);
  const adjustMutation = useInventoryAdjust(companyId);
  const [searchOpen, setSearchOpen] = useState(false);

  const form = useForm<BulkAdjustmentFormValues>({
    // @ts-ignore
    resolver: zodResolver(bulkAdjustmentSchema),
    defaultValues: {
      items: [],
      globalNotes: "",
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  const onSubmit = async (data: BulkAdjustmentFormValues) => {
    try {
      let processed = 0;
      for (const item of data.items) {
        const product = trackedProducts.find((p) => p.id === item.productId);
        const systemQuantity = Number(
          (product as any)?.branchStock ?? product?.stockLevel ?? 0,
        );
        const quantity = item.actualQuantity - systemQuantity;
        if (quantity === 0) continue;
        await adjustMutation.mutateAsync({
          productId: item.productId,
          variationId: item.variationId,
          quantity,
          type: item.type,
          notes: item.notes || data.globalNotes,
          branchId,
        });
        processed += 1;
      }

      toast({
        title: "Bulk Adjustment Complete",
        description: `Successfully adjusted ${processed} items.`,
      });
      form.reset();
      setLocation("/inventory/adjustments");
    } catch (error: any) {
      toast({
        title: "Some Adjustments Failed",
        description:
          "One or more adjustments could not be processed. Please check your inventory levels.",
        variant: "destructive",
      });
    }
  };

  const trackedProducts = allProducts?.filter((p) => p.isTracked) || [];

  const addProduct = (product: Product) => {
    const alreadyAdded = fields.some((f) => f.productId === product.id);
    if (alreadyAdded) {
      toast({
        title: "Already added",
        description: `${product.name} is already in the list.`,
        variant: "destructive",
      });
      return;
    }
    append({
      productId: product.id,
      actualQuantity: "" as any,
      type: "ADJUSTMENT",
      notes: "",
    });
    setSearchOpen(false);
  };

  const addProducts = (productsToAdd: Product[]) => {
    const existing = new Set(fields.map((field) => field.productId));
    const additions = productsToAdd.filter(
      (product) => !existing.has(product.id),
    );
    additions.forEach((product) => {
      append({
        productId: product.id,
        actualQuantity: "" as any,
        type: "ADJUSTMENT",
        notes: "",
      });
    });
    if (additions.length === 0) {
      toast({
        title: "Nothing to add",
        description: "All selected products are already in the list.",
        variant: "destructive",
      });
    } else {
      setSearchOpen(false);
    }
  };

  return (
    <Layout>
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Link href="/inventory/adjustments">
            <Button variant="ghost" size="icon" className="rounded-full">
              <ChevronLeft className="w-5 h-5" />
            </Button>
          </Link>
        </div>

        <Popover open={searchOpen} onOpenChange={setSearchOpen}>
          <PopoverTrigger asChild>
            <Button className="rounded-2xl bg-primary text-white hover:bg-primary/90 shadow-xl shadow-primary/20 gap-3 h-14 px-8 font-black uppercase tracking-widest text-xs">
              <Plus className="w-5 h-5" />
              Add Product To List
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="w-[400px] p-0 rounded-3xl overflow-hidden shadow-2xl border-slate-100"
            align="end"
          >
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 p-3">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Select products
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 rounded-xl text-[10px] font-black"
                onClick={() => addProducts(trackedProducts as Product[])}
              >
                Add All
              </Button>
            </div>
            <Command className="rounded-none">
              <CommandInput
                placeholder="Search catalog by name or SKU..."
                className="h-14 font-medium"
              />
              <CommandList className="max-h-[300px]">
                <CommandEmpty className="py-6 text-center text-slate-400 font-bold text-xs">
                  No matching products found.
                </CommandEmpty>
                <CommandGroup>
                  {trackedProducts.map((p) => (
                    <CommandItem
                      key={p.id}
                      value={`${p.name} ${p.sku}`}
                      onSelect={() => addProduct(p)}
                      className="p-4 cursor-pointer hover:bg-slate-50 flex items-center justify-between group"
                    >
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-700 group-hover:text-primary transition-colors">
                          {p.name}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400 uppercase">
                          {p.sku || "No SKU"}
                        </span>
                      </div>
                      <Badge
                        variant="secondary"
                        className="bg-slate-100 text-slate-500 text-[9px] font-bold"
                      >
                        In Stock: {p.branchStock || p.stockLevel || 0}
                      </Badge>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      <Card className="border-none shadow-2xl bg-white rounded-[2.5rem] flex flex-col overflow-hidden ring-1 ring-slate-100">
        <CardHeader className="border-b border-slate-50 px-8 py-5 bg-slate-50/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-2xl bg-slate-900 flex items-center justify-center text-white">
                <ArrowRightLeft className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="text-lg font-bold text-slate-900 leading-none mb-1">
                  Adjustment Matrix
                </CardTitle>
                <CardDescription className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                  Digital Stock Reconciliation Log
                </CardDescription>
              </div>
            </div>
            <div className="bg-amber-50 text-amber-600 px-4 py-2 rounded-xl border border-amber-100 flex gap-2 items-center text-[10px] font-black uppercase tracking-widest ring-1 ring-amber-500/5">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>Enter actual counted quantity</span>
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex-1 p-0 flex flex-col min-h-[400px]">
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="flex-1 flex flex-col"
            >
              <ScrollArea className="flex-1">
                <div className="p-0">
                  {fields.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-32 text-slate-400 opacity-50">
                      <div className="w-20 h-20 rounded-[2.5rem] bg-slate-50 flex items-center justify-center mb-4">
                        <Package className="w-10 h-10" />
                      </div>
                      <p className="font-black text-lg text-slate-900 mb-1">
                        List is Empty
                      </p>
                      <p className="text-[11px] font-bold uppercase tracking-widest">
                        Add products using the button above
                      </p>
                    </div>
                  ) : (
                    <table className="w-full text-left border-collapse table-fixed">
                      <thead className="bg-slate-50/50 sticky top-0 z-10 backdrop-blur-md">
                        <tr className="border-b border-slate-100">
                          <th className="px-6 py-3 font-black text-slate-400 uppercase tracking-[0.2em] text-[9px] w-12 text-center pointer-events-none">
                            #
                          </th>
                          <th className="px-4 py-3 font-black text-slate-400 uppercase tracking-[0.2em] text-[9px] pointer-events-none">
                            Identity
                          </th>
                          <th className="px-4 py-3 font-black text-slate-400 uppercase tracking-[0.2em] text-[9px] w-24 text-center pointer-events-none">
                            Current
                          </th>
                          <th className="px-4 py-3 font-black text-slate-400 uppercase tracking-[0.2em] text-[9px] w-48 text-center pointer-events-none">
                            Type
                          </th>
                          <th className="px-4 py-3 font-black text-slate-400 uppercase tracking-[0.2em] text-[9px] w-28 text-center pointer-events-none">
                            Actual
                          </th>
                          <th className="px-4 py-3 font-black text-slate-400 uppercase tracking-[0.2em] text-[9px] pointer-events-none">
                            Audit Notes
                          </th>
                          <th className="px-6 py-3 w-14 text-center"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {fields.map((field, index) => {
                          const product = trackedProducts.find(
                            (p) => p.id === field.productId,
                          );
                          const systemQuantity = Number(
                            (product as any)?.branchStock ??
                              product?.stockLevel ??
                              0,
                          );
                          const actualQuantityValue = form.watch(
                            `items.${index}.actualQuantity`,
                          );
                          const actualQuantity = Number(actualQuantityValue);
                          const quantityChange =
                            String(actualQuantityValue ?? "").trim() &&
                            Number.isFinite(actualQuantity)
                              ? actualQuantity - systemQuantity
                              : null;
                          return (
                            <tr
                              key={field.id}
                              className="group hover:bg-slate-50/50 transition-all bg-white border-b border-slate-50 last:border-0 h-11"
                            >
                              <td className="px-6 py-1 align-middle text-center">
                                <span className="text-[10px] font-black text-slate-300">
                                  {index + 1}
                                </span>
                              </td>
                              <td className="px-4 py-1 align-middle">
                                <div className="flex flex-col overflow-hidden">
                                  <span className="font-black text-slate-800  truncate leading-tight">
                                    {product?.name}
                                  </span>
                                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-tighter font-mono truncate">
                                    {product?.sku || "NO-SKU"}
                                  </span>
                                </div>
                              </td>
                              <td className="px-4 py-1 align-middle text-center">
                                <Badge
                                  variant="outline"
                                  className="bg-white border-slate-100 text-slate-600 px-2 h-7 font-mono text-[11px] font-black shadow-none pointer-events-none"
                                >
                                  {systemQuantity}
                                </Badge>
                              </td>
                              <td className="px-4 py-1 align-middle">
                                <FormField
                                  control={form.control}
                                  name={`items.${index}.type`}
                                  render={({ field }) => (
                                    <FormItem>
                                      <Select
                                        onValueChange={field.onChange}
                                        defaultValue={field.value}
                                      >
                                        <FormControl>
                                          <SelectTrigger className="rounded-xl h-8 bg-white border-slate-100 focus:ring-primary/5 text-[11px] font-black text-slate-600 shadow-none">
                                            <SelectValue />
                                          </SelectTrigger>
                                        </FormControl>
                                        <SelectContent className="rounded-2xl shadow-2xl p-1 border-slate-50">
                                          <SelectItem
                                            value="ADJUSTMENT"
                                            className="rounded-xl text-[11px] font-bold"
                                          >
                                            Adjustment
                                          </SelectItem>
                                          <SelectItem
                                            value="SHRINKAGE"
                                            className="rounded-xl text-[11px] font-bold"
                                          >
                                            Shrinkage
                                          </SelectItem>
                                          <SelectItem
                                            value="CORRECTION"
                                            className="rounded-xl text-[11px] font-bold"
                                          >
                                            Correction
                                          </SelectItem>
                                          <SelectItem
                                            value="DAMAGE"
                                            className="rounded-xl text-[11px] font-bold text-rose-500"
                                          >
                                            Damage
                                          </SelectItem>
                                          <SelectItem
                                            value="EXPIRY"
                                            className="rounded-xl text-[11px] font-bold"
                                          >
                                            Expiry
                                          </SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </FormItem>
                                  )}
                                />
                              </td>
                              <td className="px-4 py-1 align-middle">
                                <FormField
                                  control={form.control}
                                  name={`items.${index}.actualQuantity`}
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormControl>
                                        <QuantityInput
                                          type="number"
                                          min="0"
                                          step="0.01"
                                          placeholder={systemQuantity.toString()}
                                          {...field}
                                          className="rounded-xl h-8 bg-white border-slate-100 focus:ring-primary/5 font-mono font-black  text-center text-slate-800 shadow-none"
                                        />
                                      </FormControl>
                                    </FormItem>
                                  )}
                                />
                                <p className="mt-1 text-center text-[9px] font-black text-slate-400">
                                  {quantityChange === null ? (
                                    "Diff -"
                                  ) : (
                                    <span
                                      className={
                                        quantityChange > 0
                                          ? "text-emerald-600"
                                          : quantityChange < 0
                                            ? "text-rose-600"
                                            : "text-slate-400"
                                      }
                                    >
                                      Diff {quantityChange > 0 ? "+" : ""}
                                      {quantityChange.toFixed(2)}
                                    </span>
                                  )}
                                </p>
                              </td>
                              <td className="px-4 py-1 align-middle">
                                <FormField
                                  control={form.control}
                                  name={`items.${index}.notes`}
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormControl>
                                        <Input
                                          placeholder="Reasoning..."
                                          {...field}
                                          className="rounded-xl h-8 bg-white border-slate-100 text-[11px] font-medium focus:ring-primary/5 italic text-slate-500 shadow-none"
                                        />
                                      </FormControl>
                                    </FormItem>
                                  )}
                                />
                              </td>
                              <td className="px-6 py-1 align-middle text-center">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => remove(index)}
                                  className="h-8 w-8 rounded-full text-slate-200 hover:text-rose-500 hover:bg-rose-50 transition-all opacity-0 group-hover:opacity-100 shadow-none"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </ScrollArea>

              {fields.length > 0 && (
                <div className="p-6 border-t border-slate-100 bg-slate-50/30 flex flex-col gap-4">
                  <div className="flex items-center justify-between p-6 rounded-[2rem] bg-slate-900 text-white shadow-xl">
                    <div className="flex gap-8 items-center">
                      <div className="flex flex-col">
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-0.5">
                          Batch
                        </span>
                        <span className="text-xl font-black">
                          {fields.length}{" "}
                          <span className="text-[10px] font-bold text-slate-500">
                            Unprocessed
                          </span>
                        </span>
                      </div>
                      <div className="w-px h-8 bg-white/10" />
                      <FormField
                        control={form.control}
                        name="globalNotes"
                        render={({ field }) => (
                          <FormItem className="flex-1 min-w-[300px]">
                            <FormControl>
                              <Input
                                placeholder="Global Batch reference (optional)..."
                                className="rounded-xl h-11 bg-white/5 border-white/10 focus:ring-primary/10 text-xs shadow-none text-white font-medium"
                                {...field}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="flex gap-3">
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => form.reset()}
                        className="rounded-xl px-6 h-11 font-black uppercase text-[10px] tracking-widest text-slate-400 hover:text-white hover:bg-white/5 transition-all"
                      >
                        Reset
                      </Button>
                      <Button
                        type="submit"
                        disabled={
                          fields.length === 0 || adjustMutation.isPending
                        }
                        className="rounded-xl px-10 bg-white text-slate-900 hover:bg-white/90 shadow-none font-black uppercase tracking-widest text-[10px] h-11 min-w-[200px]"
                      >
                        {adjustMutation.isPending ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Writing...
                          </>
                        ) : (
                          "Commit Adjustments"
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </form>
          </Form>
        </CardContent>
      </Card>
    </Layout>
  );
}
