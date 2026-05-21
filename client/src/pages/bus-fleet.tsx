import { Layout } from "@/components/layout";
import { useState } from "react";
import { useBusVehicles, useBusRoutes } from "@/hooks/use-bus-ticketing";
import { Card, CardContent } from "@/components/ui/card";
import { Bus, Route, Search, ChevronLeft, ChevronRight, MapPin, Users } from "lucide-react";
import { CreateVehicleDialog } from "@/components/bus/create-vehicle-dialog";
import { CreateRouteDialog } from "@/components/bus/create-route-dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/page-header";
import { useActiveCompany } from "@/hooks/use-active-company";
import { isBusFeatureEnabled, normalizeBusSettings } from "@shared/bus-settings";

export default function BusFleetPage() {
    const companyId = parseInt(localStorage.getItem("selectedCompanyId") || "0");
    const { activeCompany } = useActiveCompany();
    const busSettings = normalizeBusSettings((activeCompany as any)?.busSettings);
    const canManageFleet = isBusFeatureEnabled(busSettings, "fleetManagement");
    const canManageFares = isBusFeatureEnabled(busSettings, "fareMatrix");
    const { data: vehicles, isLoading: loadingVehicles } = useBusVehicles(companyId);
    const { data: routes, isLoading: loadingRoutes } = useBusRoutes(companyId);
    
    const [vehicleSearch, setVehicleSearch] = useState("");
    const [routeSearch, setRouteSearch] = useState("");

    const filteredVehicles = vehicles?.filter((v: any) => 
        v.registrationNumber.toLowerCase().includes(vehicleSearch.toLowerCase()) ||
        v.fleetNumber?.toLowerCase().includes(vehicleSearch.toLowerCase()) ||
        v.model?.toLowerCase().includes(vehicleSearch.toLowerCase())
    );

    const filteredRoutes = routes?.filter((r: any) => 
        r.name.toLowerCase().includes(routeSearch.toLowerCase()) ||
        r.origin.toLowerCase().includes(routeSearch.toLowerCase()) ||
        r.destination.toLowerCase().includes(routeSearch.toLowerCase())
    );

    return (
        <Layout>
            <PageHeader
                title="Bus Fleet Management"
                subtitle="Manage your vehicles and travel routes"
                actions={
                    <div className="flex gap-2">
                        {canManageFares && <CreateRouteDialog companyId={companyId} />}
                        {canManageFleet && <CreateVehicleDialog companyId={companyId} />}
                    </div>
                }
            />

            {!canManageFleet && !canManageFares && (
                <Card className="border-dashed border-slate-200 shadow-sm">
                    <CardContent className="p-8 text-center text-sm text-slate-500">
                        Bus fleet and fare matrix tools are hidden by the current bus-ticketing settings.
                    </CardContent>
                </Card>
            )}

            {(canManageFleet || canManageFares) && <Tabs defaultValue={canManageFleet ? "vehicles" : "routes"} className="space-y-4">
                <TabsList className="bg-slate-100/50 p-1 rounded-xl w-fit">
                    {canManageFleet && <TabsTrigger value="vehicles" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">
                        <Bus className="w-4 h-4 mr-2" />
                        Vehicles ({vehicles?.length || 0})
                    </TabsTrigger>}
                    {canManageFares && <TabsTrigger value="routes" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">
                        <Route className="w-4 h-4 mr-2" />
                        Routes ({routes?.length || 0})
                    </TabsTrigger>}
                </TabsList>

                {canManageFleet && <TabsContent value="vehicles" className="space-y-4">
                    <div className="admin-panel mb-4 flex flex-col gap-3 p-4 md:flex-row md:items-center">
                        <div className="relative flex-1 w-full sm:max-w-sm group">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#64748B] transition-colors duration-200" />
                            <Input
                                placeholder="Search vehicles by reg, fleet #, model..."
                                className="pl-9"
                                value={vehicleSearch}
                                onChange={(e) => setVehicleSearch(e.target.value)}
                            />
                        </div>
                    </div>

                    <Card className="overflow-hidden border-none shadow-sm">
                        <CardContent className="p-0">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-50/50 border-b border-slate-100 text-[11px] uppercase tracking-wider font-bold text-slate-500">
                                        <th className="px-6 py-4">Vehicle Info</th>
                                        <th className="px-6 py-4">Capacity</th>
                                        <th className="px-6 py-4">Status</th>
                                        <th className="px-6 py-4 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {loadingVehicles ? (
                                        <tr><td colSpan={4} className="h-32 text-center text-slate-400">Loading vehicles...</td></tr>
                                    ) : filteredVehicles?.length === 0 ? (
                                        <tr><td colSpan={4} className="h-32 text-center text-slate-400">No vehicles found</td></tr>
                                    ) : filteredVehicles?.map((v: any) => (
                                        <tr key={v.id} className="group hover:bg-slate-50/50 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center text-orange-600 font-bold text-sm shadow-sm group-hover:scale-105 transition-transform duration-200">
                                                        <Bus className="w-5 h-5" />
                                                    </div>
                                                    <div>
                                                        <div className="font-bold text-slate-900 group-hover:text-orange-600 transition-colors uppercase tracking-tight">
                                                            {v.registrationNumber}
                                                        </div>
                                                        <div className="text-[11px] text-slate-500 font-medium flex items-center gap-2">
                                                            <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">#{v.fleetNumber}</span>
                                                            <span className="truncate">{v.model}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2 text-slate-600">
                                                    <Users className="w-4 h-4 text-slate-400" />
                                                    <span className="font-semibold">{v.capacity} Seats</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide shadow-sm border ${
                                                    v.isActive ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-50 text-slate-500 border-slate-100'
                                                }`}>
                                                    {v.isActive ? 'Active' : 'Inactive'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <Button variant="ghost" size="sm" className="rounded-xl text-slate-400 hover:text-orange-600 hover:bg-orange-50">Edit</Button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </CardContent>
                    </Card>
                </TabsContent>}

                {canManageFares && <TabsContent value="routes" className="space-y-4">
                    <div className="admin-panel mb-4 flex flex-col gap-3 p-4 md:flex-row md:items-center">
                        <div className="relative flex-1 w-full sm:max-w-sm group">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#64748B] transition-colors duration-200" />
                            <Input
                                placeholder="Search routes by name or location..."
                                className="pl-9"
                                value={routeSearch}
                                onChange={(e) => setRouteSearch(e.target.value)}
                            />
                        </div>
                    </div>

                    <Card className="overflow-hidden border-none shadow-sm">
                        <CardContent className="p-0">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-50/50 border-b border-slate-100 text-[11px] uppercase tracking-wider font-bold text-slate-500">
                                        <th className="px-6 py-4">Route</th>
                                        <th className="px-6 py-4">Logistics</th>
                                        <th className="px-6 py-4">Pricing</th>
                                        <th className="px-6 py-4 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {loadingRoutes ? (
                                        <tr><td colSpan={4} className="h-32 text-center text-slate-400">Loading routes...</td></tr>
                                    ) : filteredRoutes?.length === 0 ? (
                                        <tr><td colSpan={4} className="h-32 text-center text-slate-400">No routes found</td></tr>
                                    ) : filteredRoutes?.map((r: any) => (
                                        <tr key={r.id} className="group hover:bg-slate-50/50 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center text-orange-600 shadow-sm group-hover:scale-105 transition-transform duration-200">
                                                        <Route className="w-5 h-5" />
                                                    </div>
                                                    <div>
                                                        <div className="font-bold text-slate-900 group-hover:text-orange-600 transition-colors uppercase tracking-tight">
                                                            {r.name}
                                                        </div>
                                                        <div className="text-[11px] text-slate-500 font-medium flex items-center gap-1.5 uppercase tracking-wide">
                                                            <span>{r.origin}</span>
                                                            <ChevronRight className="w-3 h-3 text-slate-300" />
                                                            <span>{r.destination}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col gap-1">
                                                    <div className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                                                        <MapPin className="w-3 h-3 text-slate-400" />
                                                        {r.distanceKm} Km
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="inline-flex items-center px-2 py-1 rounded-lg bg-orange-50 text-orange-700 font-mono text-sm font-bold border border-orange-100 shadow-sm">
                                                    <span className="text-[10px] mr-1 opacity-60">$</span>
                                                    {Number(r.basePrice).toFixed(2)}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <Button variant="ghost" size="sm" className="rounded-xl text-slate-400 hover:text-orange-600 hover:bg-orange-50">Edit</Button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </CardContent>
                    </Card>
                </TabsContent>}
            </Tabs>}
        </Layout>
    );
}
