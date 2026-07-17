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

const productionRunSchema = z.object({
  type: z.enum(["RECIPE", "SIMPLE"]).default("RECIPE"),
  bomId: z.coerce.number().optional(),
  plannedQuantity: z.coerce.number().min(0.0001, "Planned quantity must be greater than 0"),
  customerId: z.union([z.coerce.number(), z.literal("none")]).optional().nullable(),
  salesOrderId: z.union([z.coerce.number(), z.literal("none")]).optional().nullable(),
  plannedStart: z.string().optional().nullable(),
  status: z.string().default("PLANNED"),
});

export default function ProductionRunForm() {
  const [, setLocation] = useLocation();
  const { activeCompanyId: companyId } = useActiveCompany();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: boms } = useQuery({
    queryKey: [`/api/companies/${companyId}/manufacturing/bom`],
    enabled: !!companyId,
  });

  const { data: customers } = useQuery({
    queryKey: [`/api/companies/${companyId}/customers`],
    enabled: !!companyId,
  });

  const form = useForm<z.infer<typeof productionRunSchema>>({
    resolver: zodResolver(productionRunSchema),
    defaultValues: {
      type: "RECIPE",
      plannedQuantity: 1,
      status: "PLANNED",
    }
  });

  const watchType = form.watch("type");

  const mutation = useMutation({
    mutationFn: async (data: z.infer<typeof productionRunSchema>) => {
      const payload = { ...data };
      if (!payload.customerId || payload.customerId.toString() === "none") delete payload.customerId;
      if (!payload.salesOrderId || payload.salesOrderId.toString() === "none") delete payload.salesOrderId;
      
      const res = await apiRequest("POST", `/api/companies/${companyId}/manufacturing/production-runs`, payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${companyId}/manufacturing/production-runs`] });
      toast({ title: "Success", description: "Production run created successfully" });
      setLocation("/manufacturing/production-runs");
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  });

  return (
    <Layout>
      <div className="space-y-6 max-w-2xl mx-auto">
      <PageHeader title="Create Production Run"  />

      <Form {...form}>
        <form onSubmit={form.handleSubmit((d) => mutation.mutate(d))} className="space-y-6">
          <Card>
            <CardContent className="pt-6 space-y-4">
              <FormField control={form.control} name="type" render={({ field }) => (
                <FormItem>
                  <FormLabel>Production Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="RECIPE">Recipe (uses BOM)</SelectItem>
                      <SelectItem value="SIMPLE">Simple (manual input/output)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              {watchType === "RECIPE" && (
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
              )}
              
              <FormField control={form.control} name="plannedQuantity" render={({ field }) => (
                <FormItem>
                  <FormLabel>Planned Production Quantity</FormLabel>
                  <FormControl><Input type="number" step="any" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              
              <FormField control={form.control} name="customerId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Customer (Optional)</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value?.toString() || ""}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="Select a Customer (for direct routing to customer stock)" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">None (General Inventory)</SelectItem>
                      {(customers as any[])?.map((c: any) => (
                        <SelectItem key={c.id} value={c.id.toString()}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </CardContent>
          </Card>

          <div className="flex justify-end gap-4">
            <Button type="button" variant="outline" onClick={() => setLocation("/manufacturing/production-runs")}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving..." : "Create Production Run"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  
    </Layout>
  );
}
