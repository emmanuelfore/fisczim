
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useInventoryAdjust } from "@/hooks/use-inventory";
import { type Product } from "@shared/schema";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
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
import { Settings2, Loader2, Info } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

const stockAdjustmentSchema = z.object({
    productId: z.number(),
    quantity: z.string().transform((v) => parseFloat(v)).pipe(z.number()),
    type: z.enum(['ADJUSTMENT', 'SHRINKAGE', 'CORRECTION', 'DAMAGE', 'EXPIRY']),
    notes: z.string().min(3, "Please provide a reason for the adjustment"),
});

type StockAdjustmentFormValues = z.infer<typeof stockAdjustmentSchema>;

export function StockAdjustmentDialog({ product, companyId, branchId }: { product: Product, companyId: number, branchId?: number }) {
    const [open, setOpen] = useState(false);
    const { toast } = useToast();
    const adjustMutation = useInventoryAdjust(companyId);

    const form = useForm<StockAdjustmentFormValues>({
        // @ts-ignore
        resolver: zodResolver(stockAdjustmentSchema),
        defaultValues: {
            productId: product.id,
            quantity: "" as any,
            type: "ADJUSTMENT",
            notes: "",
        },
    });

    const onSubmit = async (data: StockAdjustmentFormValues) => {
        try {
            await adjustMutation.mutateAsync({
                ...data,
                branchId
            });
            toast({
                title: "Stock Adjusted",
                description: `Successfully recorded ${data.type.toLowerCase()} for ${product.name}.`,
            });
            setOpen(false);
            form.reset();
        } catch (error: any) {
            toast({
                title: "Adjustment Failed",
                description: error.message,
                variant: "destructive",
            });
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2 border-amber-200 text-amber-700 hover:bg-amber-50 hover:border-amber-300">
                    <Settings2 className="w-4 h-4" />
                    Adjust Stock
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md rounded-3xl">
                <DialogHeader>
                    <div className="w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center text-amber-600 mb-4">
                        <Settings2 className="w-6 h-6" />
                    </div>
                    <DialogTitle className="text-2xl font-display font-bold text-slate-900">Manual Stock Adjustment</DialogTitle>
                    <DialogDescription>
                        Create a manual stock correction for <span className="font-bold text-slate-900">{product.name}</span>.
                    </DialogDescription>
                </DialogHeader>

                <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex gap-3 items-start mb-2">
                    <Info className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                    <div className="text-sm text-amber-800 leading-relaxed">
                        Use <span className="font-bold">positive numbers</span> to increase stock and <span className="font-bold">negative numbers</span> (e.g., -5) to decrease stock levels.
                    </div>
                </div>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <FormField
                                control={form.control}
                                name="type"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-slate-700 font-semibold">Adjustment Type</FormLabel>
                                        <Select
                                            onValueChange={field.onChange}
                                            value={field.value}
                                        >
                                            <FormControl>
                                                <SelectTrigger className="rounded-xl bg-slate-50 border-slate-200 focus:ring-amber-500/20">
                                                    <SelectValue placeholder="Select type" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent className="rounded-xl shadow-xl">
                                                <SelectItem value="ADJUSTMENT">General Adjustment</SelectItem>
                                                <SelectItem value="SHRINKAGE">Shrinkage / Theft</SelectItem>
                                                <SelectItem value="CORRECTION">System Correction</SelectItem>
                                                <SelectItem value="DAMAGE">Damaged Goods</SelectItem>
                                                <SelectItem value="EXPIRY">Expired Stock</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="quantity"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-slate-700 font-semibold">Qty Change</FormLabel>
                                        <FormControl>
                                            <Input type="number" step="0.01" placeholder="e.g. -5 or 10" {...field} className="rounded-xl bg-slate-50 border-slate-200 focus-visible:ring-amber-500/20" />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <FormField
                            control={form.control}
                            name="notes"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-slate-700 font-semibold">Reason for Adjustment</FormLabel>
                                    <FormControl>
                                        <Textarea placeholder="Explain why this adjustment is being made..." className="resize-none h-24 rounded-xl bg-slate-50 border-slate-200 focus-visible:ring-amber-500/20" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <div className="flex justify-end gap-3 pt-4">
                            <Button type="button" variant="outline" onClick={() => setOpen(false)} className="rounded-xl border-slate-200">
                                Cancel
                            </Button>
                            <Button type="submit" disabled={adjustMutation.isPending} className="rounded-xl bg-amber-600 hover:bg-amber-700 text-white shadow-lg shadow-amber-500/20">
                                {adjustMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                Save Adjustment
                            </Button>
                        </div>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
