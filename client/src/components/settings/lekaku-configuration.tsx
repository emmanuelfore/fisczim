import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { RefreshCw, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { LEKAKU_DEFAULT_GATEWAY } from "@shared/lekaku";

type LekakuKind = "VAT" | "NonVAT" | "Exempt" | "PercentageLevy" | "FixedValueLevy" | "WithholdingTax";
type Tax = {
  id: number; name: string; rate: string; isActive?: boolean;
  lekakuTaxId?: string; lekakuTaxType?: LekakuKind; lekakuTaxCode?: string | null;
  lekakuEnvironment?: string | null; lekakuValidFrom?: string | null; lekakuValidTill?: string | null;
};
type Product = { id: number; name: string; sku?: string };

export function LekakuConfiguration({ companyId, formData, setFormData }: { companyId: number; formData: any; setFormData: (value: any) => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedLevyId, setSelectedLevyId] = useState<string>("");
  const [selectedProducts, setSelectedProducts] = useState<Set<number>>(new Set());
  const [fixedQuantity, setFixedQuantity] = useState("1");
  const isFixed = (taxes?: Tax[]) => taxes?.find(t => String(t.id) === selectedLevyId)?.lekakuTaxType === "FixedValueLevy";

  const { data: taxes = [] } = useQuery({ queryKey: ["tax-types", companyId], queryFn: async () => (await apiFetch(`/api/tax-types?companyId=${companyId}`)).json() as Promise<Tax[]> });
  const { data: products = [] } = useQuery({ queryKey: ["products", companyId], queryFn: async () => (await apiFetch(`/api/companies/${companyId}/products`)).json() as Promise<Product[]> });
  const { data: assignments = [] } = useQuery({ queryKey: ["lekaku-product-levies", companyId], queryFn: async () => (await apiFetch(`/api/companies/${companyId}/lekaku/product-levies`)).json() as Promise<Array<{ productId: number; taxTypeId: number; appliedForQuantity?: string }>> });
  const levies = taxes.filter(t => ["PercentageLevy", "FixedValueLevy", "WithholdingTax"].includes(t.lekakuTaxType || ""));
  // Gateway-issued reference rows only — test and production gateways use
  // different taxIDs, so each row carries its environment.
  const referenceRows = taxes.filter(t => t.lekakuTaxId);

  const syncTaxes = useMutation({
    mutationFn: async () => {
      const response = await apiFetch(`/api/companies/${companyId}/lekaku/config/sync`, { method: "POST" });
      if (!response.ok) throw new Error((await response.json()).message || "Could not sync RSL taxes");
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["tax-types", companyId] });
      const parts = [`${data.added ?? 0} added`, `${data.updated ?? 0} updated`];
      if (data.remap) parts.push(`${data.remap.remappedProducts ?? 0} products remapped`);
      if (data.remap?.unmapped?.length) parts.push(`${data.remap.unmapped.length} need attention`);
      toast({ title: "RSL taxes synced", description: `${parts.join(" • ")} (${data.environment || "test"})` });
    },
    onError: (error: Error) => toast({ title: "Sync failed", description: error.message, variant: "destructive" }),
  });

  const saveAssignments = useMutation({
    mutationFn: async () => Promise.all([...selectedProducts].map(productId => apiFetch(`/api/companies/${companyId}/products/${productId}/lekaku-levies`, {
      method: "PUT", body: JSON.stringify({ levies: [...assignments.filter(a => a.productId === productId && a.taxTypeId !== Number(selectedLevyId)), { taxTypeId: Number(selectedLevyId), appliedForQuantity: isFixed(taxes) ? Number(fixedQuantity) : undefined }] }),
    }))),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["lekaku-product-levies", companyId] }); toast({ title: "Levy assigned", description: "It will be added automatically whenever these products are sold." }); },
  });

  return <div className="space-y-6">
    <Card className="border-emerald-200">
      <CardHeader><CardTitle>LEKAKU gateway</CardTitle><CardDescription>Paste the HTTPS gateway host supplied by Revenue Services Lesotho. The system adds the documented endpoint path automatically.</CardDescription></CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2">
        <div><Label>Gateway host</Label><Input value={formData.lekakuGatewayUrl || ""} onChange={e => setFormData({ ...formData, fiscalProvider: "LEKAKU", country: "Lesotho", currency: "LSL", lekakuGatewayUrl: e.target.value })} placeholder={LEKAKU_DEFAULT_GATEWAY} /></div>
        <div><Label>Provider</Label><Input value="LEKAKU - Lesotho" disabled /></div>
        <div><Label>RSL device ID</Label><Input value={formData.fdmsDeviceId || ""} onChange={e => setFormData({ ...formData, fdmsDeviceId: e.target.value })} placeholder="Device ID issued by RSL" /></div>
        <div><Label>Device certificate and private key</Label><p className="mt-2 text-xs text-muted-foreground">Use the existing secure fiscal-device credentials section to register or rotate the RSL certificate. LEKAKU sends them as the TLS client certificate and signs each receipt with the private key.</p></div>
        <p className="text-xs text-muted-foreground md:col-span-2">Example request: <code>{(formData.lekakuGatewayUrl || LEKAKU_DEFAULT_GATEWAY)}/Device/v2/&lt;deviceID&gt;/SubmitReceipt</code>. Leave blank to use the default RSL gateway. Click the global <strong>Save changes</strong> button after editing this page.</p>
      </CardContent>
    </Card>

    <Card><CardHeader>
      <div className="flex items-center justify-between gap-3">
        <div><CardTitle>RSL tax reference</CardTitle><CardDescription>Read-only taxes issued by the gateway. VAT, NonVAT and Exempt are main taxes; levy types ride on top of a line. Manual entry is disabled — hand-typed IDs cause RCPT025 rejections.</CardDescription></div>
        <Button variant="outline" size="sm" onClick={() => syncTaxes.mutate()} disabled={syncTaxes.isPending}><RefreshCw className={`mr-2 h-4 w-4 ${syncTaxes.isPending ? "animate-spin" : ""}`} />{syncTaxes.isPending ? "Syncing…" : "Sync from RSL"}</Button>
      </div>
    </CardHeader><CardContent className="space-y-4">
      {referenceRows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No RSL taxes synced yet. Register the device, then press <strong>Sync from RSL</strong> (and again after every TEST↔PRODUCTION switch — tax IDs differ per gateway).</p>
      ) : (
        <div className="rounded-md border overflow-x-auto"><div className="grid grid-cols-7 gap-2 border-b bg-muted/40 p-2 text-xs font-medium min-w-[720px]"><span>Name</span><span>RSL ID</span><span>Kind</span><span>Rate</span><span>Valid till</span><span>Env</span><span>Status</span></div>
          {referenceRows.map(t => (
            <div className="grid grid-cols-7 gap-2 p-2 text-sm min-w-[720px]" key={t.id}>
              <span>{t.name}</span>
              <span className="font-mono">{t.lekakuTaxId}</span>
              <span>{t.lekakuTaxType}</span>
              <span>{t.lekakuTaxType === "Exempt" ? "—" : `${t.rate}%`}</span>
              <span>{t.lekakuValidTill || "—"}</span>
              <span className="font-mono text-xs">{(t.lekakuEnvironment || "test").toUpperCase()}</span>
              <span className={`text-xs font-semibold ${t.isActive === false ? "text-red-600" : "text-emerald-700"}`}>{t.isActive === false ? "Expired" : "Active"}</span>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">Expired rows stay for history — never assign products to them. Re-sync to pick up new or superseded taxes.</p>
    </CardContent></Card>

    <Card><CardHeader><CardTitle>Apply levy to products</CardTitle><CardDescription>Select a levy, tick the affected products, then save. Main tax remains on each product; this adds the selected levy on top.</CardDescription></CardHeader><CardContent className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2"><Select value={selectedLevyId} onValueChange={setSelectedLevyId}><SelectTrigger><SelectValue placeholder="Select a configured levy" /></SelectTrigger><SelectContent>{levies.map(levy => <SelectItem key={levy.id} value={String(levy.id)}>{levy.name} ({levy.rate}{levy.lekakuTaxType === "FixedValueLevy" ? " LSL/unit" : "%"})</SelectItem>)}</SelectContent></Select>{isFixed(taxes) && <Input type="number" min="0.001" step="0.001" value={fixedQuantity} onChange={e => setFixedQuantity(e.target.value)} placeholder="Levy quantity per sale line" />}</div>
      <div className="max-h-56 space-y-2 overflow-auto rounded-md border p-3">{products.map(product => <label key={product.id} className="flex items-center gap-3 text-sm"><Checkbox checked={selectedProducts.has(product.id)} onCheckedChange={checked => setSelectedProducts(previous => { const next = new Set(previous); checked ? next.add(product.id) : next.delete(product.id); return next; })} />{product.name} <span className="text-muted-foreground">{product.sku || ""}</span></label>)}</div>
      <Button onClick={() => saveAssignments.mutate()} disabled={!selectedLevyId || selectedProducts.size === 0 || saveAssignments.isPending}><Save className="mr-2 h-4 w-4" />Save product levy assignment</Button>
    </CardContent></Card>
  </div>;
}
