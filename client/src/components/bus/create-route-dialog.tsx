import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCreateBusRoute, useUpdateBusRoute } from "@/hooks/use-bus-ticketing";
import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MapPin, Loader2, Route, Plus, X, AlertCircle, Pencil } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { ZIMBABWE_CITIES } from "@shared/zimbabwe-cities";

const dropOffPointSchema = z.object({
  name: z.string().min(1, "Stop name is required"),
  price: z.coerce.number().min(0, "Price cannot be negative"),
});

const routeFormSchema = z.object({
  companyId: z.number(),
  name: z.string().min(1, "Route name is required"),
  origin: z.string().min(1, "Origin is required"),
  destination: z.string().min(1, "Destination is required"),
  distanceKm: z.coerce.number().min(0).default(0),
  basePrice: z.coerce.number().min(0, "Base price cannot be negative"),
  currency: z.enum(["USD", "ZWG"]).default("USD"),
  isActive: z.boolean().default(true),
  dropOffPoints: z.array(dropOffPointSchema).default([]),
});

type RouteFormValues = z.infer<typeof routeFormSchema>;

export function CreateRouteDialog({ companyId, existingRoutes }: { companyId: number; existingRoutes?: any[] }) {
  const [open, setOpen] = useState(false);
  const createRoute = useCreateBusRoute();

  const form = useForm<RouteFormValues>({
    resolver: zodResolver(routeFormSchema),
    defaultValues: {
      name: "",
      origin: "",
      destination: "",
      distanceKm: 0,
      basePrice: 0,
      currency: "USD",
      companyId: companyId,
      isActive: true,
      dropOffPoints: [],
    },
  });

  const onSubmit = async (data: any) => {
    // Check for duplicate routes
    const isDuplicate = existingRoutes?.some(
      (route: any) =>
        (route.origin === data.origin && route.destination === data.destination) ||
        (route.origin === data.destination && route.destination === data.origin)
    );
    
    if (isDuplicate) {
      form.setError("origin", {
        type: "manual",
        message: "A route between these cities already exists",
      });
      form.setError("destination", {
        type: "manual",
        message: "A route between these cities already exists",
      });
      return;
    }

    try {
      await createRoute.mutateAsync(data);
      setOpen(false);
      form.reset();
    } catch (error) {
      console.error("Failed to create route:", error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="gap-2 border-dashed border-2 hover:border-orange-500 hover:text-orange-600 transition-all rounded-xl"
        >
          <Route className="w-4 h-4" />
          New Route
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-display font-bold text-slate-900 flex items-center gap-2">
            <Route className="w-6 h-6 text-orange-500" />
            Create New Route
          </DialogTitle>
          <DialogDescription>
            Define a new route with its origin, destination and base price.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4 py-4"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-slate-700 font-semibold">
                    Route Name
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. Harare - Bulawayo"
                      {...field}
                      className="rounded-xl bg-slate-50 border-slate-200"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="origin"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-700 font-semibold text-xs flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-emerald-500" /> Origin
                    </FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="rounded-xl bg-slate-50 border-slate-200">
                          <SelectValue placeholder="Select origin city" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {ZIMBABWE_CITIES.map((city) => (
                          <SelectItem key={city} value={city}>
                            {city}
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
                name="destination"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-700 font-semibold text-xs flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-red-500" /> Destination
                    </FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="rounded-xl bg-slate-50 border-slate-200">
                          <SelectValue placeholder="Select destination city" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {ZIMBABWE_CITIES.map((city) => (
                          <SelectItem key={city} value={city}>
                            {city}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="distanceKm"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-700 font-semibold">
                      Distance (Km)
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        {...field}
                        onChange={(e) =>
                          field.onChange(parseFloat(e.target.value))
                        }
                        className="rounded-xl bg-slate-50 border-slate-200"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="basePrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-700 font-semibold">
                      Base Price ($)
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        {...field}
                        onChange={(e) =>
                          field.onChange(parseFloat(e.target.value))
                        }
                        className="rounded-xl bg-slate-50 border-slate-200"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="space-y-3 pt-4 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <FormLabel className="text-slate-700 font-semibold">Drop-off Points</FormLabel>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const current = form.getValues("dropOffPoints") || [];
                    form.setValue("dropOffPoints", [...current, { name: "", price: 0 }]);
                  }}
                  className="rounded-lg border-slate-200"
                >
                  <Plus className="w-4 h-4 mr-1" /> Add Stop
                </Button>
              </div>
              
              {form.watch("dropOffPoints")?.map((point: any, index: number) => (
                <div key={index} className="flex gap-2 items-start">
                  <div className="flex-1">
                    <Input
                      placeholder="Stop name (e.g. Kadoma)"
                      value={point.name}
                      onChange={(e) => {
                        const updated = [...form.getValues("dropOffPoints")];
                        updated[index].name = e.target.value;
                        form.setValue("dropOffPoints", updated);
                      }}
                      className="rounded-lg bg-slate-50 border-slate-200"
                    />
                  </div>
                  <div className="w-24">
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="Price"
                      value={point.price || ""}
                      onChange={(e) => {
                        const updated = [...form.getValues("dropOffPoints")];
                        updated[index].price = parseFloat(e.target.value) || 0;
                        form.setValue("dropOffPoints", updated);
                      }}
                      className="rounded-lg bg-slate-50 border-slate-200"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const updated = form.getValues("dropOffPoints").filter((_: any, i: number) => i !== index);
                      form.setValue("dropOffPoints", updated);
                    }}
                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>

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
                disabled={createRoute.isPending}
                className="rounded-xl bg-orange-600 hover:bg-orange-700 text-white"
              >
                {createRoute.isPending && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                Save Route
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export function EditRouteDialog({ companyId, route }: { companyId: number; route: any }) {
  const [open, setOpen] = useState(false);
  const updateRoute = useUpdateBusRoute();

  const form = useForm<RouteFormValues>({
    resolver: zodResolver(routeFormSchema),
    defaultValues: {
      companyId: companyId,
      name: route.name || "",
      origin: route.origin || "",
      destination: route.destination || "",
      distanceKm: Number(route.distanceKm || 0),
      basePrice: Number(route.basePrice || 0),
      currency: route.currency || "USD",
      isActive: route.isActive ?? true,
      dropOffPoints: Array.isArray(route.config?.dropOffPoints)
        ? route.config.dropOffPoints
        : (route.dropOffPoints || []),
    },
  });

  const onSubmit = async (data: any) => {
    try {
      await updateRoute.mutateAsync({ companyId, routeId: Number(route.id), data });
      setOpen(false);
    } catch (error) {
      console.error("Failed to update route:", error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="rounded-xl text-slate-400 hover:text-orange-600 hover:bg-orange-50"
        >
          <Pencil className="w-4 h-4" />
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-display font-bold text-slate-900 flex items-center gap-2">
            <Route className="w-6 h-6 text-orange-500" />
            Edit Route
          </DialogTitle>
          <DialogDescription>
            Update the details for {route.name || "this route"}.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4 py-4"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-slate-700 font-semibold">
                    Route Name
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. Harare - Bulawayo"
                      {...field}
                      className="rounded-xl bg-slate-50 border-slate-200"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="origin"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-700 font-semibold text-xs flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-emerald-500" /> Origin
                    </FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="rounded-xl bg-slate-50 border-slate-200">
                          <SelectValue placeholder="Select origin city" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {ZIMBABWE_CITIES.map((city) => (
                          <SelectItem key={city} value={city}>
                            {city}
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
                name="destination"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-700 font-semibold text-xs flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-red-500" /> Destination
                    </FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="rounded-xl bg-slate-50 border-slate-200">
                          <SelectValue placeholder="Select destination city" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {ZIMBABWE_CITIES.map((city) => (
                          <SelectItem key={city} value={city}>
                            {city}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="distanceKm"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-700 font-semibold">
                      Distance (Km)
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        {...field}
                        onChange={(e) =>
                          field.onChange(parseFloat(e.target.value))
                        }
                        className="rounded-xl bg-slate-50 border-slate-200"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="basePrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-700 font-semibold">
                      Base Price ($)
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        {...field}
                        onChange={(e) =>
                          field.onChange(parseFloat(e.target.value))
                        }
                        className="rounded-xl bg-slate-50 border-slate-200"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-slate-700 font-semibold">
                    Status
                  </FormLabel>
                  <Select
                    onValueChange={(v) => field.onChange(v === "true")}
                    defaultValue={field.value ? "true" : "false"}
                  >
                    <FormControl>
                      <SelectTrigger className="rounded-xl bg-slate-50 border-slate-200">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="true">Active</SelectItem>
                      <SelectItem value="false">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

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
                disabled={updateRoute.isPending}
                className="rounded-xl bg-orange-600 hover:bg-orange-700 text-white"
              >
                {updateRoute.isPending && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                Save Changes
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
