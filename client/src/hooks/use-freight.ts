import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export function useFreightForwarders(companyId: number) {
  return useQuery({
    queryKey: ["/api/companies", companyId, "freight", "forwarders"],
    queryFn: async () => {
      if (!companyId) return [];
      const res = await apiFetch(`/api/companies/${companyId}/freight/forwarders`);
      if (!res.ok) throw new Error("Failed to fetch freight forwarders");
      return res.json();
    },
    enabled: !!companyId,
  });
}

export function useCreateFreightForwarder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ companyId, data }: { companyId: number; data: any }) => {
      const res = await apiFetch(`/api/companies/${companyId}/freight/forwarders`, {
        method: "POST",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create freight forwarder");
      return res.json();
    },
    onSuccess: (_, { companyId }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies", companyId, "freight", "forwarders"] });
    },
  });
}

export function useConsignments(companyId: number) {
  return useQuery({
    queryKey: ["/api/companies", companyId, "freight", "consignments"],
    queryFn: async () => {
      if (!companyId) return [];
      const res = await apiFetch(`/api/companies/${companyId}/freight/consignments`);
      if (!res.ok) throw new Error("Failed to fetch consignments");
      return res.json();
    },
    enabled: !!companyId,
  });
}

export function useCreateConsignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ companyId, data }: { companyId: number; data: any }) => {
      const res = await apiFetch(`/api/companies/${companyId}/freight/consignments`, {
        method: "POST",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create consignment");
      return res.json();
    },
    onSuccess: (_, { companyId }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies", companyId, "freight", "consignments"] });
    },
  });
}

export function useUpdateConsignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ companyId, id, data }: { companyId: number; id: number; data: any }) => {
      const res = await apiFetch(`/api/companies/${companyId}/freight/consignments/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update consignment");
      return res.json();
    },
    onSuccess: (_, { companyId }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies", companyId, "freight", "consignments"] });
    },
  });
}

export function useReceiveConsignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ companyId, id, data }: { companyId: number; id: number; data: { items: any[], destinationLocationId: number } }) => {
      const res = await apiFetch(`/api/companies/${companyId}/freight/consignments/${id}/receive`, {
        method: "POST",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to receive consignment");
      return res.json();
    },
    onSuccess: (_, { companyId }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies", companyId, "freight", "consignments"] });
    },
  });
}
