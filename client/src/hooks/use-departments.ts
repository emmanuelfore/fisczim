import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export type Department = {
  id: number;
  companyId?: number;
  name: string;
  code?: string | null;
  costCenterId?: number | null;
};

/** Active departments configured for the tenant (payroll/departmental master). */
export function useDepartments(companyId: number) {
  return useQuery<Department[]>({
    queryKey: ["payroll-departments", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const res = await apiFetch(`/api/v1/payroll/departments?companyId=${companyId}`);
      if (!res.ok) throw new Error("Failed to fetch departments");
      return res.json();
    },
    enabled: !!companyId,
  });
}
