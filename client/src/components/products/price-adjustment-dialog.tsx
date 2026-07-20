import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAdjustPrice, usePriceHistory } from "@/hooks/use-products";
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
import { Textarea } from "@/components/ui/textarea";
import { Tag, Loader2, History, AlertCircle, Calendar, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";
import { type ReactNode, useState } from "react";

const priceAdjustmentSchema = z.object({
  productId: z.number(),
  newPrice: z
    .string()
    .transform((v) => parseFloat(v))
    .pipe(z.number().positive()),
  reason: z.string().min(3, "Please provide a reason for the price change"),
  effectiveFrom: z.string().optional(),
});

type PriceAdjustmentFormValues = z.infer<typeof priceAdjustmentSchema>;

export function PriceAdjustmentDialog({
  product,
  companyId,
  children,
}: {
  product: Product;
  companyId: number;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const adjustMutation = useAdjustPrice(companyId);
  const { data: history, isLoading: historyLoading } = usePriceHistory(
    product.id,
  );

  const form = useForm<PriceAdjustmentFormValues>({
    // @ts-ignore
    resolver: zodResolver(priceAdjustmentSchema),
    defaultValues: {
      productId: product.id,
      newPrice: "" as any,
      reason: "",
      effectiveFrom: format(new Date(), "yyyy-MM-dd"),
    },
  });

  const onSubmit = async (data: PriceAdjustmentFormValues) => {
    try {
      await adjustMutation.mutateAsync({
        id: product.id,
        data,
      });
      toast({
        title: "Price Updated",
        description: `Successfully updated the price for ${product.name}.`,
      });
      setOpen(false);
      form.reset();
    } catch (error: any) {
      toast({
        title: "Update Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const currentPriceNum = parseFloat(product.price?.toString() || "0");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children || (
          <Button
            variant="outline"
            size="sm"
            className="gap-2 border-indigo-200 text-indigo-700 hover:bg-indigo-50 hover:border-indigo-300"
          >
            <Tag className="w-4 h-4" />
            Manage Price
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-xl w-[95vw] h-[90dvh] md:h-[560px] max-h-[90dvh] rounded-2xl md:rounded-3xl overflow-hidden p-0">
        <div className="flex flex-col md:flex-row h-full min-h-0 relative">
          {/* Left Side: Form */}
          <div className="flex-1 min-h-0 bg-white flex flex-col">
            <DialogClose asChild>
              <Button
                variant="ghost"
                size="icon"
                className="absolute left-4 top-4 rounded-full text-slate-300 hover:text-slate-600 hover:bg-slate-100 z-50"
              >
                <X className="w-5 h-5" />
              </Button>
            </DialogClose>

            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="flex flex-1 min-h-0 flex-col"
              >
                <div className="flex-1 overflow-y-auto px-4 pb-4 pt-5 md:p-6 md:pb-4">
                  <DialogHeader className="mb-4">
                    <DialogTitle className="text-lg md:text-xl font-display font-bold text-slate-900">
                      Adjust Selling Price
                    </DialogTitle>
                    <DialogDescription>
                      Set a new price for{" "}
                      <span className="font-bold text-slate-900">
                        {product.name}
                      </span>
                      .
                    </DialogDescription>
                  </DialogHeader>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-4">
                    <div className="min-w-0 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">
                      <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block leading-none mb-1">
                        Current
                      </span>
                      <span className="block  font-black text-slate-900 truncate">
                        ${currentPriceNum.toFixed(2)}
                      </span>
                    </div>
                    <div className="min-w-0 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
                      <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider block leading-none mb-1">
                        Cost
                      </span>
                      <span className="block  font-black text-emerald-900 truncate">
                        $
                        {parseFloat(
                          product.costPrice?.toString() || "0",
                        ).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <FormField
                      control={form.control}
                      name="newPrice"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-slate-700 font-semibold ">
                            New Selling Price
                          </FormLabel>
                          <FormControl>
                            <div className="relative">
                              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">
                                $
                              </span>
                              <Input
                                type="number"
                                step="0.01"
                                placeholder="0.00"
                                {...field}
                                className="pl-8 h-10 md:h-11 rounded-xl bg-white border-slate-200 focus:ring-indigo-500/20 text-base font-bold"
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="effectiveFrom"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-slate-700 font-semibold ">
                            Effective From (Optional)
                          </FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                              <Input
                                type="date"
                                {...field}
                                className="pl-10 rounded-xl bg-slate-50 border-slate-200 focus:ring-indigo-500/20"
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="reason"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-slate-700 font-semibold ">
                            Reason for Change
                          </FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Promotion, Cost Increase, etc..."
                              className="resize-none h-16 md:h-20 rounded-xl bg-white border-slate-200 focus-visible:ring-indigo-500/20"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <div className="flex shrink-0 justify-end gap-3 border-t border-slate-100 bg-white px-4 py-3 md:px-6">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setOpen(false)}
                    className="rounded-xl text-slate-500 font-bold"
                  >
                    Discard
                  </Button>
                  <Button
                    type="submit"
                    disabled={adjustMutation.isPending}
                    className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-500/20 px-5 md:px-6 font-bold h-10 md:h-11"
                  >
                    {adjustMutation.isPending && (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    )}
                    Update Price
                  </Button>
                </div>
              </form>
            </Form>
          </div>

          {/* Right Side: History */}
          <div className="w-full md:w-[240px] min-h-0 bg-slate-50 border-t md:border-t-0 md:border-l border-slate-100 flex flex-col">
            <div className="p-4 border-b border-slate-200 bg-white/50 backdrop-blur-sm sticky top-0 z-10">
              <div className="flex items-center gap-2 text-indigo-700 mb-1">
                <History className="w-4 h-4" />
                <span className="text-xs font-black uppercase tracking-widest leading-none mt-0.5">
                  Price Audit Log
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium">
                Historical price changes
              </p>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-4 space-y-4">
                {historyLoading ? (
                  <div className="flex items-center justify-center p-8 opacity-40">
                    <Loader2 className="w-5 h-5 animate-spin" />
                  </div>
                ) : !history || history.length === 0 ? (
                  <div className="text-center p-8">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 mx-auto mb-3">
                      <AlertCircle className="w-5 h-5" />
                    </div>
                    <p className="text-xs font-semibold text-slate-400">
                      No previous changes
                    </p>
                  </div>
                ) : (
                  history.map((item: any, idx: number) => (
                    <div key={item.id} className="relative pl-6">
                      {idx !== history.length - 1 && (
                        <div className="absolute left-[7px] top-[24px] bottom-[-24px] w-[2px] bg-indigo-100 rounded-full" />
                      )}
                      <div className="absolute left-0 top-[6px] w-[14px] h-[14px] rounded-full bg-white border-2 border-indigo-400 shadow-sm" />

                      <div className="space-y-1 mb-6">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className=" font-black text-slate-800">
                            ${parseFloat(item.newPrice).toFixed(2)}
                          </span>
                          <span className="text-[10px] font-bold text-slate-400">
                            {format(new Date(item.createdAt), "MMM d, yyyy")}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400 mb-1">
                          <span className="line-through">
                            ${parseFloat(item.oldPrice).toFixed(2)}
                          </span>
                          <span>→</span>
                          <span className="text-indigo-600">NEW</span>
                        </div>
                        <p className="text-[11px] text-slate-600 bg-white/50 border border-slate-200/50 p-2 rounded-lg leading-tight shadow-sm font-medium">
                          {item.reason}
                        </p>
                        {item.user && (
                          <div className="text-[9px] font-black text-slate-400 uppercase tracking-tighter mt-1 flex items-center gap-1">
                            BY {item.user.username}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
