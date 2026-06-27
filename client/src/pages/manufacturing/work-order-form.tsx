import { Layout } from "@/components/layout";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useActiveCompany } from "@/hooks/use-active-company";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";

const workOrderSchema = z.object({
  bomId: z.coerce.number().min(1, "BOM is required"),
  plannedQuantity: z.coerce.number().min(0.0001, "Planned quantity must be greater than 0"),
  status: z.string().default("PLANNED"),
});

export default function WorkOrderForm() {
  const [, setLocation] = useLocation();
  const { activeCompanyId: companyId } = useActiveCompany();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: boms } = useQuery({
    queryKey: [`/api/companies/${companyId}/manufacturing/bom`],
    enabled: !!companyId,
  });

  const form = useForm<z.infer<typeof workOrderSchema>>({
    resolver: zodResolver(workOrderSchema),
    defaultValues: {
      plannedQuantity: 1,
      status: "PLANNED",
    }
  });

  const mutation = useMutation({
    mutationFn: async (data: z.infer<typeof workOrderSchema>) => {
      const res = await apiRequest("POST", `/api/companies/${companyId}/manufacturing/work-orders`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${companyId}/manufacturing/work-orders`] });
      toast({ title: "Success", description: "Work order created successfully" });
      setLocation("/manufacturing/work-orders");
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  });

  return (
    <Layout>
      <div className="space-y-6 max-w-2xl mx-auto">
      <PageHeader title="Create Work Order"  />

      <Form {...form}>
        <form onSubmit={form.handleSubmit((d) => mutation.mutate(d))} className="space-y-6">
          <Card>
            <CardContent className="pt-6 space-y-4">
              <FormField control={form.control} name="bomId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Bill of Materials (Recipe)</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value?.toString()}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="Select a BOM" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {(boms as any[])?.map((b: any) => (
                        <SelectItem key={b.id} value={b.id.toString()}>
                          {b.name} (v{b.version})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              
              <FormField control={form.control} name="plannedQuantity" render={({ field }) => (
                <FormItem>
                  <FormLabel>Planned Production Quantity</FormLabel>
                  <FormControl><Input type="number" step="any" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </CardContent>
          </Card>

          <div className="flex justify-end gap-4">
            <Button type="button" variant="outline" onClick={() => setLocation("/manufacturing/work-orders")}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving..." : "Create Work Order"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  
    </Layout>
  );
}
