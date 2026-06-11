import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
} from "@/components/ui/dialog";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useProducts } from "@/hooks/use-products";
import { useInventoryAdjust } from "@/hooks/use-inventory";
import { useToast } from "@/hooks/use-toast";
import { SlidersHorizontal, Package, AlertTriangle } from "lucide-react";

const adjustmentSchema = z.object({
    productId: z.string().min(1, "Product is required"),
    type: z.enum(["SHRINKAGE", "ADJUSTMENT"]),
    actualQuantity: z.string().min(1, "Actual quantity required").refine((val) => !isNaN(Number(val)) && Number(val) >= 0, "Must be zero or more"),
    notes: z.string().min(5, "Please provide a clear reason"),
});

type AdjustmentFormValues = z.infer<typeof adjustmentSchema>;

export function AdjustmentForm() {
    const [open, setOpen] = useState(false);
    const companyId = parseInt(localStorage.getItem("selectedCompanyId") || "0");
    const { data: products } = useProducts(companyId);
    const { mutate: adjustStock, isPending } = useInventoryAdjust(companyId);
    const { toast } = useToast();

    const form = useForm<AdjustmentFormValues>({
        resolver: zodResolver(adjustmentSchema),
        defaultValues: {
            productId: "",
            type: "SHRINKAGE",
            actualQuantity: "",
            notes: "",
        },
    });
    const selectedProductId = form.watch("productId");
    const actualQuantityValue = form.watch("actualQuantity");
    const actualQuantity = Number(actualQuantityValue);
    const selectedProduct = products?.find((product) => product.id.toString() === selectedProductId);
    const systemQuantity = Number((selectedProduct as any)?.branchStock ?? selectedProduct?.stockLevel ?? 0);
    const quantityChange = String(actualQuantityValue ?? "").trim() && Number.isFinite(actualQuantity) ? actualQuantity - systemQuantity : null;

    const onSubmit = (values: AdjustmentFormValues) => {
        const selected = products?.find((product) => product.id.toString() === values.productId);
        const currentStock = Number((selected as any)?.branchStock ?? selected?.stockLevel ?? 0);
        const delta = Number(values.actualQuantity) - currentStock;
        if (delta === 0) {
            toast({
                title: "No Stock Change",
                description: "The actual quantity matches the system quantity.",
                variant: "destructive",
            });
            return;
        }
        adjustStock({
            productId: parseInt(values.productId),
            type: values.type,
            quantity: delta,
            notes: values.notes,
        }, {
            onSuccess: (data: any) => {
                toast({
                    title: data?.pendingApproval ? "Submitted for Approval" : "Stock Adjusted",
                    description: data?.pendingApproval
                        ? "Your stock adjustment is waiting for manager approval."
                        : "The inventory adjustment has been recorded.",
                });
                setOpen(false);
                form.reset();
            },
            onError: (error: any) => {
                toast({
                    title: "Adjustment Failed",
                    description: error.message || "Failed to record adjustment",
                    variant: "destructive",
                });
            }
        });
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" className="rounded-2xl gap-2 font-bold shadow-sm">
                    <SlidersHorizontal className="h-4 w-4 text-violet-500" />
                    Adjust Stock
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px] rounded-[1.5rem] border-none shadow-2xl p-0 overflow-hidden">
                <DialogHeader className="p-6 bg-slate-50/50 border-b border-slate-100 flex flex-row items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
                        <AlertTriangle className="h-5 w-5 text-orange-500" />
                    </div>
                    <div>
                        <DialogTitle className="text-xl font-black font-display uppercase tracking-tight">Stock Adjustment</DialogTitle>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Shrinkage / Discrepancies</p>
                    </div>
                </DialogHeader>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="p-6 space-y-4">
                        <FormField
                            control={form.control}
                            name="type"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400">Adjustment Type</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                            <SelectTrigger className="h-12 border-slate-200 rounded-xl focus:ring-orange-500/20 font-bold">
                                                <SelectValue placeholder="Select type" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent className="rounded-xl shadow-xl border-slate-200">
                                            <SelectItem value="SHRINKAGE" className="font-medium text-red-600">Shrinkage (Loss/Damage)</SelectItem>
                                            <SelectItem value="ADJUSTMENT" className="font-medium text-slate-700">General Adjustment</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="productId"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400">Product</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value}>
                                        <FormControl>
                                            <SelectTrigger className="h-12 border-slate-200 rounded-xl focus:ring-orange-500/20 font-medium">
                                                <SelectValue placeholder="Select a product to adjust" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent className="rounded-xl shadow-xl border-slate-200 max-h-[250px]">
                                            {products?.filter(p => p.isTracked).map((product) => (
                                                <SelectItem key={product.id} value={product.id.toString()} className="font-medium">
                                                    {product.name} <span className="text-slate-400 font-mono text-xs ml-2">(Stock: {product.stockLevel})</span>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        {selectedProduct && (
                            <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-xs font-bold text-slate-600">
                                System quantity: <span className="font-mono text-slate-900">{systemQuantity.toFixed(2)}</span>
                                {quantityChange !== null && (
                                    <span className="ml-3">
                                        Ledger change: <span className={quantityChange > 0 ? "text-emerald-600" : quantityChange < 0 ? "text-rose-600" : "text-slate-500"}>{quantityChange > 0 ? "+" : ""}{quantityChange.toFixed(2)}</span>
                                    </span>
                                )}
                            </div>
                        )}

                        <FormField
                            control={form.control}
                            name="actualQuantity"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400">Actual Quantity Counted</FormLabel>
                                    <FormControl>
                                        <Input {...field} type="number" min="0" step="0.01" placeholder={selectedProduct ? systemQuantity.toString() : "Select a product first"} className="h-12 font-mono text-lg border-slate-200 rounded-xl focus:ring-orange-500/20" />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="notes"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400">Reason / Notes</FormLabel>
                                    <FormControl>
                                        <Textarea {...field} placeholder="Reason for this adjustment..." className="min-h-[80px] resize-none border-slate-200 rounded-xl focus:ring-orange-500/20" />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <div className="pt-4 flex gap-3">
                            <Button type="button" variant="ghost" onClick={() => setOpen(false)} className="flex-1 rounded-xl font-bold h-12">
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                className="flex-1 rounded-xl font-bold h-12 bg-slate-900 hover:bg-slate-800 text-white shadow-lg"
                                disabled={isPending}
                            >
                                {isPending ? "Applying..." : "Confirm Adjustment"}
                            </Button>
                        </div>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
