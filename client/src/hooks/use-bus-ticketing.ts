import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

function normalizeVehicle(vehicle: any) {
  return {
    ...vehicle,
    registrationNumber: vehicle.registrationNumber ?? vehicle.regNumber,
    fleetNumber: vehicle.fleetNumber ?? vehicle.fleetId,
  };
}

function normalizeRoute(route: any) {
  return {
    ...route,
    origin: route.origin ?? route.fromLocation,
    destination: route.destination ?? route.toLocation,
    distanceKm: route.distanceKm ?? route.config?.distanceKm ?? null,
    basePrice: Number(route.basePrice ?? 0),
  };
}

function toVehiclePayload(data: any) {
  return {
    companyId: data.companyId,
    regNumber: data.regNumber ?? data.registrationNumber,
    fleetId: (data.fleetId ?? data.fleetNumber) || null,
    model: data.model || null,
    capacity: Number(data.capacity || 0),
    isActive: data.isActive ?? true,
  };
}

function toRoutePayload(data: any) {
  return {
    companyId: data.companyId,
    name: data.name,
    fromLocation: data.fromLocation ?? data.origin,
    toLocation: data.toLocation ?? data.destination,
    basePrice: String(data.basePrice ?? 0),
    isActive: data.isActive ?? true,
    config: data.config ?? {
      distanceKm: Number(data.distanceKm || 0),
      currency: data.currency || "USD",
      dropOffPoints: [],
      passengerName: false,
      idNumber: false,
      phone: false,
      seatNumber: true,
      dropOffPoint: false,
      requirePaymentMethod: true,
      allowMultiPassenger: true,
    },
  };
}

function toTripPayload(data: any) {
  return {
    companyId: data.companyId,
    routeId: Number(data.routeId),
    vehicleId: Number(data.vehicleId),
    conductorId: data.conductorId,
    scheduledDeparture: data.scheduledDeparture instanceof Date
      ? data.scheduledDeparture.toISOString()
      : data.scheduledDeparture,
    status: data.status || "scheduled",
  };
}

async function readError(response: Response, fallback: string) {
  const text = await response.text().catch(() => "");
  if (!text) return fallback;
  try {
    const parsed = JSON.parse(text);
    return parsed.message || parsed.error || fallback;
  } catch {
    return text;
  }
}

export function useBusVehicles(companyId?: number) {
  return useQuery({
    queryKey: ["bus-vehicles", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const response = await apiFetch(`/api/companies/${companyId}/bus-ticketing/vehicles`);
      if (!response.ok) throw new Error("Failed to fetch vehicles");
      const data = await response.json();
      return Array.isArray(data) ? data.map(normalizeVehicle) : [];
    },
    enabled: !!companyId
  });
}

export function useCreateBusVehicle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      const payload = toVehiclePayload(data);
      const response = await apiFetch(`/api/companies/${data.companyId}/bus-ticketing/vehicles`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error("Failed to create vehicle");
      return normalizeVehicle(await response.json());
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["bus-vehicles", variables.companyId] });
    }
  });
}

export function useBusRoutes(companyId?: number) {
  return useQuery({
    queryKey: ["bus-routes", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const response = await apiFetch(`/api/companies/${companyId}/bus-ticketing/routes`);
      if (!response.ok) throw new Error("Failed to fetch routes");
      const data = await response.json();
      return Array.isArray(data) ? data.map(normalizeRoute) : [];
    },
    enabled: !!companyId
  });
}

export function useCreateBusRoute() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      const payload = toRoutePayload(data);
      const response = await apiFetch(`/api/companies/${data.companyId}/bus-ticketing/routes`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error("Failed to create route");
      return normalizeRoute(await response.json());
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["bus-routes", variables.companyId] });
    }
  });
}

export function useBusTrips(companyId?: number) {
  return useQuery({
    queryKey: ["bus-trips", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const response = await apiFetch(`/api/companies/${companyId}/bus-ticketing/trips`);
      if (!response.ok) throw new Error("Failed to fetch trips");
      return response.json();
    },
    enabled: !!companyId
  });
}

export function useCreateBusTrip() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      const payload = toTripPayload(data);
      const response = await apiFetch(`/api/companies/${data.companyId}/bus-ticketing/trips`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(await readError(response, "Failed to create trip"));
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["bus-trips", variables.companyId] });
    }
  });
}

export function useUpdateBusTripStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ companyId, tripId, status }: { companyId: number; tripId: number; status: string }) => {
      const now = new Date().toISOString();
      const payload: Record<string, string> = { status };
      if (status === "en_route" || status === "in_progress") payload.actualDeparture = now;
      if (status === "completed") payload.actualArrival = now;

      const response = await apiFetch(`/api/companies/${companyId}/bus-ticketing/trips/${tripId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(await readError(response, "Failed to update trip"));
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["bus-trips", variables.companyId] });
      queryClient.invalidateQueries({ queryKey: ["bus-report", variables.companyId] });
    },
  });
}

export function useBusConductors(companyId?: number) {
  return useQuery({
    queryKey: ["bus-conductors", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const response = await apiFetch(`/api/companies/${companyId}/users`);
      if (!response.ok) throw new Error("Failed to fetch conductors");
      const data = await response.json();
      return Array.isArray(data)
        ? data.filter((user: any) => ["cashier", "admin", "owner"].includes(user.role))
        : [];
    },
    enabled: !!companyId,
  });
}

export function useCreateBusConductor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      const response = await apiFetch(`/api/companies/${data.companyId}/users`, {
        method: "POST",
        body: JSON.stringify({
          email: data.email,
          name: data.name,
          username: data.username,
          password: data.password,
          role: "cashier",
        }),
      });
      if (!response.ok) throw new Error(await readError(response, "Failed to add conductor"));
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["users", variables.companyId] });
      queryClient.invalidateQueries({ queryKey: ["bus-conductors", variables.companyId] });
    },
  });
}

export function useBusReport(companyId?: number, from?: string, to?: string) {
  return useQuery({
    queryKey: ["bus-report", companyId, from, to],
    queryFn: async () => {
      if (!companyId) return null;
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const response = await apiFetch(`/api/companies/${companyId}/bus-ticketing/reports/summary?${params.toString()}`);
      if (!response.ok) throw new Error(await readError(response, "Failed to fetch bus report"));
      return response.json();
    },
    enabled: !!companyId,
  });
}
