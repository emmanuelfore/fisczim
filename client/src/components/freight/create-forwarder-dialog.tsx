import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateFreightForwarder } from "@/hooks/use-freight";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function CreateForwarderDialog({ companyId }: { companyId: number }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const createForwarder = useCreateFreightForwarder();

  const [formData, setFormData] = useState({
    name: "",
    contactPerson: "",
    email: "",
    phone: "",
    address: "",
    isActive: true,
    supportedShippingMethods: [] as string[],
    defaultCurrency: "USD",
    notes: "",
  });

  const toggleShippingMethod = (method: string) => {
    setFormData(prev => ({
      ...prev,
      supportedShippingMethods: prev.supportedShippingMethods.includes(method)
        ? prev.supportedShippingMethods.filter(m => m !== method)
        : [...prev.supportedShippingMethods, method]
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createForwarder.mutateAsync({
        companyId,
        data: {
          ...formData,
          companyId,
        },
      });
      toast({ title: "Success", description: "Freight forwarder created successfully" });
      setOpen(false);
      setFormData({ 
        name: "", contactPerson: "", email: "", phone: "", address: "", 
        isActive: true, supportedShippingMethods: [], defaultCurrency: "USD", notes: "" 
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create forwarder",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={!companyId} className="gap-2">
          <Plus className="w-4 h-4" /> Add Forwarder
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add Freight Forwarder</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6 pt-4">
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Basic Information</h4>
            <Card>
              <CardContent className="pt-4 space-y-4">
                <div className="space-y-2">
                  <Label>Company Name *</Label>
                  <Input 
                    required 
                    value={formData.name} 
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })} 
                    placeholder="e.g. DHL, Maersk" 
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Contact Person</Label>
                    <Input 
                      value={formData.contactPerson} 
                      onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })} 
                      placeholder="e.g. John Doe" 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Phone</Label>
                    <Input 
                      value={formData.phone} 
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })} 
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input 
                      type="email" 
                      value={formData.email} 
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })} 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Address</Label>
                    <Input 
                      value={formData.address} 
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })} 
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Operations</h4>
            <Card>
              <CardContent className="pt-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select 
                      value={formData.isActive ? "ACTIVE" : "INACTIVE"} 
                      onValueChange={(v) => setFormData({ ...formData, isActive: v === "ACTIVE" })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ACTIVE">Active</SelectItem>
                        <SelectItem value="INACTIVE">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Default Currency</Label>
                    <Select 
                      value={formData.defaultCurrency} 
                      onValueChange={(v) => setFormData({ ...formData, defaultCurrency: v })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="USD">USD</SelectItem>
                        <SelectItem value="EUR">EUR</SelectItem>
                        <SelectItem value="CNY">CNY</SelectItem>
                        <SelectItem value="GBP">GBP</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label>Supported Shipping Methods</Label>
                  <div className="flex gap-2">
                    {["SEA", "AIR", "ROAD", "RAIL", "COURIER"].map(method => (
                      <Button
                        key={method}
                        type="button"
                        variant={formData.supportedShippingMethods.includes(method) ? "default" : "outline"}
                        size="sm"
                        onClick={() => toggleShippingMethod(method)}
                      >
                        {method}
                      </Button>
                    ))}
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea 
                    value={formData.notes} 
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })} 
                    placeholder="Payment terms, special instructions, etc."
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={createForwarder.isPending}>
              {createForwarder.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Forwarder
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
