
import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useInventoryAdjust } from "@/hooks/use-inventory";
import { useProducts } from "@/hooks/use-products";
import { type Product } from "@shared/schema";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogClose,
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
    Plus, 
    ArrowRightLeft,
    Search,
    X
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

const itemSchema = z.object({
    productId: z.number({ required_error: "Required" }),
    variationId: z.number().optional(),
    actualQuantity: z.string().transform((v) => parseFloat(v)).pipe(z.number().min(0)),
    type: z.enum(['ADJUSTMENT', 'SHRINKAGE', 'CORRECTION', 'DAMAGE', 'EXPIRY']),
    notes: z.string().optional(),
});

const bulkAdjustmentSchema = z.object({
    items: z.array(itemSchema).min(1, "At least one item is required"),
    globalNotes: z.string().optional(),
});

type BulkAdjustmentFormValues = z.infer<typeof bulkAdjustmentSchema>;

export function BulkAdjustmentDialog({ companyId, branchId }: { companyId: number, branchId?: number }) {
    const [open, setOpen] = useState(false);
    const { toast } = useToast();
    const { data: allProducts } = useProducts(companyId, branchId);
    const adjustMutation = useInventoryAdjust(companyId);
    const [searchTerm, setSearchTerm] = useState("");

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
            // Processing items one by one for now since we don't have a bulk adjust endpoint
            // but we can wrap them in Promise.all or just loop
            // Better to add a bulk endpoint, but for now we follow existing patterns
            for (const item of data.items) {
                const product = trackedProducts.find((p) => p.id === item.productId);
                const systemQuantity = Number((product as any)?.branchStock ?? product?.stockLevel ?? 0);
                const quantity = item.actualQuantity - systemQuantity;
                if (quantity === 0) continue;
                await adjustMutation.mutateAsync({
                    productId: item.productId,
                    variationId: item.variationId,
                    quantity,
                    type: item.type,
                    notes: item.notes || data.globalNotes,
                    branchId
                });
            }
            
            toast({
                title: "Bulk Adjustment Complete",
                description: `Successfully adjusted ${data.items.length} items.`,
            });
            setOpen(false);
            form.reset();
        } catch (error: any) {
            toast({
                title: "Some Adjustments Failed",
                description: "One or more adjustments could not be processed. Please check your inventory levels.",
                variant: "destructive",
            });
        }
    };

    const trackedProducts = allProducts?.filter(p => p.isTracked) || [];
    const filteredProducts = trackedProducts.filter(p => 
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        p.sku?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const addProduct = (product: Product) => {
        const alreadyAdded = fields.some(f => f.productId === product.id);
        if (alreadyAdded) {
            toast({
                title: "Already added",
                description: `${product.name} is already in the list.`,
                variant: "destructive"
            });
            return;
        }
        append({
            productId: product.id,
            actualQuantity: "" as any,
            type: "ADJUSTMENT",
            notes: "",
        });
        setSearchTerm("");
    };

    const addProducts = (productsToAdd: Product[]) => {
        const existing = new Set(fields.map((field) => field.productId));
        const additions = productsToAdd.filter((product) => !existing.has(product.id));
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
                description: "All visible products are already in the list.",
                variant: "destructive"
            });
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button className="rounded-2xl bg-slate-900 text-white hover:bg-slate-800 shadow-lg shadow-slate-900/10 gap-2">
                    <PlusCircle className="w-4 h-4" />
                    New Bulk Adjustment
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl w-[95vw] h-[90vh] md:h-[750px] rounded-[2rem] md:rounded-[2.5rem] p-0 overflow-hidden border-none shadow-2xl">
                <div className="flex flex-col md:flex-row h-full relative">
                    <DialogClose asChild>
                        <Button variant="ghost" size="icon" className="absolute right-4 top-4 rounded-full text-slate-300 hover:text-slate-600 hover:bg-slate-100 z-50 md:hidden">
                            <X className="w-5 h-5" />
                        </Button>
                    </DialogClose>
                    {/* Left: Selection */}
                    <div className="w-full md:w-[320px] h-[300px] md:h-full bg-slate-50 border-b md:border-b-0 md:border-r border-slate-200/60 flex flex-col p-6">
                        <DialogHeader className="mb-6">
                            <DialogTitle className="text-xl font-display font-bold">Add Products</DialogTitle>
                            <DialogDescription className="text-xs">
                                Select products to adjust
                            </DialogDescription>
                        </DialogHeader>

                        <div className="relative mb-4 group">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-hover:text-primary transition-colors" />
                            <Input 
                                placeholder="Search products..." 
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-9 h-10 bg-white border-slate-200 rounded-xl text-sm focus:ring-primary/20"
                            />
                        </div>
                        <div className="flex items-center gap-2 mb-4">
                            <Button type="button" variant="outline" size="sm" className="h-8 rounded-xl text-[10px] font-black" onClick={() => addProducts(filteredProducts as Product[])}>
                                Add Visible
                            </Button>
                            <Button type="button" variant="ghost" size="sm" className="h-8 rounded-xl text-[10px] font-black text-slate-500" onClick={() => addProducts(trackedProducts as Product[])}>
                                Add All
                            </Button>
                        </div>

                        <ScrollArea className="flex-1 -mx-2 px-2">
                            <div className="space-y-1">
                                {filteredProducts.map(p => (
                                    <div 
                                        key={p.id}
                                        onClick={() => addProduct(p)}
                                        className="p-3 rounded-xl hover:bg-white hover:shadow-sm border border-transparent hover:border-slate-100 cursor-pointer transition-all group"
                                    >
                                        <p className="text-[13px] font-bold text-slate-700 group-hover:text-primary leading-tight mb-1">{p.name}</p>
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-mono text-slate-400">{p.sku || 'No SKU'}</span>
                                            <Badge variant="secondary" className="bg-slate-200/50 text-slate-500 text-[9px] font-bold py-0 h-4">
                                                Stock: {p.branchStock || p.stockLevel || 0}
                                            </Badge>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>
                    </div>

                    {/* Right: Form */}
                    <div className="flex-1 bg-white flex flex-col p-6 md:p-8 overflow-hidden relative">
                        <DialogClose asChild>
                            <Button variant="ghost" size="icon" className="absolute right-4 top-4 rounded-full text-slate-300 hover:text-slate-600 hover:bg-slate-100 z-50 hidden md:flex">
                                <X className="w-5 h-5" />
                            </Button>
                        </DialogClose>
                        <DialogHeader className="mb-6 md:mb-8">
                            <div className="flex items-center justify-between">
                                <div>
                                    <DialogTitle className="text-2xl font-display font-bold text-slate-900">Adjustment Items</DialogTitle>
                                    <DialogDescription className="text-sm">
                                        Setting stock levels for {fields.length} selected items
                                    </DialogDescription>
                                </div>
                                <div className="bg-amber-50 text-amber-700 p-3 rounded-2xl border border-amber-100 flex gap-2 items-center text-xs font-bold ring-1 ring-amber-500/10">
                                    <AlertCircle className="w-4 h-4" />
                                    <span>Enter actual counted quantity</span>
                                </div>
                            </div>
                        </DialogHeader>

                        <Form {...form}>
                            <form onSubmit={form.handleSubmit(onSubmit)} className="flex-1 flex flex-col overflow-hidden">
                                <ScrollArea className="flex-1 -mx-4 px-4 pr-6">
                                    <div className="space-y-6 pb-6">
                                        {fields.length === 0 ? (
                                            <div className="flex flex-col items-center justify-center py-20 text-slate-400 opacity-50">
                                                <div className="w-16 h-16 rounded-3xl bg-slate-50 flex items-center justify-center mb-4">
                                                    <ArrowRightLeft className="w-8 h-8" />
                                                </div>
                                                <p className="font-bold">No products added yet</p>
                                                <p className="text-xs">Search and click a product on the left to add it</p>
                                            </div>
                                        ) : (
                                            fields.map((field, index) => {
                                                const product = trackedProducts.find(p => p.id === field.productId);
                                                const systemQuantity = Number((product as any)?.branchStock ?? product?.stockLevel ?? 0);
                                                const actualQuantityValue = form.watch(`items.${index}.actualQuantity`);
                                                const actualQuantity = Number(actualQuantityValue);
                                                const quantityChange = String(actualQuantityValue ?? "").trim() && Number.isFinite(actualQuantity) ? actualQuantity - systemQuantity : null;
                                                return (
                                                    <div key={field.id} className="relative bg-slate-50/50 border border-slate-100 rounded-3xl p-5 group hover:border-slate-200 transition-all">
                                                        <Button 
                                                            type="button" 
                                                            variant="ghost" 
                                                            size="icon" 
                                                            onClick={() => remove(index)}
                                                            className="absolute -top-2 -right-2 h-8 w-8 rounded-full bg-white shadow-md text-red-400 hover:text-red-600 border border-slate-100 hover:scale-110 active:scale-95 transition-all"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </Button>

                                                        <div className="flex items-start gap-4 mb-4">
                                                            <div className="w-10 h-10 rounded-2xl bg-white border border-slate-100 flex items-center justify-center text-slate-400 shrink-0 font-display font-black text-xs shadow-sm">
                                                                {index + 1}
                                                            </div>
                                                            <div className="flex-1">
                                                                <h4 className="font-black text-slate-800 text-sm">{product?.name}</h4>
                                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{product?.sku || 'NO-SKU'}</p>
                                                            </div>
                                                            <div className="text-right">
                                                                <p className="text-[10px] font-black text-slate-300 uppercase tracking-tighter">Current Stock</p>
                                                                <p className="font-mono text-xs font-bold text-slate-600">{systemQuantity}</p>
                                                            </div>
                                                        </div>

                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                            <FormField
                                                                control={form.control}
                                                                name={`items.${index}.type`}
                                                                render={({ field }) => (
                                                                    <FormItem>
                                                                        <FormLabel className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Type</FormLabel>
                                                                        <Select
                                                                            onValueChange={field.onChange}
                                                                            defaultValue={field.value}
                                                                        >
                                                                            <FormControl>
                                                                                <SelectTrigger className="rounded-xl h-10 bg-white border-slate-200 focus:ring-amber-500/10">
                                                                                    <SelectValue />
                                                                                </SelectTrigger>
                                                                            </FormControl>
                                                                            <SelectContent className="rounded-xl shadow-xl">
                                                                                <SelectItem value="ADJUSTMENT">Adjustment</SelectItem>
                                                                                <SelectItem value="SHRINKAGE">Shrinkage</SelectItem>
                                                                                <SelectItem value="CORRECTION">Correction</SelectItem>
                                                                                <SelectItem value="DAMAGE">Damage</SelectItem>
                                                                                <SelectItem value="EXPIRY">Expiry</SelectItem>
                                                                            </SelectContent>
                                                                        </Select>
                                                                    </FormItem>
                                                                )}
                                                            />
                                                            <FormField
                                                                control={form.control}
                                                                name={`items.${index}.actualQuantity`}
                                                                render={({ field }) => (
                                                                    <FormItem>
                                                                        <FormLabel className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Actual Qty</FormLabel>
                                                                        <FormControl>
                                                                            <Input type="number" min="0" step="0.01" placeholder={systemQuantity.toString()} {...field} className="rounded-xl h-10 bg-white border-slate-200 focus:ring-amber-500/10 font-mono font-bold" />
                                                                        </FormControl>
                                                                    </FormItem>
                                                                )}
                                                            />
                                                        </div>
                                                        <p className="mt-3 text-[10px] font-black uppercase tracking-widest text-slate-400">
                                                            Ledger change: <span className={quantityChange && quantityChange > 0 ? "text-emerald-600" : quantityChange && quantityChange < 0 ? "text-rose-600" : "text-slate-500"}>{quantityChange === null ? "enter actual qty" : `${quantityChange > 0 ? "+" : ""}${quantityChange.toFixed(2)}`}</span>
                                                        </p>
                                                        <FormField
                                                            control={form.control}
                                                            name={`items.${index}.notes`}
                                                            render={({ field }) => (
                                                                <FormItem className="mt-3">
                                                                    <FormControl>
                                                                        <Input placeholder="Item specific notes (optional)" {...field} className="rounded-xl h-9 bg-white/50 border-slate-100 text-xs focus:ring-amber-500/10 italic" />
                                                                    </FormControl>
                                                                </FormItem>
                                                            )}
                                                        />
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                </ScrollArea>

                                <div className="pt-6 mt-6 border-t border-slate-100 space-y-4">
                                    <FormField
                                        control={form.control}
                                        name="globalNotes"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Global Batch Notes</FormLabel>
                                                <FormControl>
                                                    <Textarea 
                                                        placeholder="Add a reference reason for this entire batch of adjustments..." 
                                                        className="resize-none h-20 rounded-2xl bg-slate-50 border-slate-100 focus:ring-primary/10 text-sm"
                                                        {...field} 
                                                    />
                                                </FormControl>
                                            </FormItem>
                                        )}
                                    />

                                    <div className="flex justify-end gap-3 pt-2">
                                        <Button type="button" variant="ghost" onClick={() => setOpen(false)} className="rounded-2xl px-6 text-slate-500 font-bold">
                                            Cancel
                                        </Button>
                                        <Button 
                                            type="submit" 
                                            disabled={fields.length === 0 || adjustMutation.isPending} 
                                            className="rounded-2xl px-8 bg-amber-600 hover:bg-amber-700 text-white shadow-xl shadow-amber-600/20 font-bold h-12"
                                        >
                                            {adjustMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                            Process {fields.length} Adjustments
                                        </Button>
                                    </div>
                                </div>
                            </form>
                        </Form>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
