import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export const VEHICLE_STAGES = [
  { value: "purchased", label: "Purchased" },
  { value: "in_transit", label: "In Transit" },
  { value: "container_loaded", label: "Container Loaded" },
  { value: "at_port", label: "At Port" },
  { value: "clearing", label: "Clearing" },
  { value: "cleared", label: "Cleared" },
  { value: "in_delivery", label: "In Delivery" },
  { value: "delivered", label: "Delivered" },
] as const;

export const COST_CATEGORIES = [
  { value: "purchase", label: "Purchase price" },
  { value: "shipping", label: "Shipping / freight" },
  { value: "logistics", label: "Logistics" },
  { value: "admin_fee", label: "Admin fees" },
  { value: "bank_charges", label: "Bank charges" },
  { value: "duty", label: "Duty" },
  { value: "clearing", label: "Clearing" },
  { value: "delivery", label: "Delivery" },
  { value: "insurance", label: "Insurance" },
  { value: "registration", label: "Registration / licensing" },
  { value: "inspection", label: "Inspection" },
  { value: "commission", label: "Commission" },
  { value: "other", label: "Other" },
] as const;

export const COST_STATUSES = [
  { value: "pending", label: "Pending" },
  { value: "paid", label: "Paid" },
  { value: "disputed", label: "Disputed" },
  { value: "cancelled", label: "Cancelled" },
] as const;

export const costStatusLabel = (s: string) => COST_STATUSES.find((x) => x.value === s)?.label ?? s;

export const stageLabel = (s: string) => VEHICLE_STAGES.find((x) => x.value === s)?.label ?? s;
export const costLabel = (c: string) => COST_CATEGORIES.find((x) => x.value === c)?.label ?? c;

export type VehicleSummary = {
  purchasePrice?: number;
  landedCost?: number;
  importCosts?: number;
  sellingPrice: number;
  isProjected: boolean;
  profit?: number;
  marginPercent?: number;
  paid: number;
  balance: number;
  costsByCategory?: Record<string, number>;
  pendingCosts?: number;
  paidCosts?: number;
  disputedCosts?: number;
  negativeMargin?: boolean;
  lowMargin?: boolean;
  hasUnpaidCosts?: boolean;
};

export type VehicleInvoice = {
  id: number;
  invoiceNumber: string;
  status: string | null;
  total: string;
  paidAmount: string;
  currency: string | null;
  dueDate: string | null;
  issueDate: string | null;
};

export type VehicleOpenScheduleLine = {
  id: number;
  type: string;
  dueDate: string;
  amount: number;
  open: number;
  state: "paid" | "overdue" | "upcoming";
  lastReminderAt: string | null;
};

export type VehicleReminder = {
  id: number;
  channel: string;
  status: string;
  amount: string | null;
  message: string | null;
  error: string | null;
  sentAt: string;
  scheduleIds?: number[] | null;
};

export type Vehicle = {
  id: number;
  stockNumber: string;
  vin: string | null;
  make: string;
  model: string;
  year: number | null;
  colour: string | null;
  mileage: number | null;
  engine: string | null;
  transmission: string | null;
  supplierName: string | null;
  auctionRef: string | null;
  containerNumber: string | null;
  vesselName: string | null;
  portOfDischarge: string | null;
  eta: string | null;
  stage: string;
  status: string;
  targetPrice: string | null;
  salePrice: string | null;
  saleCurrency: string | null;
  saleExchangeRate: string | null;
  customerId: number | null;
  customerName?: string | null;
  invoiceId: number | null;
  notes: string | null;
  summary: VehicleSummary;
  invoice?: VehicleInvoice | null;
  reminders?: VehicleReminder[];
  openSchedule?: VehicleOpenScheduleLine[];
};

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = body?.error;
    throw new Error(typeof err === "string" ? err : Array.isArray(err) ? err.map((e: any) => e.message).join(", ") : `Request failed (${res.status})`);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

const send = (url: string, method: string, body?: unknown) =>
  apiFetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

export function useVehicles(companyId: number, filters: { stage?: string; status?: string; search?: string } = {}) {
  const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v) as [string, string][]).toString();
  return useQuery({
    queryKey: ["vehicles", companyId, qs],
    enabled: !!companyId,
    queryFn: async () => json<Vehicle[]>(await apiFetch(`/api/companies/${companyId}/vehicles${qs ? `?${qs}` : ""}`)),
  });
}

export function useVehicle(companyId: number, id: number) {
  return useQuery({
    queryKey: ["vehicle", companyId, id],
    enabled: !!companyId && !!id,
    queryFn: async () => json<any>(await apiFetch(`/api/companies/${companyId}/vehicles/${id}`)),
  });
}

/** Company staff, used to assign a salesperson to a vehicle. */
export function useCompanyStaff(companyId: number) {
  return useQuery({
    queryKey: ["company-staff", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const users = await json<any[]>(await apiFetch(`/api/companies/${companyId}/users`));
      return users.filter((u) => u.isActive !== false);
    },
  });
}

export type VehicleReportFilters = {
  from?: string;
  to?: string;
  supplierId?: string | number;
  status?: string;
  stage?: string;
  customerId?: string | number;
  search?: string;
};

export function useVehicleReport<T = any>(
  companyId: number,
  report: "outstanding" | "profitability" | "costing" | "consignments",
  enabled = true,
  filters: VehicleReportFilters = {},
) {
  const qs = new URLSearchParams(
    Object.entries(filters)
      .filter(([, v]) => v !== undefined && v !== null && v !== "" && v !== "all")
      .map(([k, v]) => [k, String(v)]),
  ).toString();
  return useQuery({
    queryKey: ["vehicles-report", companyId, report, qs],
    enabled: !!companyId && enabled,
    queryFn: async () => json<T>(await apiFetch(`/api/companies/${companyId}/vehicles-reports/${report}${qs ? `?${qs}` : ""}`)),
  });
}

/** Re-run freight/consignment allocation for the vehicles on a consignment. */
export function useAllocateConsignment(companyId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ consignmentId, weights = "purchase" }: { consignmentId: number; weights?: "purchase" | "equal" }) =>
      json<any>(
        await send(`/api/companies/${companyId}/vehicles-reports/consignments/${consignmentId}/allocate`, "POST", { weights }),
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vehicles", companyId] });
      qc.invalidateQueries({ queryKey: ["vehicle", companyId] });
      qc.invalidateQueries({ queryKey: ["vehicles-report", companyId] });
    },
  });
}

/** One mutation factory for every vehicle write; invalidates list, detail and reports. */
export function useVehicleAction(companyId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ path, method = "POST", body }: { path: string; method?: string; body?: unknown }) =>
      json<any>(await send(`/api/companies/${companyId}/vehicles${path}`, method, body)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vehicles", companyId] });
      qc.invalidateQueries({ queryKey: ["vehicle", companyId] });
      qc.invalidateQueries({ queryKey: ["vehicles-report", companyId] });
    },
  });
}

export const fmtMoney = (n: number | string | null | undefined, currency = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(n || 0));
