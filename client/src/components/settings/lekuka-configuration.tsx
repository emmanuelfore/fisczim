import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { Plus, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type LekukaKind = "VAT" | "NonVAT" | "Exempt" | "PercentageLevy" | "FixedValueLevy" | "WithholdingTax";
type Tax = { id: number; name: string; rate: string; lekukaTaxId?: string; lekukaTaxType?: LekukaKind };
type Product = { id: number; name: string; sku?: string };

export function LekukaConfiguration({ companyId, formData, setFormData }: { companyId: number; formData: any; setFormData: (value: any) => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tax, setTax] = useState({ name: "", lekukaTaxId: "", rate: "0", lekukaTaxType: "VAT" as LekukaKind });
  const [selectedLevyId, setSelectedLevyId] = useState<string>("");
  const [selectedProducts, setSelectedProducts] = useState<Set<number>>(new Set());
  const [fixedQuantity, setFixedQuantity] = useState("1");
  const isFixed = (taxes?: Tax[]) => taxes?.find(t => String(t.id) === selectedLevyId)?.lekukaTaxType === "FixedValueLevy";

  const { data: taxes = [] } = useQuery({ queryKey: ["tax-types", companyId], queryFn: async () => (await apiFetch(`/api/tax-types?companyId=${companyId}`)).json() as Promise<Tax[]> });
  const { data: products = [] } = useQuery({ queryKey: ["products", companyId], queryFn: async () => (await apiFetch(`/api/companies/${companyId}/products`)).json() as Promise<Product[]> });
  const { data: assignments = [] } = useQuery({ queryKey: ["lekuka-product-levies", companyId], queryFn: async () => (await apiFetch(`/api/companies/${companyId}/lekuka/product-levies`)).json() as Promise<Array<{ productId: number; taxTypeId: number; appliedForQuantity?: string }>> });
  const levies = taxes.filter(t => ["PercentageLevy", "FixedValueLevy", "WithholdingTax"].includes(t.lekukaTaxType || ""));

  const createTax = useMutation({
    mutationFn: async () => {
      const response = await apiFetch("/api/tax-types", { method: "POST", body: JSON.stringify({
        companyId, name: tax.name, code: `LS-${tax.lekukaTaxType}-${tax.lekukaTaxId}`, rate: Number(tax.rate),
        lekukaTaxId: tax.lekukaTaxId, lekukaTaxType: tax.lekukaTaxType,
        effectiveFrom: new Date().toISOString().slice(0, 10), isActive: true,
      }) });
      if (!response.ok) throw new Error((await response.json()).message || "Could not save tax");
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["tax-types", companyId] }); setTax({ name: "", lekukaTaxId: "", rate: "0", lekukaTaxType: "VAT" }); },
    onError: (error: Error) => toast({ title: "Tax not saved", description: error.message, variant: "destructive" }),
  });

  const saveAssignments = useMutation({
    mutationFn: async () => Promise.all([...selectedProducts].map(productId => apiFetch(`/api/companies/${companyId}/products/${productId}/lekuka-levies`, {
      method: "PUT", body: JSON.stringify({ levies: [...assignments.filter(a => a.productId === productId && a.taxTypeId !== Number(selectedLevyId)), { taxTypeId: Number(selectedLevyId), appliedForQuantity: isFixed(taxes) ? Number(fixedQuantity) : undefined }] }),
    }))),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["lekuka-product-levies", companyId] }); toast({ title: "Levy assigned", description: "It will be added automatically whenever these products are sold." }); },
  });

  return <div className="space-y-6">
    <Card className="border-emerald-200">
      <CardHeader><CardTitle>LEKUKA gateway</CardTitle><CardDescription>Paste the HTTPS gateway host supplied by Revenue Services Lesotho. The system adds the documented endpoint path automatically.</CardDescription></CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2">
        <div><Label>Gateway host</Label><Input value={formData.lekukaGatewayUrl || ""} onChange={e => setFormData({ ...formData, fiscalProvider: "LEKUKA", country: "Lesotho", currency: "LSL", lekukaGatewayUrl: e.target.value })} placeholder="https://gateway.example.rsl.ls" /></div>
        <div><Label>Provider</Label><Input value="LEKUKA - Lesotho" disabled /></div>
        <div><Label>RSL device ID</Label><Input value={formData.fdmsDeviceId || ""} onChange={e => setFormData({ ...formData, fdmsDeviceId: e.target.value })} placeholder="Device ID issued by RSL" /></div>
        <div><Label>Device certificate and private key</Label><p className="mt-2 text-xs text-muted-foreground">Use the existing secure fiscal-device credentials section to register or rotate the RSL certificate. LEKUKA sends them as the TLS client certificate and signs each receipt with the private key.</p></div>
        <p className="text-xs text-muted-foreground md:col-span-2">Example request: <code>{(formData.lekukaGatewayUrl || "https://your-rsl-host")}/Device/v2/&lt;deviceID&gt;/SubmitReceipt</code>. Click the global <strong>Save changes</strong> button after editing this page.</p>
      </CardContent>
    </Card>

    <Card><CardHeader><CardTitle>Taxes and levies</CardTitle><CardDescription>Create your RSL-issued tax IDs here. VAT, NonVAT and Exempt are main taxes; levy types are additional taxes.</CardDescription></CardHeader><CardContent className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4"><Input value={tax.name} onChange={e => setTax({ ...tax, name: e.target.value })} placeholder="Name" /><Input value={tax.lekukaTaxId} onChange={e => setTax({ ...tax, lekukaTaxId: e.target.value })} placeholder="RSL tax ID" /><Input type="number" step="0.01" value={tax.rate} onChange={e => setTax({ ...tax, rate: e.target.value })} placeholder="Rate" /><Select value={tax.lekukaTaxType} onValueChange={(value: LekukaKind) => setTax({ ...tax, lekukaTaxType: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(["VAT", "NonVAT", "Exempt", "PercentageLevy", "FixedValueLevy", "WithholdingTax"] as LekukaKind[]).map(kind => <SelectItem key={kind} value={kind}>{kind}</SelectItem>)}</SelectContent></Select></div>
      <Button onClick={() => createTax.mutate()} disabled={!tax.name || !tax.lekukaTaxId || createTax.isPending}><Plus className="mr-2 h-4 w-4" />Add tax or levy</Button>
      <div className="rounded-md border"><div className="grid grid-cols-4 gap-2 border-b bg-muted/40 p-2 text-xs font-medium"><span>Name</span><span>RSL ID</span><span>Rate</span><span>Kind</span></div>{taxes.map(t => <div className="grid grid-cols-4 gap-2 p-2 text-sm" key={t.id}><span>{t.name}</span><span>{t.lekukaTaxId || "-"}</span><span>{t.rate}%</span><span>{t.lekukaTaxType || "Not mapped"}</span></div>)}</div>
    </CardContent></Card>

    <Card><CardHeader><CardTitle>Apply levy to products</CardTitle><CardDescription>Select a levy, tick the affected products, then save. Main tax remains on each product; this adds the selected levy on top.</CardDescription></CardHeader><CardContent className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2"><Select value={selectedLevyId} onValueChange={setSelectedLevyId}><SelectTrigger><SelectValue placeholder="Select a configured levy" /></SelectTrigger><SelectContent>{levies.map(levy => <SelectItem key={levy.id} value={String(levy.id)}>{levy.name} ({levy.rate}{levy.lekukaTaxType === "FixedValueLevy" ? " LSL/unit" : "%"})</SelectItem>)}</SelectContent></Select>{isFixed(taxes) && <Input type="number" min="0.001" step="0.001" value={fixedQuantity} onChange={e => setFixedQuantity(e.target.value)} placeholder="Levy quantity per sale line" />}</div>
      <div className="max-h-56 space-y-2 overflow-auto rounded-md border p-3">{products.map(product => <label key={product.id} className="flex items-center gap-3 text-sm"><Checkbox checked={selectedProducts.has(product.id)} onCheckedChange={checked => setSelectedProducts(previous => { const next = new Set(previous); checked ? next.add(product.id) : next.delete(product.id); return next; })} />{product.name} <span className="text-muted-foreground">{product.sku || ""}</span></label>)}</div>
      <Button onClick={() => saveAssignments.mutate()} disabled={!selectedLevyId || selectedProducts.size === 0 || saveAssignments.isPending}><Save className="mr-2 h-4 w-4" />Save product levy assignment</Button>
    </CardContent></Card>
  </div>;
}
