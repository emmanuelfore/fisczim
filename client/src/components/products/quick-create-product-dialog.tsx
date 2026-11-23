import { useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Plus } from "lucide-react";

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
import { useToast } from "@/hooks/use-toast";
import {
  refreshProductQueriesAsync,
  useCreateProduct,
} from "@/hooks/use-products";

const quickCreateProductSchema = z.object({
  name: z.string().min(1, "Name is required"),
  sku: z.string().min(1, "Code/SKU is required"),
  price: z.coerce.number().min(0, "Price cannot be negative"),
  costPrice: z.coerce.number().min(0, "Cost cannot be negative"),
  taxRate: z.coerce.number().min(0).max(100),
  productType: z.enum(["good", "service"]),
});

type QuickCreateProductInput = z.infer<typeof quickCreateProductSchema>;

function defaultValues(defaultName: string): QuickCreateProductInput {
  return {
    name: defaultName,
    sku: `AUTO-${Date.now().toString().slice(-6)}`,
    price: 0,
    costPrice: 0,
    taxRate: 15.5,
    productType: "good",
  };
}

export function QuickCreateProductDialog({
  companyId,
  onCreated,
  defaultName = "",
  triggerLabel = "New Item",
  children,
}: {
  companyId: number;
  onCreated?: (product: any) => void;
  defaultName?: string;
  triggerLabel?: string;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const createProduct = useCreateProduct(companyId);
  const { toast } = useToast();

  const form = useForm<QuickCreateProductInput>({
    resolver: zodResolver(quickCreateProductSchema),
    defaultValues: defaultValues(defaultName),
  });

  const onSubmit = async (data: QuickCreateProductInput) => {
    try {
      const product = await createProduct.mutateAsync({
        name: data.name.trim(),
        sku: data.sku.trim(),
        price: String(data.price),
        costPrice: String(data.costPrice),
        taxRate: String(data.taxRate),
        productType: data.productType,
        isActive: true,
        isTracked: data.productType === "good",
        isForSale: true,
      });

      // Make the new item available to the parent selector before selecting it.
      await refreshProductQueriesAsync(queryClient, companyId);

      setOpen(false);
      form.reset(defaultValues(""));
      toast({
        title: "Item created",
        description: `${product.name} has been added and selected.`,
      });
      onCreated?.(product);
    } catch (error: any) {
      toast({
        title: "Could not create item",
        description: error?.message || "Please check the details and try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (value && defaultName) form.setValue("name", defaultName);
      }}
    >
      <DialogTrigger asChild>
        {children ?? (
          <Button type="button" variant="outline" size="sm" className="h-9 gap-1 px-2 text-xs">
            <Plus className="h-3.5 w-3.5" />
            {triggerLabel}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg rounded-2xl">
        <DialogHeader>
          <DialogTitle>New item</DialogTitle>
          <DialogDescription>
            Create an item and select it without leaving this form.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Item name" autoFocus {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="sku"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Code / SKU</FormLabel>
                    <FormControl>
                      <Input placeholder="Required" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="productType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="good">Product</SelectItem>
                        <SelectItem value="service">Service</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Selling price</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" min="0" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="costPrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cost price</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.000001" min="0" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="taxRate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tax %</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" min="0" max="100" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex justify-end gap-2 border-t pt-4">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createProduct.isPending}>
                {createProduct.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create & select
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
