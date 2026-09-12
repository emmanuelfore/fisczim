import { Layout } from "@/components/layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useActiveCompany } from "@/hooks/use-active-company";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Plus } from "lucide-react";
import { useState } from "react";

const routingSchema = z.object({
  productId: z.number().int().positive("Select a product"),
  name: z.string().min(1, "Name is required"),
  version: z.string().optional(),
});

export default function Routings() {
  const { activeCompanyId: companyId } = useActiveCompany();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: routings, isLoading } = useQuery<any[]>({
    queryKey: [`/api/companies/${companyId}/manufacturing/routings`],
    enabled: !!companyId,
  });

  const { data: products } = useQuery<any[]>({
    queryKey: [`/api/companies/${companyId}/products`],
    enabled: !!companyId,
  });

  const form = useForm({
    resolver: zodResolver(routingSchema),
    defaultValues: { name: "", version: "1.0", productId: 0 },
  });

  const createMutation = useMutation({
    mutationFn: async (data: z.infer<typeof routingSchema>) => {
      const res = await apiRequest("POST", `/api/companies/${companyId}/manufacturing/routings`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${companyId}/manufacturing/routings`] });
      toast({ title: "Success", description: "Routing created" });
      setOpen(false);
      form.reset();
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  });

  return (
    <Layout>
      <div className="space-y-6 max-w-5xl mx-auto">
        <div className="flex justify-between items-center">
          <PageHeader title="Routings" subtitle="Manage production sequences and operations" />
          
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" /> New Routing</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Routing</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit((d) => createMutation.mutate(d))} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="productId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Product</FormLabel>
                        <Select onValueChange={(val) => field.onChange(parseInt(val))} value={field.value ? field.value.toString() : ""}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select product" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {products?.map((p: any) => (
                              <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Name</FormLabel>
                        <FormControl><Input {...field} placeholder="e.g. Standard Assembly" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="version"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Version</FormLabel>
                        <FormControl><Input {...field} placeholder="e.g. 1.0" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="flex justify-end gap-2 pt-4">
                    <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                    <Button type="submit" disabled={createMutation.isPending}>
                      {createMutation.isPending ? "Saving..." : "Save"}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="border rounded-md bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Routing Name</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {routings?.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>{r.product?.name || `Product #${r.productId}`}</TableCell>
                  <TableCell>{r.version}</TableCell>
                  <TableCell>
                    <Badge variant={r.isActive ? "default" : "secondary"}>
                      {r.isActive ? "ACTIVE" : "INACTIVE"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {routings?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    No routings found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </Layout>
  );
}
