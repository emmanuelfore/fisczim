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
import { MapPin, Loader2, Route, Plus, X, AlertCircle, Pencil, Flag } from "lucide-react";
import { useState, useMemo } from "react";
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
  stops: z.array(z.string()).default([]),
  fares: z.record(z.coerce.number()).default({}),
  dropOffPoints: z.array(dropOffPointSchema).default([]),
});

type RouteFormValues = z.infer<typeof routeFormSchema>;

export function CreateRouteDialog({ companyId, existingRoutes }: { companyId: number; existingRoutes?: any[] }) {
  const [open, setOpen] = useState(false);
  const [newStop, setNewStop] = useState("");
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
      stops: [],
      fares: {},
      dropOffPoints: [],
    },
  });

  const stopsList = useMemo(() => {
    const origin = form.watch("origin") || "";
    const destination = form.watch("destination") || "";
    const stops = form.watch("stops") || [];
    const merged = [origin, ...stops, destination].filter((s: string) => s.trim());
    const seen = new Set<string>();
    return merged.filter((s: string) => (seen.has(s) ? false : (seen.add(s), true)));
  }, [form.watch("origin"), form.watch("destination"), form.watch("stops")]);

  const farePairs = useMemo(() => {
    const pairs: Array<[string, string]> = [];
    for (let i = 0; i < stopsList.length; i++) {
      for (let j = i + 1; j < stopsList.length; j++) {
        pairs.push([stopsList[i], stopsList[j]]);
      }
    }
    return pairs;
  }, [stopsList]);

  const suggestFare = (from: string, to: string) => {
    const stops = stopsList;
    const basePrice = Number(form.watch("basePrice") || 0);
    if (stops.length < 2 || !(basePrice > 0)) return basePrice || 0;
    const i = stops.indexOf(from);
    const j = stops.indexOf(to);
    if (i < 0 || j < 0) return basePrice || 0;
    return Math.round((basePrice * Math.abs(j - i) / (stops.length - 1)) * 100) / 100;
  };

  const addStop = () => {
    const stop = newStop.trim();
    if (!stop) return;
    const stops = form.watch("stops") || [];
    if (stops.includes(stop) || stopsList.includes(stop)) return;
    form.setValue("stops", [...stops, stop]);
    setNewStop("");
  };

  const removeStop = (stop: string) => {
    const stops = (form.watch("stops") || []).filter((s: string) => s !== stop);
    form.setValue("stops", stops);
    const fares = { ...(form.watch("fares") || {}) };
    for (const key of Object.keys(fares)) {
      const [from, to] = key.split("|");
      if (from === stop || to === stop) delete fares[key];
    }
    form.setValue("fares", fares);
  };

  const setFare = (key: string, reverseKey: string, value: number) => {
    const fares = { ...(form.watch("fares") || {}) };
    if (isNaN(value) || value < 0) {
      delete fares[key];
      delete fares[reverseKey];
    } else {
      fares[key] = value;
    }
    form.setValue("fares", fares);
  };

  const autoFillFares = () => {
    const fares: Record<string, number> = {};
    for (const [from, to] of farePairs) {
      fares[`${from}|${to}`] = suggestFare(from, to);
    }
    form.setValue("fares", fares);
  };

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
                    <FormControl>
                      <Input
                        list="route-origin-cities"
                        placeholder="Type origin or pick from list"
                        {...field}
                        className="rounded-xl bg-slate-50 border-slate-200"
                      />
                    </FormControl>
                    <datalist id="route-origin-cities">
                      {ZIMBABWE_CITIES.map((city) => (
                        <option key={city} value={city} />
                      ))}
                    </datalist>
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
                    <FormControl>
                      <Input
                        list="route-destination-cities"
                        placeholder="Type destination or pick from list"
                        {...field}
                        className="rounded-xl bg-slate-50 border-slate-200"
                      />
                    </FormControl>
                    <datalist id="route-destination-cities">
                      {ZIMBABWE_CITIES.map((city) => (
                        <option key={city} value={city} />
                      ))}
                    </datalist>
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
                <FormLabel className="text-slate-700 font-semibold">Stops & Fares</FormLabel>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={autoFillFares}
                  className="rounded-lg border-slate-200"
                >
                  Auto-fill fares
                </Button>
              </div>
              <p className="text-xs text-slate-500">
                Origin and destination are the route endpoints. Add intermediate stops between them; the bus will
                serve any boarding/drop-off point along the route.
              </p>

              {/* Ordered stops */}
              <div className="flex gap-2 items-center">
                <div className="flex-1">
                  <Input
                    placeholder="Add intermediate stop (e.g. Kadoma)"
                    value={newStop}
                    onChange={(e) => setNewStop(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); addStop(); }
                    }}
                    className="rounded-lg bg-slate-50 border-slate-200"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addStop}
                  className="rounded-lg border-slate-200"
                >
                  <Plus className="w-4 h-4" /> Add Stop
                </Button>
              </div>

              <div className="flex flex-wrap gap-2">
                {stopsList.map((stop, index) => (
                  <div
                    key={stop}
                    className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium border ${
                      index === 0 || index === stopsList.length - 1
                        ? "bg-orange-50 border-orange-200 text-orange-700"
                        : "bg-slate-50 border-slate-200 text-slate-700"
                    }`}
                  >
                    {index === 0 && <MapPin className="w-3.5 h-3.5" />}
                    {index === stopsList.length - 1 && <Flag className="w-3.5 h-3.5" />}
                    {stop}
                    {index !== 0 && index !== stopsList.length - 1 && (
                      <button
                        type="button"
                        onClick={() => removeStop(stop)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Fare matrix */}
              {stopsList.length >= 2 && (
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="text-left px-3 py-2 font-semibold text-slate-600 text-xs">From</th>
                        <th className="text-left px-3 py-2 font-semibold text-slate-600 text-xs">To</th>
                        <th className="text-right px-3 py-2 font-semibold text-slate-600 text-xs">Fare ({form.watch("currency")})</th>
                      </tr>
                    </thead>
                    <tbody>
                      {farePairs.map(([from, to]) => {
                        const key = `${from}|${to}`;
                        const reverseKey = `${to}|${from}`;
                        const value = (form.watch("fares")?.[key] ?? form.watch("fares")?.[reverseKey]);
                        const displayValue = typeof value === "number" && !Number.isNaN(value) ? String(value) : "";
                        return (
                          <tr key={key} className="border-t border-slate-100">
                            <td className="px-3 py-1.5 text-slate-700">{from}</td>
                            <td className="px-3 py-1.5 text-slate-700">{to}</td>
                            <td className="px-3 py-1.5 text-right">
                              <Input
                                type="number"
                                step="0.01"
                                placeholder={suggestFare(from, to).toFixed(2)}
                                value={displayValue}
                                onChange={(e) => setFare(key, reverseKey, parseFloat(e.target.value))}
                                className="rounded-lg bg-slate-50 border-slate-200 text-right w-28 ml-auto"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
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
  const [newStop, setNewStop] = useState("");
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
      stops: Array.isArray(route.stops) && route.stops.length >= 2
        ? route.stops
        : (route.config?.stops && route.config.stops.length >= 2 ? route.config.stops : []),
      fares: route.fares && typeof route.fares === "object"
        ? route.fares
        : (route.config?.fares && typeof route.config.fares === "object" ? route.config.fares : {}),
      dropOffPoints: Array.isArray(route.config?.dropOffPoints)
        ? route.config.dropOffPoints
        : (route.dropOffPoints || []),
    },
  });

  const stopsList = useMemo(() => {
    const origin = form.watch("origin") || "";
    const destination = form.watch("destination") || "";
    const stops = form.watch("stops") || [];
    const merged = [origin, ...stops, destination].filter((s: string) => s.trim());
    const seen = new Set<string>();
    return merged.filter((s: string) => (seen.has(s) ? false : (seen.add(s), true)));
  }, [form.watch("origin"), form.watch("destination"), form.watch("stops")]);

  const farePairs = useMemo(() => {
    const pairs: Array<[string, string]> = [];
    for (let i = 0; i < stopsList.length; i++) {
      for (let j = i + 1; j < stopsList.length; j++) {
        pairs.push([stopsList[i], stopsList[j]]);
      }
    }
    return pairs;
  }, [stopsList]);

  const suggestFare = (from: string, to: string) => {
    const stops = stopsList;
    const basePrice = Number(form.watch("basePrice") || 0);
    if (stops.length < 2 || !(basePrice > 0)) return basePrice || 0;
    const i = stops.indexOf(from);
    const j = stops.indexOf(to);
    if (i < 0 || j < 0) return basePrice || 0;
    return Math.round((basePrice * Math.abs(j - i) / (stops.length - 1)) * 100) / 100;
  };

  const addStop = () => {
    const stop = newStop.trim();
    if (!stop) return;
    const stops = form.watch("stops") || [];
    if (stops.includes(stop) || stopsList.includes(stop)) return;
    form.setValue("stops", [...stops, stop]);
    setNewStop("");
  };

  const removeStop = (stop: string) => {
    const stops = (form.watch("stops") || []).filter((s: string) => s !== stop);
    form.setValue("stops", stops);
    const fares = { ...(form.watch("fares") || {}) };
    for (const key of Object.keys(fares)) {
      const [from, to] = key.split("|");
      if (from === stop || to === stop) delete fares[key];
    }
    form.setValue("fares", fares);
  };

  const setFare = (key: string, reverseKey: string, value: number) => {
    const fares = { ...(form.watch("fares") || {}) };
    if (isNaN(value) || value < 0) {
      delete fares[key];
      delete fares[reverseKey];
    } else {
      fares[key] = value;
    }
    form.setValue("fares", fares);
  };

  const autoFillFares = () => {
    const fares: Record<string, number> = {};
    for (const [from, to] of farePairs) {
      fares[`${from}|${to}`] = suggestFare(from, to);
    }
    form.setValue("fares", fares);
  };

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
                    <FormControl>
                      <Input
                        list="route-origin-cities"
                        placeholder="Type origin or pick from list"
                        {...field}
                        className="rounded-xl bg-slate-50 border-slate-200"
                      />
                    </FormControl>
                    <datalist id="route-origin-cities">
                      {ZIMBABWE_CITIES.map((city) => (
                        <option key={city} value={city} />
                      ))}
                    </datalist>
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
                    <FormControl>
                      <Input
                        list="route-destination-cities"
                        placeholder="Type destination or pick from list"
                        {...field}
                        className="rounded-xl bg-slate-50 border-slate-200"
                      />
                    </FormControl>
                    <datalist id="route-destination-cities">
                      {ZIMBABWE_CITIES.map((city) => (
                        <option key={city} value={city} />
                      ))}
                    </datalist>
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
                <FormLabel className="text-slate-700 font-semibold">Stops & Fares</FormLabel>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={autoFillFares}
                  className="rounded-lg border-slate-200"
                >
                  Auto-fill fares
                </Button>
              </div>
              <p className="text-xs text-slate-500">
                Origin and destination are the route endpoints. Add intermediate stops; the bus will serve any
                boarding/drop-off point along the route.
              </p>

              <div className="flex gap-2 items-center">
                <div className="flex-1">
                  <Input
                    placeholder="Add intermediate stop (e.g. Kadoma)"
                    value={newStop}
                    onChange={(e) => setNewStop(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); addStop(); }
                    }}
                    className="rounded-lg bg-slate-50 border-slate-200"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addStop}
                  className="rounded-lg border-slate-200"
                >
                  <Plus className="w-4 h-4" /> Add Stop
                </Button>
              </div>

              <div className="flex flex-wrap gap-2">
                {stopsList.map((stop, index) => (
                  <div
                    key={stop}
                    className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium border ${
                      index === 0 || index === stopsList.length - 1
                        ? "bg-orange-50 border-orange-200 text-orange-700"
                        : "bg-slate-50 border-slate-200 text-slate-700"
                    }`}
                  >
                    {index === 0 && <MapPin className="w-3.5 h-3.5" />}
                    {index === stopsList.length - 1 && <Flag className="w-3.5 h-3.5" />}
                    {stop}
                    {index !== 0 && index !== stopsList.length - 1 && (
                      <button
                        type="button"
                        onClick={() => removeStop(stop)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {stopsList.length >= 2 && (
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="text-left px-3 py-2 font-semibold text-slate-600 text-xs">From</th>
                        <th className="text-left px-3 py-2 font-semibold text-slate-600 text-xs">To</th>
                        <th className="text-right px-3 py-2 font-semibold text-slate-600 text-xs">Fare ({form.watch("currency")})</th>
                      </tr>
                    </thead>
                    <tbody>
                      {farePairs.map(([from, to]) => {
                        const key = `${from}|${to}`;
                        const reverseKey = `${to}|${from}`;
                        const value = (form.watch("fares")?.[key] ?? form.watch("fares")?.[reverseKey]);
                        const displayValue = typeof value === "number" && !Number.isNaN(value) ? String(value) : "";
                        return (
                          <tr key={key} className="border-t border-slate-100">
                            <td className="px-3 py-1.5 text-slate-700">{from}</td>
                            <td className="px-3 py-1.5 text-slate-700">{to}</td>
                            <td className="px-3 py-1.5 text-right">
                              <Input
                                type="number"
                                step="0.01"
                                placeholder={suggestFare(from, to).toFixed(2)}
                                value={displayValue}
                                onChange={(e) => setFare(key, reverseKey, parseFloat(e.target.value))}
                                className="rounded-lg bg-slate-50 border-slate-200 text-right w-28 ml-auto"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
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
