with open("client/src/hooks/use-sales-orders.ts", "a") as f:
    f.write("""
export function useCreateSalesOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: any) => {
      const res = await apiFetch("/api/sales-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to create sales order");
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sales-orders"] });
    },
  });
}

export function useUpdateSalesOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string, data: any }) => {
      const res = await apiFetch(`/api/sales-orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to update sales order");
      }
      return await res.json();
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sales-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sales-orders", id] });
    },
  });
}
""")
