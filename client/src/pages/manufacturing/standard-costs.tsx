import { Layout } from "@/components/layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useActiveCompany } from "@/hooks/use-active-company";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/page-header";
import { Plus, Check, X, Pencil } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export default function StandardCostsPage() {
  const { activeCompanyId: companyId } = useActiveCompany();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  
  const [newCost, setNewCost] = useState({
    productId: "",
    materialCost: 0,
    laborCost: 0,
    overheadCost: 0
  });

  const [editValues, setEditValues] = useState<any>({});

  const { data: standardCosts, isLoading } = useQuery({
    queryKey: [`/api/companies/${companyId}/manufacturing/standard-costs`],
    enabled: !!companyId,
  });

  const { data: products } = useQuery({
    queryKey: [`/api/companies/${companyId}/products`],
    enabled: !!companyId,
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const payload = {
        productId: Number(data.productId),
        materialCost: Number(data.materialCost),
        laborCost: Number(data.laborCost),
        overheadCost: Number(data.overheadCost),
      };
      const res = await apiRequest("POST", `/api/companies/${companyId}/manufacturing/standard-costs`, payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${companyId}/manufacturing/standard-costs`] });
      toast({ title: "Success", description: "Standard cost added." });
      setIsAddOpen(false);
      setNewCost({ productId: "", materialCost: 0, laborCost: 0, overheadCost: 0 });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  });

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      const payload = {
        materialCost: Number(data.materialCost),
        laborCost: Number(data.laborCost),
        overheadCost: Number(data.overheadCost),
      };
      const res = await apiRequest("PUT", `/api/companies/${companyId}/manufacturing/standard-costs/${data.id}`, payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${companyId}/manufacturing/standard-costs`] });
      toast({ title: "Updated", description: "Standard cost updated." });
      setEditingId(null);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  });

  const handleAdd = () => {
    if (!newCost.productId) {
      toast({ title: "Validation Error", description: "Please select a product.", variant: "destructive" });
      return;
    }
    createMutation.mutate(newCost);
  };

  const handleEdit = (cost: any) => {
    setEditingId(cost.id);
    setEditValues({ ...cost });
  };

  const handleSave = () => {
    updateMutation.mutate(editValues);
  };

  return (
    <Layout>
      <div className="space-y-6 max-w-5xl mx-auto">
        <div className="flex justify-between items-center">
          <PageHeader 
            title="Standard Costs" 
            subtitle="Manage baseline costs for manufacturing variance calculations"
          />
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" /> Add Standard Cost</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Standard Cost</DialogTitle></DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Product</label>
                  <Select onValueChange={(val) => setNewCost({...newCost, productId: val})} value={newCost.productId}>
                    <SelectTrigger><SelectValue placeholder="Select Product" /></SelectTrigger>
                    <SelectContent>
                      {(products as any[])?.map((p: any) => (
                        <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Material Cost ($)</label>
                    <Input type="number" step="any" value={newCost.materialCost} onChange={e => setNewCost({...newCost, materialCost: Number(e.target.value)})} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Labor Cost ($)</label>
                    <Input type="number" step="any" value={newCost.laborCost} onChange={e => setNewCost({...newCost, laborCost: Number(e.target.value)})} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Overhead Cost ($)</label>
                    <Input type="number" step="any" value={newCost.overheadCost} onChange={e => setNewCost({...newCost, overheadCost: Number(e.target.value)})} />
                  </div>
                </div>
                <Button className="w-full mt-4" onClick={handleAdd} disabled={createMutation.isPending}>Save</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Material Cost</TableHead>
                <TableHead className="text-right">Labor Cost</TableHead>
                <TableHead className="text-right">Overhead Cost</TableHead>
                <TableHead className="text-right">Total Cost</TableHead>
                <TableHead className="text-right">Effective From</TableHead>
                <TableHead className="w-24"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>}
              {!isLoading && (standardCosts as any[])?.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No standard costs defined yet.</TableCell></TableRow>
              )}
              {(standardCosts as any[])?.map((cost: any) => (
                <TableRow key={cost.id}>
                  <TableCell className="font-medium">{cost.product?.name}</TableCell>
                  
                  {editingId === cost.id ? (
                    <>
                      <TableCell><Input type="number" step="any" className="w-24 text-right ml-auto" value={editValues.materialCost} onChange={e => setEditValues({...editValues, materialCost: e.target.value})} /></TableCell>
                      <TableCell><Input type="number" step="any" className="w-24 text-right ml-auto" value={editValues.laborCost} onChange={e => setEditValues({...editValues, laborCost: e.target.value})} /></TableCell>
                      <TableCell><Input type="number" step="any" className="w-24 text-right ml-auto" value={editValues.overheadCost} onChange={e => setEditValues({...editValues, overheadCost: e.target.value})} /></TableCell>
                      <TableCell className="text-right font-bold">${(Number(editValues.materialCost) + Number(editValues.laborCost) + Number(editValues.overheadCost)).toFixed(2)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{new Date(cost.effectiveFrom).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right space-x-2 flex justify-end">
                        <Button size="icon" variant="ghost" onClick={handleSave} disabled={updateMutation.isPending}><Check className="h-4 w-4 text-emerald-500" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => setEditingId(null)}><X className="h-4 w-4 text-muted-foreground" /></Button>
                      </TableCell>
                    </>
                  ) : (
                    <>
                      <TableCell className="text-right">${Number(cost.materialCost).toFixed(2)}</TableCell>
                      <TableCell className="text-right">${Number(cost.laborCost).toFixed(2)}</TableCell>
                      <TableCell className="text-right">${Number(cost.overheadCost).toFixed(2)}</TableCell>
                      <TableCell className="text-right font-bold">${Number(cost.totalCost).toFixed(2)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{new Date(cost.effectiveFrom).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right">
                        <Button size="icon" variant="ghost" onClick={() => handleEdit(cost)}><Pencil className="h-4 w-4" /></Button>
                      </TableCell>
                    </>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </Layout>
  );
}
