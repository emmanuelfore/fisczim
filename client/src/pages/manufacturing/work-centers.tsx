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
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Plus } from "lucide-react";
import { useState } from "react";

const workCenterSchema = z.object({
  name: z.string().min(1, "Name is required"),
  code: z.string().optional(),
});

export default function WorkCenters() {
  const { activeCompanyId: companyId } = useActiveCompany();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: workCenters, isLoading } = useQuery<any[]>({
    queryKey: [`/api/companies/${companyId}/manufacturing/work-centers`],
    enabled: !!companyId,
  });

  const form = useForm({
    resolver: zodResolver(workCenterSchema),
    defaultValues: { name: "", code: "" },
  });

  const createMutation = useMutation({
    mutationFn: async (data: z.infer<typeof workCenterSchema>) => {
      const res = await apiRequest("POST", `/api/companies/${companyId}/manufacturing/work-centers`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${companyId}/manufacturing/work-centers`] });
      toast({ title: "Success", description: "Work center created" });
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
          <PageHeader title="Work Centers" subtitle="Manage manufacturing workstations and zones" />
          
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" /> New Work Center</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Work Center</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit((d) => createMutation.mutate(d))} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Name</FormLabel>
                        <FormControl><Input {...field} placeholder="e.g. Assembly Line 1" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="code"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Code (Optional)</FormLabel>
                        <FormControl><Input {...field} placeholder="e.g. AS-01" /></FormControl>
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
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workCenters?.map((wc: any) => (
                <TableRow key={wc.id}>
                  <TableCell>{wc.code || "-"}</TableCell>
                  <TableCell className="font-medium">{wc.name}</TableCell>
                  <TableCell>
                    <Badge variant={wc.status === "ACTIVE" ? "default" : "secondary"}>
                      {wc.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {workCenters?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                    No work centers found.
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
