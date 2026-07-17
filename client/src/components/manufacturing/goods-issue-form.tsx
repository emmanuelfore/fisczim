import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { useActiveCompany } from "@/hooks/use-active-company";

const goodsIssueSchema = z.object({
  productId: z.coerce.number().min(1, "Product is required"),
  quantity: z.coerce.number().min(0.0001, "Quantity must be greater than 0"),
  type: z.enum(["ISSUE", "RETURN", "SCRAP"]).default("ISSUE"),
  notes: z.string().optional(),
});

export function GoodsIssueForm({ productionRunId, onSuccess }: { productionRunId: number, onSuccess?: () => void }) {
  const { activeCompanyId: companyId } = useActiveCompany();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: products } = useQuery({
    queryKey: [`/api/companies/${companyId}/products`],
    enabled: !!companyId,
  });

  const form = useForm<z.infer<typeof goodsIssueSchema>>({
    resolver: zodResolver(goodsIssueSchema),
    defaultValues: {
      type: "ISSUE",
      quantity: 1,
    }
  });

  const mutation = useMutation({
    mutationFn: async (data: z.infer<typeof goodsIssueSchema>) => {
      const endpoint = data.type === "RETURN" ? "goods-returns" : "goods-issues";
      const payload = {
        ...data,
        // Using goods-issues handles both ISSUE and SCRAP, goods-returns handles RETURNS
      };
      
      const res = await apiRequest("POST", `/api/companies/${companyId}/manufacturing/production-runs/${productionRunId}/${endpoint}`, payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${companyId}/manufacturing/production-runs/${productionRunId}`] });
      toast({ title: "Success", description: "Material transaction posted successfully." });
      form.reset();
      if (onSuccess) onSuccess();
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
        <FormField control={form.control} name="type" render={({ field }) => (
          <FormItem>
            <FormLabel>Transaction Type</FormLabel>
            <Select onValueChange={field.onChange} value={field.value}>
              <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
              <SelectContent>
                <SelectItem value="ISSUE">Material Issue (Consume)</SelectItem>
                <SelectItem value="RETURN">Material Return (Reverse)</SelectItem>
                <SelectItem value="SCRAP">Scrap</SelectItem>
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )} />
        
        <FormField control={form.control} name="productId" render={({ field }) => (
          <FormItem>
            <FormLabel>Raw Material / Component</FormLabel>
            <Select onValueChange={field.onChange} value={field.value?.toString() || ""}>
              <FormControl><SelectTrigger><SelectValue placeholder="Select component..." /></SelectTrigger></FormControl>
              <SelectContent>
                {(products as any[])?.map((p: any) => (
                  <SelectItem key={p.id} value={p.id.toString()}>{p.name} (Stock: {p.quantityOnHand})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )} />

        <FormField control={form.control} name="quantity" render={({ field }) => (
          <FormItem>
            <FormLabel>Quantity</FormLabel>
            <FormControl><Input type="number" step="any" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />

        <FormField control={form.control} name="notes" render={({ field }) => (
          <FormItem>
            <FormLabel>Notes (Optional)</FormLabel>
            <FormControl><Textarea {...field} value={field.value || ""} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />

        <Button type="submit" className="w-full" disabled={mutation.isPending}>
          {mutation.isPending ? "Posting..." : "Post Transaction"}
        </Button>
      </form>
    </Form>
  );
}
