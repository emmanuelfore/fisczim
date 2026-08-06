import { useState } from "react";
import { useActiveCompany } from "@/hooks/use-active-company";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useConsignments, useReceiveConsignment } from "@/hooks/use-freight";
import { useInventoryLocations } from "@/hooks/use-stock-transfers";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckSquare } from "lucide-react";

export default function FreightReceivingPage() {
  const { activeCompanyId } = useActiveCompany(true);
  const companyId = activeCompanyId || 0;
  const { data: consignments } = useConsignments(companyId);
  const { data: locations } = useInventoryLocations(companyId);
  const receiveConsignment = useReceiveConsignment();
  const { toast } = useToast();

  const [selectedConsignmentId, setSelectedConsignmentId] = useState<string>("");
  const [destinationLocationId, setDestinationLocationId] = useState<string>("");
  const [receivedQuantities, setReceivedQuantities] = useState<Record<number, number>>({});

  const pendingConsignments = consignments?.filter((c: any) => c.status !== "RECEIVED" && c.status !== "CANCELLED") || [];
  const selectedConsignment = pendingConsignments.find((c: any) => c.id.toString() === selectedConsignmentId);

  // When consignment is selected, auto-fill location and initialize quantities
  const handleSelectConsignment = (val: string) => {
    setSelectedConsignmentId(val);
    const c = pendingConsignments.find((x: any) => x.id.toString() === val);
    if (c) {
      if (c.destinationLocationId) setDestinationLocationId(c.destinationLocationId.toString());
      
      const qtys: Record<number, number> = {};
      c.purchaseOrders?.forEach((link: any) => {
        link.purchaseOrder?.items?.forEach((item: any) => {
          // Initialize with remaining quantity
          const ordered = parseFloat(item.quantity || "0");
          const received = parseFloat(item.quantityReceived || "0");
          qtys[item.id] = Math.max(0, ordered - received);
        });
      });
      setReceivedQuantities(qtys);
    }
  };

  const handleQuantityChange = (itemId: number, val: string) => {
    const num = parseFloat(val);
    setReceivedQuantities(prev => ({ ...prev, [itemId]: isNaN(num) ? 0 : num }));
  };

  const handleSubmit = async () => {
    if (!selectedConsignmentId) return;
    if (!destinationLocationId) {
      toast({ title: "Error", description: "Please select a destination warehouse", variant: "destructive" });
      return;
    }

    const itemsPayload = Object.entries(receivedQuantities)
      .map(([id, qty]) => ({
        purchaseOrderItemId: parseInt(id),
        receivedQuantity: qty
      }))
      .filter(x => x.receivedQuantity > 0);

    try {
      await receiveConsignment.mutateAsync({
        companyId,
        id: parseInt(selectedConsignmentId),
        data: {
          destinationLocationId: parseInt(destinationLocationId),
          items: itemsPayload,
        }
      });
      toast({ title: "Success", description: "Consignment received and inventory updated." });
      setSelectedConsignmentId("");
      setReceivedQuantities({});
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to receive consignment", variant: "destructive" });
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <PageHeader
        title="Freight Receiving"
        subtitle="Verify quantities and receive stock into the warehouse"
      />
      <div className="p-6 max-w-5xl mx-auto w-full space-y-6 flex-1 overflow-y-auto">
        <Card>
          <CardHeader>
            <CardTitle>Select Consignment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Pending Consignment</Label>
                <Select value={selectedConsignmentId} onValueChange={handleSelectConsignment}>
                  <SelectTrigger><SelectValue placeholder="Select consignment to receive" /></SelectTrigger>
                  <SelectContent>
                    {pendingConsignments.map((c: any) => (
                      <SelectItem key={c.id} value={c.id.toString()}>
                        {c.referenceNumber} - {c.supplier?.name} ({c.status})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedConsignment && (
                <div className="space-y-2">
                  <Label>Destination Warehouse *</Label>
                  <Select value={destinationLocationId} onValueChange={setDestinationLocationId}>
                    <SelectTrigger><SelectValue placeholder="Select receiving warehouse" /></SelectTrigger>
                    <SelectContent>
                      {locations?.map((l: any) => (
                        <SelectItem key={l.id} value={l.id.toString()}>{l.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {selectedConsignment && (
              <div className="mt-4 p-4 bg-slate-100 rounded-md grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <div className="text-xs text-slate-500 uppercase font-bold">Forwarder</div>
                  <div className="font-medium">{selectedConsignment.forwarder?.name}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 uppercase font-bold">Shipping Method</div>
                  <div className="font-medium">{selectedConsignment.shippingMethod}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 uppercase font-bold">Tracking URL</div>
                  <div className="font-medium">
                    {selectedConsignment.trackingUrl ? (
                      <a href={selectedConsignment.trackingUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">Track</a>
                    ) : 'N/A'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 uppercase font-bold">Status</div>
                  <Badge>{selectedConsignment.status}</Badge>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {selectedConsignment && (
          <Card>
            <CardHeader>
              <CardTitle>Verify Quantities (Purchase Orders)</CardTitle>
            </CardHeader>
            <CardContent>
              {(!selectedConsignment.purchaseOrders || selectedConsignment.purchaseOrders.length === 0) ? (
                <div className="text-center text-slate-500 py-8">
                  No purchase orders linked to this consignment.<br/>
                  Receiving this will only update the consignment status, not inventory.
                </div>
              ) : (
                <div className="space-y-6">
                  {selectedConsignment.purchaseOrders.map((link: any) => {
                    const po = link.purchaseOrder;
                    if (!po) return null;
                    return (
                      <div key={po.id} className="border rounded-md p-4">
                        <div className="font-bold text-lg mb-4 pb-2 border-b">
                          PO #{po.orderNumber} - {po.currency} {po.totalAmount}
                        </div>
                        <div className="space-y-3">
                          {po.items?.map((item: any) => {
                            const ordered = parseFloat(item.quantity || "0");
                            const receivedAlready = parseFloat(item.quantityReceived || "0");
                            return (
                              <div key={item.id} className="grid grid-cols-12 gap-4 items-center">
                                <div className="col-span-4 font-medium">{item.description}</div>
                                <div className="col-span-2 text-sm text-slate-500 text-center">
                                  Ordered: {ordered}
                                </div>
                                <div className="col-span-2 text-sm text-slate-500 text-center">
                                  Prev Rcvd: {receivedAlready}
                                </div>
                                <div className="col-span-4 flex items-center gap-2">
                                  <Label className="whitespace-nowrap">Rcv Qty:</Label>
                                  <Input 
                                    type="number" 
                                    min="0"
                                    max={ordered - receivedAlready}
                                    value={receivedQuantities[item.id] ?? 0}
                                    onChange={(e) => handleQuantityChange(item.id, e.target.value)}
                                  />
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              <div className="flex justify-end mt-6">
                <Button onClick={handleSubmit} disabled={receiveConsignment.isPending} className="gap-2">
                  {receiveConsignment.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckSquare className="w-4 h-4" />}
                  Confirm Receipt
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
