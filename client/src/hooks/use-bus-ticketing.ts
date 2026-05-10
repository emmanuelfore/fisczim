import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export function useBusVehicles(companyId?: number) {
  return useQuery({
    queryKey: ["bus-vehicles", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const response = await apiFetch(`/api/companies/${companyId}/bus-ticketing/vehicles`);
      if (!response.ok) throw new Error("Failed to fetch vehicles");
      return response.json();
    },
    enabled: !!companyId
  });
}

export function useCreateBusVehicle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      const response = await apiFetch(`/api/companies/${data.companyId}/bus-ticketing/vehicles`, {
        method: "POST",
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("Failed to create vehicle");
      return response.json();
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
      return response.json();
    },
    enabled: !!companyId
  });
}

export function useCreateBusRoute() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      const response = await apiFetch(`/api/companies/${data.companyId}/bus-ticketing/routes`, {
        method: "POST",
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("Failed to create route");
      return response.json();
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
      const response = await apiFetch(`/api/companies/${data.companyId}/bus-ticketing/trips`, {
        method: "POST",
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("Failed to create trip");
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["bus-trips", variables.companyId] });
    }
  });
}
