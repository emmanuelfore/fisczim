import { Layout } from "@/components/layout";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { useActiveCompany } from "@/hooks/use-active-company";
import { QuantityInput } from "@/components/ui/quantity-input";


export default function StockReceiptPage() {
  const { activeCompanyId } = useActiveCompany();
  const { toast } = useToast();
  
  const [formData, setFormData] = useState({
    locationId: "",
    productId: "",
    customerId: "",
    quantity: "",
    uom: ""
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const payload = {
        companyId: activeCompanyId,
        locationId: parseInt(formData.locationId),
        productId: parseInt(formData.productId),
        quantity: formData.quantity,
        uom: formData.uom,
        ...(formData.customerId ? { customerId: parseInt(formData.customerId) } : {})
      };

      const res = await apiFetch("/api/stock/receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to receive stock");
      }
      toast({ title: "Stock Received Successfully" });
      setFormData({
        locationId: "",
        productId: "",
        customerId: "",
        quantity: "",
        uom: ""
      });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Layout>
      <PageHeader
        title="Stock Receipt"
        subtitle="Log new incoming inventory"
      />

      <div className="max-w-2xl mx-auto mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Receive Goods</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Location ID</Label>
                  <Input 
                    type="number" 
                    required 
                    value={formData.locationId}
                    onChange={(e) => setFormData({...formData, locationId: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Product ID</Label>
                  <Input 
                    type="number" 
                    required 
                    value={formData.productId}
                    onChange={(e) => setFormData({...formData, productId: e.target.value})}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Quantity</Label>
                  <QuantityInput 
                    type="number" 
                    step="0.01" 
                    required 
                    value={formData.quantity}
                    onChange={(e) => setFormData({...formData, quantity: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Unit of Measure</Label>
                  <Input 
                    required 
                    placeholder="e.g. boxes, kg"
                    value={formData.uom}
                    onChange={(e) => setFormData({...formData, uom: e.target.value})}
                  />
                </div>
              </div>

              <div className="space-y-2 border-t pt-4 mt-4">
                <Label>Customer ID (Required ONLY if Product is Exclusive)</Label>
                <Input 
                  type="number" 
                  placeholder="Leave blank for general stock"
                  value={formData.customerId}
                  onChange={(e) => setFormData({...formData, customerId: e.target.value})}
                />
                <p className="text-xs text-slate-500">
                  If you attempt to receive a customer-exclusive product without providing the customer ID, the system will reject it.
                </p>
              </div>

              <Button type="submit" disabled={isSubmitting} className="w-full">
                {isSubmitting ? "Receiving..." : "Receive Stock"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
