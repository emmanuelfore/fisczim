import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateConsignment } from "@/hooks/use-freight";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, CalendarIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { format } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function CreateConsignmentDialog({ 
  companyId, 
  forwarders, 
  suppliers, 
  purchaseOrders, 
  locations 
}: { 
  companyId: number, 
  forwarders: any[],
  suppliers: any[],
  purchaseOrders: any[],
  locations: any[]
}) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const createConsignment = useCreateConsignment();

  const [formData, setFormData] = useState({
    forwarderId: "",
    supplierId: "",
    purchaseOrderIds: [] as number[],
    referenceNumber: "",
    shippingMethod: "SEA",
    status: "PENDING",
    dispatchDate: undefined as Date | undefined,
    expectedArrivalDate: undefined as Date | undefined,
    destinationLocationId: "",
    shippingCost: "",
    currency: "USD",
    trackingUrl: "",
    containerNumber: "",
    flightNumber: "",
    insuranceCost: "",
    customsDuty: "",
    handlingCharges: "",
    notes: ""
  });

  const togglePurchaseOrder = (id: number) => {
    setFormData(prev => ({
      ...prev,
      purchaseOrderIds: prev.purchaseOrderIds.includes(id)
        ? prev.purchaseOrderIds.filter(pid => pid !== id)
        : [...prev.purchaseOrderIds, id]
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.forwarderId || !formData.referenceNumber) {
      toast({ title: "Error", description: "Forwarder and Reference Number are required", variant: "destructive" });
      return;
    }
    try {
      await createConsignment.mutateAsync({
        companyId,
        data: {
          ...formData,
          forwarderId: parseInt(formData.forwarderId),
          supplierId: formData.supplierId ? parseInt(formData.supplierId) : undefined,
          destinationLocationId: formData.destinationLocationId ? parseInt(formData.destinationLocationId) : undefined,
          dispatchDate: formData.dispatchDate?.toISOString(),
          expectedArrivalDate: formData.expectedArrivalDate?.toISOString(),
        },
      });
      toast({ title: "Success", description: "Consignment created successfully" });
      setOpen(false);
      // Reset form omitted for brevity
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create consignment",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={!companyId} className="gap-2">
          <Plus className="w-4 h-4" /> Create Consignment
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Consignment</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6 pt-4">
          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="basic">Basic Info</TabsTrigger>
              <TabsTrigger value="orders">Purchase Orders</TabsTrigger>
              <TabsTrigger value="tracking">Tracking & Dates</TabsTrigger>
              <TabsTrigger value="costs">Costs & Accounting</TabsTrigger>
            </TabsList>
            
            <TabsContent value="basic" className="space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Reference / Waybill Number *</Label>
                  <Input 
                    required 
                    value={formData.referenceNumber} 
                    onChange={(e) => setFormData({ ...formData, referenceNumber: e.target.value })} 
                    placeholder="e.g. AWB12345678" 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Freight Forwarder *</Label>
                  <Select value={formData.forwarderId} onValueChange={(v) => setFormData({ ...formData, forwarderId: v })}>
                    <SelectTrigger><SelectValue placeholder="Select forwarder" /></SelectTrigger>
                    <SelectContent>
                      {forwarders?.map(f => (
                        <SelectItem key={f.id} value={f.id.toString()}>{f.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Supplier (Origin)</Label>
                  <Select value={formData.supplierId} onValueChange={(v) => setFormData({ ...formData, supplierId: v })}>
                    <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                    <SelectContent>
                      {suppliers?.map(s => (
                        <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Destination Warehouse</Label>
                  <Select value={formData.destinationLocationId} onValueChange={(v) => setFormData({ ...formData, destinationLocationId: v })}>
                    <SelectTrigger><SelectValue placeholder="Select warehouse" /></SelectTrigger>
                    <SelectContent>
                      {locations?.map(l => (
                        <SelectItem key={l.id} value={l.id.toString()}>{l.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Shipping Method</Label>
                  <Select value={formData.shippingMethod} onValueChange={(v) => setFormData({ ...formData, shippingMethod: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SEA">Sea Freight</SelectItem>
                      <SelectItem value="AIR">Air Freight</SelectItem>
                      <SelectItem value="ROAD">Road Transport</SelectItem>
                      <SelectItem value="RAIL">Rail Transport</SelectItem>
                      <SelectItem value="COURIER">Courier</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Initial Status</Label>
                  <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PENDING">Pending</SelectItem>
                      <SelectItem value="BOOKED">Booked</SelectItem>
                      <SelectItem value="IN_TRANSIT">In Transit</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="orders" className="space-y-4 pt-4">
              <Label>Link Purchase Orders</Label>
              <div className="border rounded-md max-h-64 overflow-y-auto p-4 space-y-2">
                {purchaseOrders?.filter(po => po.status !== 'CANCELLED' && po.status !== 'RECEIVED').length === 0 && (
                  <div className="text-center text-sm text-slate-500 py-4">No active purchase orders available.</div>
                )}
                {purchaseOrders?.filter(po => po.status !== 'CANCELLED' && po.status !== 'RECEIVED').map(po => (
                  <div key={po.id} className="flex items-center space-x-2">
                    <input 
                      type="checkbox" 
                      id={`po-${po.id}`}
                      checked={formData.purchaseOrderIds.includes(po.id)}
                      onChange={() => togglePurchaseOrder(po.id)}
                      className="rounded border-slate-300"
                    />
                    <label htmlFor={`po-${po.id}`} className="text-sm cursor-pointer">
                      <strong>{po.orderNumber}</strong> - {po.supplier?.name} - {po.currency} {po.totalAmount}
                    </label>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="tracking" className="space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label>Dispatch Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant={"outline"} className={cn("pl-3 text-left font-normal", !formData.dispatchDate && "text-muted-foreground")}>
                        {formData.dispatchDate ? format(formData.dispatchDate, "PPP") : <span>Pick a date</span>}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={formData.dispatchDate} onSelect={(d) => setFormData({...formData, dispatchDate: d})} />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Expected Arrival Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant={"outline"} className={cn("pl-3 text-left font-normal", !formData.expectedArrivalDate && "text-muted-foreground")}>
                        {formData.expectedArrivalDate ? format(formData.expectedArrivalDate, "PPP") : <span>Pick a date</span>}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={formData.expectedArrivalDate} onSelect={(d) => setFormData({...formData, expectedArrivalDate: d})} />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Tracking URL</Label>
                <Input value={formData.trackingUrl} onChange={(e) => setFormData({ ...formData, trackingUrl: e.target.value })} placeholder="https://..." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Container Number (Sea)</Label>
                  <Input value={formData.containerNumber} onChange={(e) => setFormData({ ...formData, containerNumber: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Flight Number (Air)</Label>
                  <Input value={formData.flightNumber} onChange={(e) => setFormData({ ...formData, flightNumber: e.target.value })} />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="costs" className="space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Currency</Label>
                  <Select value={formData.currency} onValueChange={(v) => setFormData({ ...formData, currency: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                      <SelectItem value="CNY">CNY</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Shipping/Freight Cost</Label>
                  <Input type="number" step="0.01" value={formData.shippingCost} onChange={(e) => setFormData({ ...formData, shippingCost: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Insurance Cost</Label>
                  <Input type="number" step="0.01" value={formData.insuranceCost} onChange={(e) => setFormData({ ...formData, insuranceCost: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Customs Duty</Label>
                  <Input type="number" step="0.01" value={formData.customsDuty} onChange={(e) => setFormData({ ...formData, customsDuty: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Handling Charges</Label>
                  <Input type="number" step="0.01" value={formData.handlingCharges} onChange={(e) => setFormData({ ...formData, handlingCharges: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} />
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={createConsignment.isPending}>
              {createConsignment.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Consignment
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
