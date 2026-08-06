import { Layout } from "@/components/layout";
import { useState } from "react";
import { useConsignments, useFreightForwarders } from "@/hooks/use-freight";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, Search, Calendar, Truck, AlertTriangle, ExternalLink } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { useActiveCompany } from "@/hooks/use-active-company";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { CreateConsignmentDialog } from "@/components/freight/create-consignment-dialog";
import { useSuppliers } from "@/hooks/use-suppliers";
import { usePurchaseOrders } from "@/hooks/use-purchase-orders";
import { useInventoryLocations } from "@/hooks/use-stock-transfers";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function ConsignmentsPage() {
  const { activeCompanyId } = useActiveCompany(true);
  const companyId = activeCompanyId || 0;
  const { data: consignments, isLoading } = useConsignments(companyId);
  const { data: forwarders } = useFreightForwarders(companyId);
  const { data: suppliers } = useSuppliers(companyId);
  const { data: purchaseOrders } = usePurchaseOrders(companyId);
  const { data: locations } = useInventoryLocations(companyId);
  
  const [searchTerm, setSearchTerm] = useState("");

  const getForwarderName = (id: number) => forwarders?.find((f: any) => f.id === id)?.name || "Unknown";
  const getSupplierName = (id: number) => suppliers?.find((s: any) => s.id === id)?.name || "Unknown";

  const isOverdue = (c: any) => {
    if (c.status === "RECEIVED" || c.status === "CANCELLED") return false;
    if (!c.expectedArrivalDate) return false;
    return new Date(c.expectedArrivalDate) < new Date();
  };

  const filtered = consignments?.filter((c: any) => 
    c.referenceNumber?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    getSupplierName(c.supplierId).toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'PENDING': return 'bg-slate-100 text-slate-800';
      case 'BOOKED': return 'bg-amber-100 text-amber-800';
      case 'IN_TRANSIT': return 'bg-blue-100 text-blue-800';
      case 'AT_PORT': return 'bg-purple-100 text-purple-800';
      case 'CUSTOMS_CLEARANCE': return 'bg-pink-100 text-pink-800';
      case 'OUT_FOR_DELIVERY': return 'bg-indigo-100 text-indigo-800';
      case 'RECEIVED': return 'bg-emerald-100 text-emerald-800';
      default: return 'bg-slate-100 text-slate-800';
    }
  };

  const kanbanColumns = ['PENDING', 'BOOKED', 'IN_TRANSIT', 'CUSTOMS_CLEARANCE', 'RECEIVED'];

  return (
    <Layout>
      <PageHeader
        title="Consignments"
        subtitle="Track incoming shipments across all stages"
        actions={
          <CreateConsignmentDialog 
            companyId={companyId} 
            forwarders={forwarders || []} 
            suppliers={suppliers || []}
            purchaseOrders={purchaseOrders || []}
            locations={locations || []}
          />
        }
      />

      <Tabs defaultValue="kanban" className="w-full">
        <div className="flex justify-between items-center mb-6">
          <TabsList>
            <TabsTrigger value="kanban">Kanban Board</TabsTrigger>
            <TabsTrigger value="list">List View</TabsTrigger>
          </TabsList>

          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search by reference or supplier..."
              className="pl-9 bg-white"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <TabsContent value="kanban" className="m-0">
          <div className="flex overflow-x-auto pb-4 gap-4 items-start min-h-[500px]">
            {kanbanColumns.map(col => {
              const colConsignments = filtered?.filter((c: any) => c.status === col) || [];
              return (
                <div key={col} className="flex-shrink-0 w-80 bg-slate-100 rounded-lg p-3">
                  <div className="flex justify-between items-center mb-4 px-1">
                    <h3 className="font-semibold text-sm text-slate-700">{col.replace(/_/g, ' ')}</h3>
                    <Badge variant="secondary" className="bg-slate-200 text-slate-700">{colConsignments.length}</Badge>
                  </div>
                  <div className="space-y-3">
                    {colConsignments.map((c: any) => {
                      const overdue = isOverdue(c);
                      return (
                        <Card key={c.id} className={`cursor-pointer hover:border-blue-400 transition-colors ${overdue ? 'border-rose-300' : ''}`}>
                          <CardContent className="p-4 relative">
                            {overdue && <div className="absolute top-0 right-0 w-2 h-full bg-rose-500 rounded-r" />}
                            <div className="font-bold text-sm mb-1 truncate">{c.referenceNumber}</div>
                            <div className="text-xs text-slate-500 mb-3 truncate">{getSupplierName(c.supplierId)}</div>
                            <div className="flex justify-between items-end">
                              <div className="text-xs flex items-center gap-1 text-slate-500">
                                <Truck className="w-3 h-3" />
                                <span className="truncate max-w-[100px]">{getForwarderName(c.forwarderId)}</span>
                              </div>
                              {overdue ? (
                                <Badge variant="outline" className="text-rose-600 bg-rose-50 border-rose-200 text-[10px] px-1 py-0 h-4">Overdue</Badge>
                              ) : c.expectedArrivalDate ? (
                                <span className="text-[10px] text-slate-400">{format(new Date(c.expectedArrivalDate), 'MMM d')}</span>
                              ) : null}
                            </div>
                          </CardContent>
                        </Card>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </TabsContent>

        <TabsContent value="list" className="m-0">
          <div className="grid grid-cols-1 gap-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filtered?.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                <Package className="w-8 h-8 mb-4 text-slate-300" />
                <p>No consignments found</p>
              </div>
            ) : (
              filtered?.map((c: any) => {
                const overdue = isOverdue(c);
                return (
                  <Card key={c.id} className="border-none shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
                    {overdue && <div className="absolute top-0 right-0 w-2 h-full bg-rose-500" />}
                    <CardContent className="p-6">
                      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-bold text-slate-800 text-lg">
                              {c.referenceNumber}
                            </h3>
                            <Badge className={getStatusColor(c.status)}>
                              {c.status.replace(/_/g, ' ')}
                            </Badge>
                            {overdue && (
                              <Badge variant="outline" className="text-rose-600 border-rose-200 bg-rose-50">
                                <AlertTriangle className="w-3 h-3 mr-1" />
                                Overdue
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-slate-500">
                            <span className="flex items-center gap-1"><Truck className="w-4 h-4" /> {getForwarderName(c.forwarderId)}</span>
                            <span className="flex items-center gap-1"><Package className="w-4 h-4" /> {getSupplierName(c.supplierId)}</span>
                            {c.trackingUrl && (
                              <a href={c.trackingUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-blue-600 hover:underline">
                                <ExternalLink className="w-4 h-4" /> Track
                              </a>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm text-slate-500 mb-1">Shipping Cost</div>
                          <div className="font-mono font-bold text-lg">
                            {c.currency} {Number(c.shippingCost || 0).toFixed(2)}
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-4 border-t border-slate-100">
                        <div>
                          <div className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">Method</div>
                          <div className="text-sm font-medium">{c.shippingMethod}</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">Dispatch Date</div>
                          <div className="text-sm flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-slate-400" />
                            {c.dispatchDate ? format(new Date(c.dispatchDate), 'PP') : "Pending"}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">Expected Arrival</div>
                          <div className="text-sm flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-slate-400" />
                            {c.expectedArrivalDate ? format(new Date(c.expectedArrivalDate), 'PP') : "Pending"}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">Actual Arrival</div>
                          <div className="text-sm flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-slate-400" />
                            {c.actualArrivalDate ? format(new Date(c.actualArrivalDate), 'PP') : "—"}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })
            )}
          </div>
        </TabsContent>
      </Tabs>
    </Layout>
  );
}
