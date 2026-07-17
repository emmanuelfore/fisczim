import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useProducts } from "@/hooks/use-products";
import { useActiveCompany } from "@/hooks/use-active-company";

export function CustomerProductsTab({ customerId }: { customerId: number }) {
  const [links, setLinks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [productId, setProductId] = useState("");
  const { toast } = useToast();
  const { activeCompanyId } = useActiveCompany();
  const { data: products } = useProducts(activeCompanyId);

  const fetchLinks = async () => {
    try {
      const res = await apiFetch(`/api/customer-products/${customerId}`);
      if (res.ok) {
        setLinks(await res.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLinks();
  }, [customerId]);

  const handleLinkProduct = async () => {
    if (!productId) return;
    try {
      const res = await apiFetch("/api/customer-products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: activeCompanyId,
          customerId,
          productId: parseInt(productId),
          isExclusive: true
        })
      });
      if (!res.ok) throw new Error("Failed to link product");
      toast({ title: "Product linked as exclusive!" });
      setProductId("");
      fetchLinks();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Exclusive Products</CardTitle>
        <CardDescription>
          Link products exclusively to this customer to enforce stock ownership rules.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex gap-4 items-end">
          <div className="space-y-2 flex-1">
            <Label>Select Product</Label>
            <select 
              className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
              value={productId}
              onChange={e => setProductId(e.target.value)}
            >
              <option value="">-- Choose a Product --</option>
              {products?.map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.sku || 'No SKU'})</option>
              ))}
            </select>
          </div>
          <Button onClick={handleLinkProduct}>Link Product</Button>
        </div>

        <div>
          <h4 className="font-medium mb-3">Currently Linked Products</h4>
          {loading ? <p>Loading...</p> : links.length === 0 ? <p className="text-slate-500 text-sm">No exclusive products linked.</p> : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Product Name</th>
                  <th className="text-left">SKU</th>
                  <th className="text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {links.map((link, i) => (
                  <tr key={i} className="border-b">
                    <td className="py-2">{link.product?.name}</td>
                    <td>{link.product?.sku}</td>
                    <td>
                      <span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded text-xs">Exclusive</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
