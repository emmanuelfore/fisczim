import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCreateCompoundProduct, useUpdateCompoundProduct, useCompoundProduct } from "@/hooks/use-compound-products";
import { useProducts } from "@/hooks/use-products";
import { useToast } from "@/hooks/use-toast";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useLocation, useParams } from "wouter";
import { useState, useEffect } from "react";
import { ArrowLeft, Plus, Trash2, Package } from "lucide-react";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

type ComponentLine = {
  localId: string;
  productId: number | null;
  quantity: number;
};

export default function CreateCompoundProductPage() {
  const [, setLocation] = useLocation();
  const params = useParams<{ id?: string }>();
  const editId = params?.id;
  const isEditing = !!editId;
  const { activeCompanyId } = useActiveCompany();
  const { data: products } = useProducts(activeCompanyId);
  const { data: existing } = useCompoundProduct(editId);
  const createBundle = useCreateCompoundProduct();
  const updateBundle = useUpdateCompoundProduct();
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [description, setDescription] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [components, setComponents] = useState<ComponentLine[]>([{
    localId: Math.random().toString(36).substr(2, 9),
    productId: null,
    quantity: 1,
  }]);

  useEffect(() => {
    if (existing && isEditing) {
      setName(existing.name || "");
      setSku(existing.sku || "");
      setDescription(existing.description || "");
      setSellingPrice(existing.sellingPrice || "");
      setIsActive(existing.isActive !== false);
      if (existing.items?.length > 0) {
        setComponents(existing.items.map((item: any) => ({
          localId: Math.random().toString(36).substr(2, 9),
          productId: item.productId,
          quantity: Number(item.quantity),
        })));
      }
    }
  }, [existing, isEditing]);

  const addComponent = () => {
    setComponents(prev => [...prev, {
      localId: Math.random().toString(36).substr(2, 9),
      productId: null,
      quantity: 1,
    }]);
  };

  const updateComponent = (localId: string, field: keyof ComponentLine, value: any) => {
    setComponents(prev => prev.map(c => c.localId === localId ? { ...c, [field]: value } : c));
  };

  const removeComponent = (localId: string) => {
    if (components.length > 1) {
      setComponents(prev => prev.filter(c => c.localId !== localId));
    }
  };

  const handleSave = async () => {
    if (!name.trim()) return toast({ title: "Error", description: "Bundle name is required", variant: "destructive" });
    if (!sku.trim()) return toast({ title: "Error", description: "SKU is required", variant: "destructive" });
    if (!sellingPrice || parseFloat(sellingPrice) <= 0) return toast({ title: "Error", description: "Selling price is required", variant: "destructive" });
    if (components.some(c => !c.productId)) return toast({ title: "Error", description: "All components must have a product selected", variant: "destructive" });

    const payload = {
      companyId: activeCompanyId,
      name: name.trim(),
      sku: sku.trim(),
      description: description.trim() || undefined,
      sellingPrice: parseFloat(sellingPrice),
      isActive,
      items: components.map(c => ({ productId: c.productId, quantity: c.quantity })),
    };

    try {
      if (isEditing) {
        await updateBundle.mutateAsync({ id: editId!, data: payload });
        toast({ title: "Bundle Updated", description: "Compound product updated successfully." });
      } else {
        await createBundle.mutateAsync(payload);
        toast({ title: "Bundle Created", description: "Compound product created successfully." });
      }
      setLocation("/compound-products");
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Layout>
      <div className="mb-6 flex items-center justify-between sticky top-0 md:top-[60px] z-30 bg-background/95 backdrop-blur-sm pb-3 pt-3 -mx-4 px-4 border-b md:border-0 md:static md:mx-0 md:px-0 md:pt-0 md:bg-transparent">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => setLocation("/compound-products")} className="pl-0">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back
          </Button>
          <h1 className="text-lg font-semibold text-slate-800">
            {isEditing ? "Edit Bundle" : "New Compound Product"}
          </h1>
        </div>
        <Button onClick={handleSave} disabled={createBundle.isPending || updateBundle.isPending}>
          {isEditing ? "Save Changes" : "Create Bundle"}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader><CardTitle>Bundle Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Bundle Name *</Label>
                  <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Home Office Package" />
                </div>
                <div className="space-y-2">
                  <Label>SKU *</Label>
                  <Input value={sku} onChange={e => setSku(e.target.value)} placeholder="e.g. BUNDLE-001" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Brief description of this bundle..." rows={2} />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="isActive" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
                <Label htmlFor="isActive" className="cursor-pointer">Active (available for sale)</Label>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Components</CardTitle>
                <Button variant="outline" size="sm" onClick={addComponent}>
                  <Plus className="w-4 h-4 mr-2" /> Add Component
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {components.map((comp, idx) => (
                  <div key={comp.localId} className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 bg-slate-50">
                    <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700 flex-shrink-0">
                      {idx + 1}
                    </div>
                    <div className="flex-1">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className={cn("w-full justify-between h-9", !comp.productId && "text-muted-foreground")}>
                            <span className="truncate">
                              {comp.productId ? products?.find(p => p.id === comp.productId)?.name || "Select Product" : "Select Product"}
                            </span>
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[300px] p-0" align="start">
                          <Command>
                            <CommandInput placeholder="Search products..." />
                            <CommandList>
                              <CommandEmpty>No product found.</CommandEmpty>
                              <CommandGroup>
                                {products?.map(product => (
                                  <CommandItem
                                    key={product.id}
                                    value={product.name}
                                    onSelect={() => updateComponent(comp.localId, 'productId', product.id)}
                                  >
                                    <Check className={cn("mr-2 h-4 w-4", comp.productId === product.id ? "opacity-100" : "opacity-0")} />
                                    <div>
                                      <p>{product.name}</p>
                                      <p className="text-xs text-muted-foreground">${Number(product.price).toFixed(2)}</p>
                                    </div>
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="w-24">
                      <Input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={comp.quantity}
                        onChange={e => updateComponent(comp.localId, 'quantity', parseFloat(e.target.value) || 1)}
                        className="text-center"
                      />
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => removeComponent(comp.localId)} disabled={components.length === 1}>
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Pricing</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Bundle Selling Price *</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                  <Input
                    type="number"
                    step="0.01"
                    value={sellingPrice}
                    onChange={e => setSellingPrice(e.target.value)}
                    placeholder="0.00"
                    className="pl-7"
                  />
                </div>
                <p className="text-xs text-slate-500">This price is independent of individual component prices.</p>
              </div>
              {components.some(c => c.productId) && (
                <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                  <p className="text-xs font-medium text-slate-600 mb-2">Components sum</p>
                  {components.filter(c => c.productId).map(c => {
                    const product = products?.find(p => p.id === c.productId);
                    const total = Number(product?.price || 0) * c.quantity;
                    return (
                      <div key={c.localId} className="flex justify-between text-xs text-slate-600 py-0.5">
                        <span>{product?.name} ×{c.quantity}</span>
                        <span>${total.toFixed(2)}</span>
                      </div>
                    );
                  })}
                  <div className="border-t border-slate-200 mt-2 pt-2 flex justify-between text-xs font-bold text-slate-800">
                    <span>Total components cost</span>
                    <span>${components.filter(c => c.productId).reduce((sum, c) => {
                      const product = products?.find(p => p.id === c.productId);
                      return sum + Number(product?.price || 0) * c.quantity;
                    }, 0).toFixed(2)}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Preview</CardTitle></CardHeader>
            <CardContent>
              <div className="rounded-lg border-2 border-dashed border-slate-200 p-4 text-center">
                <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center mx-auto mb-3">
                  <Package className="w-6 h-6 text-indigo-600" />
                </div>
                <p className="font-bold text-slate-800">{name || 'Bundle Name'}</p>
                <p className="text-xs text-slate-500 font-mono mt-0.5">{sku || 'SKU'}</p>
                <p className="text-xl font-bold text-slate-900 mt-2">${sellingPrice ? parseFloat(sellingPrice).toFixed(2) : '0.00'}</p>
                <p className="text-xs text-slate-500 mt-1">{components.filter(c => c.productId).length} component(s)</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
