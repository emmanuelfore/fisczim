import { Layout } from "@/components/layout";
import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useActiveCompany } from "@/hooks/use-active-company";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { QuantityInput } from "@/components/ui/quantity-input";


const bomSchema = z.object({
  name: z.string().min(1, "Name is required"),
  productId: z.coerce.number().min(1, "Finished good is required"),
  version: z.string().default("1.0"),
  lines: z.array(z.object({
    componentProductId: z.coerce.number().min(1, "Component is required"),
    quantity: z.coerce.number().min(0.0001, "Quantity must be greater than 0"),
    unitOfMeasure: z.string().min(1, "UOM is required")
  })).min(1, "At least one component is required")
});

export default function BomForm() {
  const [, setLocation] = useLocation();
  const { activeCompanyId: companyId } = useActiveCompany();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: products } = useQuery({
    queryKey: [`/api/companies/${companyId}/products`],
    enabled: !!companyId,
  });

  const form = useForm<z.infer<typeof bomSchema>>({
    resolver: zodResolver(bomSchema),
    defaultValues: {
      name: "",
      version: "1.0",
      lines: [{ quantity: 1, unitOfMeasure: "pcs" }]
    }
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "lines"
  });

  const mutation = useMutation({
    mutationFn: async (data: z.infer<typeof bomSchema>) => {
      const res = await apiRequest("POST", `/api/companies/${companyId}/manufacturing/bom`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${companyId}/manufacturing/bom`] });
      toast({ title: "Success", description: "BOM created successfully" });
      setLocation("/manufacturing/bom");
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  });

  return (
    <Layout>
      <div className="space-y-6 max-w-4xl mx-auto">
      <PageHeader title="Create Bill of Materials"  />

      <Form {...form}>
        <form onSubmit={form.handleSubmit((d) => mutation.mutate(d))} className="space-y-8">
          <Card>
            <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>BOM Name (Recipe Name)</FormLabel>
                  <FormControl><Input {...field} placeholder="e.g. Standard Wooden Chair" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              
              <FormField control={form.control} name="version" render={({ field }) => (
                <FormItem>
                  <FormLabel>Version</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="productId" render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel>Finished Good</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value?.toString()}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="Select the finished product" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {((products as any[]) || []).map((p: any) => (
                        <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium">Raw Materials / Components</h3>
                <Button type="button" variant="outline" size="sm" onClick={() => append({ componentProductId: 0, quantity: 1, unitOfMeasure: "pcs" })}>
                  <Plus className="h-4 w-4 mr-2" /> Add Component
                </Button>
              </div>

              {fields.map((field, index) => (
                <div key={field.id} className="flex gap-4 items-end border p-4 rounded-md">
                  <FormField control={form.control} name={`lines.${index}.componentProductId`} render={({ field }) => (
                    <FormItem className="flex-1">
                      <FormLabel>Component</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value?.toString()}>
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Select raw material" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {((products as any[]) || []).map((p: any) => (
                            <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name={`lines.${index}.quantity`} render={({ field }) => (
                    <FormItem className="w-32">
                      <FormLabel>Quantity</FormLabel>
                      <FormControl><QuantityInput type="number" step="any" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name={`lines.${index}.unitOfMeasure`} render={({ field }) => (
                    <FormItem className="w-32">
                      <FormLabel>UOM</FormLabel>
                      <FormControl><Input {...field} placeholder="e.g. kg, L, pcs" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} className="text-red-500 mb-2">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="flex justify-end gap-4">
            <Button type="button" variant="outline" onClick={() => setLocation("/manufacturing/bom")}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving..." : "Save Bill of Materials"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  
    </Layout>
  );
}
