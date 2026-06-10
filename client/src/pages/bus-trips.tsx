import { Layout } from "@/components/layout";
import { useState } from "react";
import {
  useBusTrips,
  useBusVehicles,
  useBusRoutes,
  useCreateBusTrip,
  useUpdateBusTripStatus,
} from "@/hooks/use-bus-ticketing";
import { Card, CardContent } from "@/components/ui/card";
import {
  Calendar,
  Search,
  MapPin,
  Bus,
  Clock,
  Users,
  Plus,
  Loader2,
  MoreHorizontal,
  Play,
  Flag,
  XCircle,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { PageHeader } from "@/components/page-header";
import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useActiveCompany } from "@/hooks/use-active-company";
import {
  isBusFeatureEnabled,
  normalizeBusSettings,
} from "@shared/bus-settings";
import { useToast } from "@/hooks/use-toast";

const tripFormSchema = z.object({
  companyId: z.number(),
  routeId: z.coerce.number().int().positive("Select a route"),
  vehicleId: z.coerce.number().int().positive("Select a vehicle"),
  conductorId: z.string().min(1, "Assign a conductor"),
  scheduledDeparture: z.coerce.date(),
  status: z.string().default("scheduled"),
});

function CreateTripDialog({ companyId }: { companyId: number }) {
  const [open, setOpen] = useState(false);
  const createTrip = useCreateBusTrip();
  const { data: routes } = useBusRoutes(companyId);
  const { data: vehicles } = useBusVehicles(companyId);
  const { data: usersResponse } = useQuery({
    queryKey: ["users", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const res = await apiFetch(`/api/companies/${companyId}/users`);
      if (!res.ok) throw new Error("Failed to fetch users");
      return await res.json();
    },
    enabled: !!companyId,
  });

  // Filter to only get active vehicles
  const activeVehicles = vehicles?.filter((v: any) => v.isActive) || [];

  // Conductor role users
  const conductors = Array.isArray(usersResponse)
    ? usersResponse.filter(
        (u: any) =>
          u.role === "bus_conductor" ||
          u.role === "cashier" ||
          u.role === "admin",
      )
    : [];

  const form = useForm({
    resolver: zodResolver(tripFormSchema),
    defaultValues: {
      companyId: companyId,
      routeId: 0,
      vehicleId: 0,
      conductorId: "",
      scheduledDeparture: new Date(),
      status: "scheduled",
    },
  });

  const onSubmit = async (data: any) => {
    try {
      await createTrip.mutateAsync(data);
      setOpen(false);
      form.reset();
    } catch (error: any) {
      console.error("Failed to schedule trip:", error);
      form.setError("root", {
        message: error?.message || "Failed to schedule trip",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2 bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white shadow-lg shadow-orange-500/20 rounded-xl transition-all duration-300">
          <Plus className="w-4 h-4" />
          Schedule Trip
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-display font-bold text-slate-900 flex items-center gap-2">
            <Calendar className="w-6 h-6 text-orange-500" />
            Schedule New Trip
          </DialogTitle>
          <DialogDescription>
            Assign a vehicle and conductor to a predefined route.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4 py-4"
          >
            <FormField
              control={form.control}
              name="routeId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-slate-700 font-semibold">
                    Route
                  </FormLabel>
                  <Select
                    onValueChange={(v) => field.onChange(parseInt(v))}
                    defaultValue={field.value ? field.value.toString() : ""}
                  >
                    <FormControl>
                      <SelectTrigger className="rounded-xl bg-slate-50 border-slate-200">
                        <SelectValue placeholder="Select a route" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {routes?.map((r: any) => (
                        <SelectItem key={r.id} value={r.id.toString()}>
                          {r.name} (${Number(r.basePrice).toFixed(2)})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="vehicleId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-slate-700 font-semibold">
                    Vehicle
                  </FormLabel>
                  <Select
                    onValueChange={(v) => field.onChange(parseInt(v))}
                    defaultValue={field.value ? field.value.toString() : ""}
                  >
                    <FormControl>
                      <SelectTrigger className="rounded-xl bg-slate-50 border-slate-200">
                        <SelectValue placeholder="Select a vehicle" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {activeVehicles.map((v: any) => (
                        <SelectItem key={v.id} value={v.id.toString()}>
                          {v.registrationNumber} ({v.capacity} seats)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="conductorId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-slate-700 font-semibold">
                    Conductor
                  </FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger className="rounded-xl bg-slate-50 border-slate-200">
                        <SelectValue placeholder="Assign a conductor" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {conductors.map((c: any) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.username || c.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="scheduledDeparture"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-slate-700 font-semibold">
                    Departure Time
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="datetime-local"
                      value={
                        field.value
                          ? new Date(
                              new Date(field.value).getTime() -
                                new Date(field.value).getTimezoneOffset() *
                                  60000,
                            )
                              .toISOString()
                              .slice(0, 16)
                          : ""
                      }
                      onChange={(e) => field.onChange(new Date(e.target.value))}
                      className="rounded-xl bg-slate-50 border-slate-200"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {form.formState.errors.root?.message && (
              <p className="rounded-xl bg-red-50 px-3 py-2  font-medium text-red-700">
                {form.formState.errors.root.message}
              </p>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                className="rounded-xl border-slate-200"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createTrip.isPending}
                className="rounded-xl bg-orange-600 hover:bg-orange-700 text-white"
              >
                {createTrip.isPending && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                Schedule
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function BusTripsPage() {
  const companyId = parseInt(localStorage.getItem("selectedCompanyId") || "0");
  const { activeCompany } = useActiveCompany();
  const { toast } = useToast();
  const busSettings = normalizeBusSettings((activeCompany as any)?.busSettings);
  const canManageTrips = isBusFeatureEnabled(busSettings, "tripManagement");
  const { data: trips, isLoading } = useBusTrips(companyId);
  const { data: routes } = useBusRoutes(companyId);
  const { data: vehicles } = useBusVehicles(companyId);
  const updateTripStatus = useUpdateBusTripStatus();

  const [searchTerm, setSearchTerm] = useState("");

  const filteredTrips = trips?.filter((t: any) => {
    const r = routes?.find((r: any) => r.id === t.routeId);
    const v = vehicles?.find((v: any) => v.id === t.vehicleId);
    const searchVal = searchTerm.toLowerCase();

    return (
      r?.name.toLowerCase().includes(searchVal) ||
      v?.registrationNumber.toLowerCase().includes(searchVal) ||
      t.status.toLowerCase().includes(searchVal)
    );
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "scheduled":
        return "bg-blue-50 text-blue-700 border-blue-100";
      case "boarding":
        return "bg-amber-50 text-amber-700 border-amber-100";
      case "en_route":
        return "bg-purple-50 text-purple-700 border-purple-100";
      case "completed":
        return "bg-emerald-50 text-emerald-700 border-emerald-100";
      case "cancelled":
        return "bg-red-50 text-red-700 border-red-100";
      default:
        return "bg-slate-50 text-slate-700 border-slate-100";
    }
  };

  const updateStatus = async (tripId: number, status: string) => {
    try {
      await updateTripStatus.mutateAsync({ companyId, tripId, status });
      toast({
        title: "Trip updated",
        description: `Trip #${tripId} is now ${status.replace("_", " ")}.`,
      });
    } catch (error: any) {
      toast({
        title: "Trip update failed",
        description: error.message || "Could not update trip status.",
        variant: "destructive",
      });
    }
  };

  const statusActions = (status: string) => {
    switch (status) {
      case "scheduled":
        return [{ label: "Start boarding", status: "boarding", icon: Play }];
      case "boarding":
        return [
          { label: "Depart", status: "en_route", icon: Play },
          { label: "Cancel", status: "cancelled", icon: XCircle },
        ];
      case "en_route":
        return [
          { label: "Pause trip", status: "in_progress", icon: Clock },
          { label: "Complete trip", status: "completed", icon: Flag },
        ];
      case "in_progress":
        return [
          { label: "Resume trip", status: "en_route", icon: Play },
          { label: "Complete trip", status: "completed", icon: Flag },
        ];
      default:
        return [];
    }
  };

  return (
    <Layout>
      <PageHeader
        title="Trip Scheduling"
        subtitle="Manage and track active bus trips"
        actions={
          canManageTrips ? <CreateTripDialog companyId={companyId} /> : null
        }
      />

      {!canManageTrips && (
        <Card className="border-dashed border-slate-200 shadow-sm">
          <CardContent className="p-8 text-center  text-slate-500">
            Bus trip management is hidden by the current bus-ticketing settings.
          </CardContent>
        </Card>
      )}

      {canManageTrips && (
        <div className="admin-panel mb-4 flex flex-col gap-3 p-4 md:flex-row md:items-center">
          <div className="relative flex-1 w-full sm:max-w-sm group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#64748B] transition-colors duration-200" />
            <Input
              placeholder="Search trips by route, vehicle, status..."
              className="pl-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      )}

      {canManageTrips && (
        <Card className="overflow-hidden border-none shadow-sm">
          <CardContent className="p-0">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100 text-[11px] uppercase tracking-wider font-bold text-slate-500">
                  <th className="px-6 py-4">Trip Details</th>
                  <th className="px-6 py-4">Vehicle</th>
                  <th className="px-6 py-4">Schedule</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="h-32 text-center text-slate-400">
                      Loading trips...
                    </td>
                  </tr>
                ) : filteredTrips?.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="h-32 text-center text-slate-400">
                      No trips found
                    </td>
                  </tr>
                ) : (
                  filteredTrips?.map((t: any) => {
                    const route = routes?.find((r: any) => r.id === t.routeId);
                    const vehicle = vehicles?.find(
                      (v: any) => v.id === t.vehicleId,
                    );

                    return (
                      <tr
                        key={t.id}
                        className="group hover:bg-slate-50/50 transition-colors"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center text-orange-600 shadow-sm">
                              <MapPin className="w-5 h-5" />
                            </div>
                            <div>
                              <div className="font-bold text-slate-900 group-hover:text-orange-600 transition-colors uppercase tracking-tight">
                                {route?.name || `Route #${t.routeId}`}
                              </div>
                              <div className="text-[11px] text-slate-500 font-medium">
                                ID: {t.id}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1">
                            <div className=" font-bold text-slate-700 flex items-center gap-1.5 uppercase">
                              <Bus className="w-4 h-4 text-slate-400" />
                              {vehicle?.registrationNumber ||
                                `Vehicle #${t.vehicleId}`}
                            </div>
                            <div className="text-[11px] text-slate-500 font-medium flex items-center gap-1">
                              <Users className="w-3 h-3 text-slate-400" />
                              {vehicle?.capacity
                                ? `${vehicle.capacity} Seats`
                                : "Unknown Capacity"}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1">
                            <div className=" font-semibold text-slate-700 flex items-center gap-1.5">
                              <Clock className="w-4 h-4 text-orange-500" />
                              {format(
                                new Date(t.scheduledDeparture),
                                "MMM d, yyyy",
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 font-medium ml-5.5">
                              {format(new Date(t.scheduledDeparture), "h:mm a")}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide shadow-sm border ${getStatusColor(t.status)}`}
                          >
                            {t.status.replace("_", " ")}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-9 w-9 rounded-xl text-slate-400 hover:text-orange-600 hover:bg-orange-50"
                                disabled={updateTripStatus.isPending}
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {statusActions(t.status).length === 0 ? (
                                <DropdownMenuItem disabled>
                                  No available actions
                                </DropdownMenuItem>
                              ) : (
                                statusActions(t.status).map((action) => {
                                  const Icon = action.icon;
                                  return (
                                    <DropdownMenuItem
                                      key={action.status}
                                      onClick={() =>
                                        updateStatus(t.id, action.status)
                                      }
                                    >
                                      <Icon className="h-4 w-4" />
                                      {action.label}
                                    </DropdownMenuItem>
                                  );
                                })
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </Layout>
  );
}
