import { useActiveCompany } from "@/hooks/use-active-company";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Truck, Package, AlertTriangle, CheckCircle, Clock } from "lucide-react";
import { useConsignments } from "@/hooks/use-freight";
import { Badge } from "@/components/ui/badge";
import { Layout } from "@/components/layout";

export default function FreightDashboardPage() {
  const { activeCompanyId } = useActiveCompany(true);
  const { data: consignments, isLoading } = useConsignments(activeCompanyId || 0);

  if (isLoading) return <div className="p-8 text-center text-slate-500">Loading dashboard metrics...</div>;

  const inTransitCount = consignments?.filter((c: any) => c.status === "IN_TRANSIT" || c.status === "AT_PORT").length || 0;
  
  // A simple overdue calculation: expectedArrivalDate is in the past and not RECEIVED
  const now = new Date();
  const delayedConsignments = consignments?.filter((c: any) => {
    if (c.status === "RECEIVED" || c.status === "CANCELLED") return false;
    if (!c.expectedArrivalDate) return false;
    return new Date(c.expectedArrivalDate) < now;
  }) || [];
  
  const receivedThisMonth = consignments?.filter((c: any) => {
    if (c.status !== "RECEIVED" || !c.actualArrivalDate) return false;
    const arrivalDate = new Date(c.actualArrivalDate);
    return arrivalDate.getMonth() === now.getMonth() && arrivalDate.getFullYear() === now.getFullYear();
  }).length || 0;

  const totalFreightCost = consignments?.reduce((acc: number, c: any) => {
    return acc + parseFloat(c.shippingCost || "0");
  }, 0) || 0;

  return (
    <Layout>
      <div className="flex flex-col h-full bg-slate-50">
        <PageHeader
          title="Freight & Logistics Dashboard"
          subtitle="High-level metrics and shipment alerts"
        />
        <div className="p-6 space-y-6 flex-1 overflow-y-auto">
          {delayedConsignments.length > 0 && (
            <div className="bg-rose-50 border border-rose-200 rounded-lg p-4 flex items-start gap-4">
              <AlertTriangle className="w-6 h-6 text-rose-500 flex-shrink-0 mt-1" />
              <div>
                <h3 className="font-bold text-rose-800">Delayed Shipments Alert</h3>
                <p className="text-rose-700 text-sm mt-1">
                  There are {delayedConsignments.length} consignments that have passed their expected arrival date.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {delayedConsignments.map((c: any) => (
                    <Badge key={c.id} variant="outline" className="border-rose-300 bg-white text-rose-700">
                      {c.referenceNumber} ({c.supplier?.name || 'Unknown'})
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">In Transit</CardTitle>
                <Truck className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{inTransitCount}</div>
                <p className="text-xs text-muted-foreground">Active shipments on the move</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Delayed</CardTitle>
                <AlertTriangle className="h-4 w-4 text-rose-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-rose-600">{delayedConsignments.length}</div>
                <p className="text-xs text-muted-foreground">Past expected arrival</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Received This Month</CardTitle>
                <CheckCircle className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{receivedThisMonth}</div>
                <p className="text-xs text-muted-foreground">Successfully delivered</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Freight Cost</CardTitle>
                <Package className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">${totalFreightCost.toFixed(2)}</div>
                <p className="text-xs text-muted-foreground">Lifetime across all shipments</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Recent Consignments</CardTitle>
            </CardHeader>
            <CardContent>
              {consignments?.slice(0, 5).map((c: any) => (
                <div key={c.id} className="flex items-center justify-between py-3 border-b last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                      <Truck className="w-5 h-5 text-slate-500" />
                    </div>
                    <div>
                      <div className="font-bold">{c.referenceNumber}</div>
                      <div className="text-xs text-slate-500">{c.supplier?.name || "Unknown Supplier"}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge variant="outline">{c.status}</Badge>
                    <div className="text-xs text-slate-500 mt-1">
                      {c.expectedArrivalDate ? new Date(c.expectedArrivalDate).toLocaleDateString() : 'No ETA'}
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
