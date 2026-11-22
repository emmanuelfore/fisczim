import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

/**
 * CRM data layer. Mirrors server/routes/crm.ts endpoint for endpoint so the
 * board can drive the pipeline from real stages instead of a hardcoded status
 * list, and so the chatter, duplicates and forecast endpoints are reachable.
 */

const crmBase = (companyId: number) => `/api/companies/${companyId}/crm`;

export type CrmStage = {
  id: number;
  companyId: number;
  name: string;
  sequence: number;
  probability: number;
  isWon: boolean;
  isLost: boolean;
  color: string | null;
  isActive: boolean | null;
  createdAt: string | null;
};

export type EnquiryRecord = {
  id: number;
  companyId: number;
  branchId: number | null;
  customerId: number | null;
  stageId: number | null;
  name: string;
  phone: string | null;
  email: string | null;
  source: string | null;
  interest: string | null;
  notes: string | null;
  status: string;
  lostReason: string | null;
  tags: string[] | null;
  expectedRevenue: string | null;
  expectedCloseDate: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  quotationId: number | null;
  assignedTo: string | null;
  createdBy: string | null;
  lastActivityAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  stage?: CrmStage | null;
  assignee?: { id: string; name: string; email: string } | null;
  customer?: { id: number; name: string } | null;
  followUps?: EnquiryFollowUp[];
  nextFollowUp?: EnquiryFollowUp | null;
  activities?: EnquiryActivity[];
  vehicles?: EnquiryVehicle[];
};

export type EnquiryVehicle = {
  id: number;
  stockNumber: string;
  make: string;
  model: string;
  year: number | null;
  status: string;
  stage: string;
  salePrice: string | null;
  saleCurrency: string | null;
  invoiceId: number | null;
  customerId: number | null;
};

export type EnquiryFollowUp = {
  id: number;
  enquiryId: number;
  dueAt: string | null;
  channel: string | null;
  notes: string | null;
  outcome: string | null;
  completedAt: string | null;
  createdAt: string | null;
  enquiry?: { id: number; name: string; phone: string | null; status: string } | null;
  assignee?: { id: string; name: string } | null;
};

export type EnquiryActivity = {
  id: number;
  enquiryId: number;
  type: string;
  body: string | null;
  metadata: unknown;
  userId: string | null;
  createdAt: string | null;
};

async function readJson(res: Response, fallback: string) {
  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = typeof body?.error === "string" ? body.error : "";
    } catch {
      detail = "";
    }
    throw new Error(detail || fallback);
  }
  return res.json();
}

// ── stages ───────────────────────────────────────────────────────────────────

export function useCrmStages(companyId: number) {
  return useQuery({
    queryKey: queryKeys.crm.stages(companyId),
    queryFn: async () => {
      if (!companyId) return [] as CrmStage[];
      const res = await apiFetch(`${crmBase(companyId)}/stages`);
      return readJson(res, "Failed to fetch stages") as Promise<CrmStage[]>;
    },
    enabled: !!companyId,
  });
}

export function useCreateStage(companyId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<CrmStage>) => {
      const res = await apiFetch(`${crmBase(companyId)}/stages`, {
        method: "POST",
        body: JSON.stringify(data),
      });
      return readJson(res, "Failed to create stage");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.crm.stages(companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.crm.reports.pipeline(companyId) });
    },
  });
}

export function useUpdateStage(companyId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: number } & Partial<CrmStage>) => {
      const res = await apiFetch(`${crmBase(companyId)}/stages/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
      return readJson(res, "Failed to update stage");
    },
    onSuccess: () => {
      // A stage's won/lost flags re-derive the status of every enquiry in it.
      queryClient.invalidateQueries({ queryKey: queryKeys.crm.stages(companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.crm.enquiries.all(companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.crm.reports.all(companyId) });
    },
  });
}

export function useDeleteStage(companyId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await apiFetch(`${crmBase(companyId)}/stages/${id}`, { method: "DELETE" });
      return readJson(res, "Failed to delete stage");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.crm.stages(companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.crm.enquiries.all(companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.crm.reports.pipeline(companyId) });
    },
  });
}

// ── enquiries ────────────────────────────────────────────────────────────────

export type EnquiryFilters = {
  status?: string;
  stageId?: number;
  assignedTo?: string;
  search?: string;
};

export function useEnquiries(companyId: number, filters: EnquiryFilters = {}) {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.stageId) params.set("stageId", String(filters.stageId));
  if (filters.assignedTo) params.set("assignedTo", filters.assignedTo);
  if (filters.search) params.set("search", filters.search);
  const qs = params.toString();

  return useQuery({
    queryKey: queryKeys.crm.enquiries.list(companyId, filters),
    queryFn: async () => {
      if (!companyId) return [] as EnquiryRecord[];
      const res = await apiFetch(`${crmBase(companyId)}/enquiries${qs ? `?${qs}` : ""}`);
      return readJson(res, "Failed to fetch enquiries") as Promise<EnquiryRecord[]>;
    },
    enabled: !!companyId,
  });
}

export function useEnquiryDetail(companyId: number, id: number | null) {
  return useQuery({
    queryKey: queryKeys.crm.enquiries.detail(companyId, id),
    queryFn: async () => {
      if (!companyId || !id) return null;
      const res = await apiFetch(`${crmBase(companyId)}/enquiries/${id}`);
      return readJson(res, "Failed to fetch enquiry") as Promise<EnquiryRecord>;
    },
    enabled: !!companyId && !!id,
  });
}

export function useCreateEnquiry(companyId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<EnquiryRecord>) => {
      const res = await apiFetch(`${crmBase(companyId)}/enquiries`, {
        method: "POST",
        body: JSON.stringify(data),
      });
      return readJson(res, "Failed to capture enquiry");
    },
    onSuccess: () => invalidatePipeline(queryClient, companyId),
  });
}

/** Editable fields only - status is derived from the stage, never set here. */
export function useUpdateEnquiry(companyId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Record<string, unknown> }) => {
      const res = await apiFetch(`${crmBase(companyId)}/enquiries/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
      return readJson(res, "Failed to update enquiry");
    },
    onSuccess: (_result, { id }) => {
      invalidatePipeline(queryClient, companyId);
      queryClient.invalidateQueries({ queryKey: queryKeys.crm.enquiries.detail(companyId, id) });
    },
  });
}

export function useMoveEnquiryStage(companyId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, stageId, lostReason }: { id: number; stageId: number; lostReason?: string }) => {
      const res = await apiFetch(`${crmBase(companyId)}/enquiries/${id}/stage`, {
        method: "POST",
        body: JSON.stringify({ stageId, lostReason }),
      });
      return readJson(res, "Failed to move enquiry");
    },
    onSuccess: () => invalidatePipeline(queryClient, companyId),
  });
}

export function useConvertEnquiry(companyId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await apiFetch(`${crmBase(companyId)}/enquiries/${id}/convert`, { method: "POST" });
      return readJson(res, "Failed to link customer");
    },
    onSuccess: (_result, id) => {
      invalidatePipeline(queryClient, companyId);
      queryClient.invalidateQueries({ queryKey: queryKeys.crm.enquiries.detail(companyId, id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.list(companyId) });
    },
  });
}

export function useCreateEnquiryQuotation(companyId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, items }: { id: number; items: QuotationLine[] }) => {
      const res = await apiFetch(`${crmBase(companyId)}/enquiries/${id}/quotation`, {
        method: "POST",
        body: JSON.stringify({ items }),
      });
      return readJson(res, "Failed to raise quotation");
    },
    onSuccess: (_result, { id }) => {
      invalidatePipeline(queryClient, companyId);
      queryClient.invalidateQueries({ queryKey: queryKeys.crm.enquiries.detail(companyId, id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.quotations.list(companyId) });
    },
  });
}

export type QuotationLine = {
  productId?: number | null;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
};

// ── chatter ──────────────────────────────────────────────────────────────────

export function useLogActivity(companyId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ enquiryId, type = "note", body }: { enquiryId: number; type?: string; body: string }) => {
      const res = await apiFetch(`${crmBase(companyId)}/enquiries/${enquiryId}/activities`, {
        method: "POST",
        body: JSON.stringify({ type, body }),
      });
      return readJson(res, "Failed to log activity");
    },
    onSuccess: (_result, { enquiryId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.crm.enquiries.detail(companyId, enquiryId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.crm.enquiries.all(companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.crm.reports.pipeline(companyId) });
    },
  });
}

// ── follow-ups (activities) ──────────────────────────────────────────────────

export type FollowUpScope = "due" | "upcoming" | "all";

export function useFollowUps(companyId: number, scope: FollowUpScope = "due") {
  return useQuery({
    queryKey: queryKeys.crm.followUps.scope(companyId, scope),
    queryFn: async () => {
      if (!companyId) return [] as EnquiryFollowUp[];
      const res = await apiFetch(`${crmBase(companyId)}/follow-ups?scope=${scope}`);
      return readJson(res, "Failed to fetch follow-ups") as Promise<EnquiryFollowUp[]>;
    },
    enabled: !!companyId,
  });
}

export function useCreateFollowUp(companyId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ enquiryId, data }: { enquiryId: number; data: Partial<EnquiryFollowUp> }) => {
      const res = await apiFetch(`${crmBase(companyId)}/enquiries/${enquiryId}/follow-ups`, {
        method: "POST",
        body: JSON.stringify(data),
      });
      return readJson(res, "Failed to schedule follow-up");
    },
    onSuccess: () => invalidatePipeline(queryClient, companyId),
  });
}

export function useUpdateFollowUp(companyId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Record<string, unknown> }) => {
      const res = await apiFetch(`${crmBase(companyId)}/follow-ups/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
      return readJson(res, "Failed to update follow-up");
    },
    onSuccess: () => invalidatePipeline(queryClient, companyId),
  });
}

// ── duplicates, dormancy, forecasting ────────────────────────────────────────

export function useCrmDuplicates(companyId: number, enabled = true) {
  return useQuery({
    queryKey: queryKeys.crm.duplicates(companyId),
    queryFn: async () => {
      if (!companyId) return [];
      const res = await apiFetch(`${crmBase(companyId)}/duplicates`);
      return readJson(res, "Failed to scan duplicates");
    },
    enabled: !!companyId && enabled,
  });
}

export function useMergeEnquiries(companyId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ targetId, sourceIds }: { targetId: number; sourceIds: number[] }) => {
      const res = await apiFetch(`${crmBase(companyId)}/enquiries/${targetId}/merge`, {
        method: "POST",
        body: JSON.stringify({ sourceIds }),
      });
      return readJson(res, "Failed to merge enquiries");
    },
    onSuccess: () => invalidatePipeline(queryClient, companyId),
  });
}

export function useDormantEnquiries(companyId: number, days = 30) {
  return useQuery({
    queryKey: queryKeys.crm.dormant.days(companyId, days),
    queryFn: async () => {
      if (!companyId) return [];
      const res = await apiFetch(`${crmBase(companyId)}/dormant?days=${days}`);
      return readJson(res, "Failed to fetch dormant enquiries");
    },
    enabled: !!companyId,
  });
}

export function usePipelineReport(companyId: number, enabled = true) {
  return useQuery({
    queryKey: queryKeys.crm.reports.pipeline(companyId),
    queryFn: async () => {
      if (!companyId) return null;
      const res = await apiFetch(`${crmBase(companyId)}/reports/pipeline`);
      return readJson(res, "Failed to build pipeline report");
    },
    enabled: !!companyId && enabled,
  });
}

/**
 * Open leads whose free-text interest matches a stock item. Used when adding a
 * vehicle so the salesperson can attach the lead that asked for it.
 */
export function useMatchingEnquiries(
  companyId: number,
  match: { make?: string | null; model?: string | null; year?: string | number | null },
  enabled = true,
) {
  const make = String(match.make ?? "").trim();
  const model = String(match.model ?? "").trim();
  const year = String(match.year ?? "").trim();
  const params = new URLSearchParams();
  if (make) params.set("make", make);
  if (model) params.set("model", model);
  if (year) params.set("year", year);

  return useQuery({
    queryKey: queryKeys.crm.matchingEnquiries.search(companyId, make, model, year),
    enabled: !!companyId && enabled && (!!make || !!model),
    queryFn: async () => {
      const res = await apiFetch(`${crmBase(companyId)}/matching-enquiries?${params.toString()}`);
      return readJson(res, "Failed to match enquiries") as Promise<EnquiryRecord[]>;
    },
  });
}

export type ReserveVehicleInput = {
  vehicleId: number;
  enquiryId?: number;
  customerId?: number;
  salePrice?: number;
  saleCurrency?: string;
  saleExchangeRate?: number;
  salespersonId?: string | null;
};

/**
 * Reserves an available vehicle for an enquiry. The server links the customer,
 * assigns the salesperson and moves the vehicle to reserved; the enquiry stays
 * open until the vehicle is invoiced.
 */
export function useReserveVehicle(companyId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ vehicleId, ...data }: ReserveVehicleInput) => {
      const res = await apiFetch(`/api/companies/${companyId}/vehicles/${vehicleId}/reserve`, {
        method: "POST",
        body: JSON.stringify(data),
      });
      return readJson(res, "Failed to reserve vehicle");
    },
    onSuccess: (_result, { enquiryId }) => {
      invalidatePipeline(queryClient, companyId);
      if (enquiryId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.crm.enquiries.detail(companyId, enquiryId) });
      }
      queryClient.invalidateQueries({ queryKey: ["vehicles", companyId] });
      queryClient.invalidateQueries({ queryKey: ["vehicle", companyId] });
    },
  });
}

function invalidatePipeline(queryClient: ReturnType<typeof useQueryClient>, companyId: number) {
  queryClient.invalidateQueries({ queryKey: queryKeys.crm.enquiries.all(companyId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.crm.followUps.all(companyId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.crm.reports.all(companyId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.crm.duplicates(companyId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.crm.dormant.all(companyId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.crm.matchingEnquiries.all(companyId) });
}

// ── social capture ───────────────────────────────────────────────────────────

export type SocialConnection = {
  id: number;
  platform: string;
  externalAccountId: string;
  accountName: string | null;
  appId: string | null;
  hasAccessToken: boolean;
  hasAppSecret: boolean;
  hasWebhookToken: boolean;
  tokenExpiresAt: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  active: boolean;
  createdAt: string | null;
};

export type SocialLeadRow = {
  id: number;
  kind: "lead";
  platform: string;
  externalLeadId: string;
  formId: string | null;
  formName: string | null;
  adId: string | null;
  campaignName: string | null;
  fullName: string | null;
  phone: string | null;
  email: string | null;
  answers: Record<string, string> | null;
  enquiryId: number | null;
  createdOnPlatformAt: string | null;
  receivedAt: string | null;
};

export type SocialCommentRow = {
  id: number;
  kind: "comment";
  platform: string;
  postId: string;
  postPermalink: string | null;
  externalCommentId: string;
  fromName: string | null;
  message: string | null;
  likes: number | null;
  enquiryId: number | null;
  createdOnPlatformAt: string | null;
  receivedAt: string | null;
};

export type SocialInbox = { leads: SocialLeadRow[]; comments: SocialCommentRow[] };
export type InboxRef = { kind: "lead" | "comment"; id: number };

/** What the connect and edit dialogs send; the secrets only ever travel one way. */
export type SocialConnectionDraft = {
  platform?: string;
  externalAccountId?: string;
  accountName?: string;
  appId?: string;
  accessToken?: string;
  appSecret?: string;
  webhookToken?: string;
  active?: boolean;
};

/** A new connection: the platform and its account id are what every later delivery is routed by. */
export type SocialConnectDraft = SocialConnectionDraft & {
  platform: string;
  externalAccountId: string;
};

const social = (companyId: number) => `${crmBase(companyId)}/social`;

export function useSocialConnections(companyId: number) {
  return useQuery({
    queryKey: queryKeys.crm.social.connections(companyId),
    queryFn: async () => {
      if (!companyId) return [] as SocialConnection[];
      const res = await apiFetch(`${social(companyId)}/connections`);
      return readJson(res, "Failed to fetch social connections") as Promise<SocialConnection[]>;
    },
    enabled: !!companyId,
  });
}

export function useSocialSetup(companyId: number) {
  return useQuery({
    queryKey: queryKeys.crm.social.setup(companyId),
    queryFn: async () => {
      if (!companyId) return null;
      const res = await apiFetch(`${social(companyId)}/setup`);
      return readJson(res, "Failed to fetch the webhook addresses");
    },
    enabled: !!companyId,
  });
}

export function useSocialInbox(companyId: number, enabled = true, poll = false) {
  return useQuery({
    queryKey: queryKeys.crm.social.inbox(companyId),
    queryFn: async () => {
      if (!companyId) return { leads: [], comments: [] } as SocialInbox;
      const res = await apiFetch(`${social(companyId)}/inbox`);
      return readJson(res, "Failed to fetch the social inbox") as Promise<SocialInbox>;
    },
    enabled: !!companyId && enabled,
    // Platforms push without warning, so an open Social tab watches for arrivals
    // instead of waiting for an invalidation that never comes.
    refetchInterval: poll ? 15_000 : false,
    refetchIntervalInBackground: false,
  });
}

/** One row per delivery the platforms made, including the ones we threw out. */
export type SocialDelivery = {
  id: number;
  connectionId: number | null;
  platform: string;
  externalAccountId: string | null;
  signed: boolean;
  leadsSeen: number;
  commentsSeen: number;
  leadsStored: number;
  commentsStored: number;
  reason: string | null;
  receivedAt: string | null;
};

export function useSocialDeliveries(companyId: number, enabled = true, poll = false) {
  return useQuery({
    queryKey: queryKeys.crm.social.deliveries(companyId),
    queryFn: async () => {
      if (!companyId) return [] as SocialDelivery[];
      const res = await apiFetch(`${social(companyId)}/deliveries?limit=25`);
      return readJson(res, "Failed to fetch the delivery log") as Promise<SocialDelivery[]>;
    },
    enabled: !!companyId && enabled,
    refetchInterval: poll ? 15_000 : false,
    refetchIntervalInBackground: false,
  });
}

function invalidateSocial(queryClient: ReturnType<typeof useQueryClient>, companyId: number) {
  queryClient.invalidateQueries({ queryKey: queryKeys.crm.social.all(companyId) });
}

export function useConnectSocial(companyId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: SocialConnectDraft) => {
      const res = await apiFetch(`${social(companyId)}/connections`, {
        method: "POST",
        body: JSON.stringify(data),
      });
      return readJson(res, "Failed to connect that account") as Promise<SocialConnection>;
    },
    onSuccess: () => invalidateSocial(queryClient, companyId),
  });
}

export function useUpdateSocialConnection(companyId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: number } & SocialConnectionDraft) => {
      const res = await apiFetch(`${social(companyId)}/connections/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
      return readJson(res, "Failed to update that connection") as Promise<SocialConnection>;
    },
    onSuccess: () => invalidateSocial(queryClient, companyId),
  });
}

export function useDisconnectSocial(companyId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await apiFetch(`${social(companyId)}/connections/${id}`, { method: "DELETE" });
      return readJson(res, "Failed to disconnect that account");
    },
    onSuccess: () => invalidateSocial(queryClient, companyId),
  });
}

export function useTestSocialConnection(companyId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await apiFetch(`${social(companyId)}/connections/${id}/test`, { method: "POST" });
      return readJson(res, "Failed to check that connection") as Promise<{
        verified: boolean;
        accountName?: string | null;
        message?: string;
      }>;
    },
    onSuccess: () => invalidateSocial(queryClient, companyId),
  });
}

export function useSyncSocialConnection(companyId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await apiFetch(`${social(companyId)}/connections/${id}/sync`, { method: "POST" });
      return readJson(res, "Failed to sync that connection") as Promise<{
        leads: number;
        comments: number;
        skipped?: string;
      }>;
    },
    onSuccess: () => invalidateSocial(queryClient, companyId),
  });
}

export function useCaptureSocial(companyId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (refs: InboxRef[]) => {
      const res = await apiFetch(`${social(companyId)}/capture`, {
        method: "POST",
        body: JSON.stringify({ refs }),
      });
      return readJson(res, "Failed to capture those submissions") as Promise<{
        captured: number;
        failed: Array<{ status: number; error: string }>;
        enquiryIds: number[];
      }>;
    },
    onSuccess: () => {
      invalidateSocial(queryClient, companyId);
      // A captured submission is an enquiry the board has not seen yet.
      queryClient.invalidateQueries({ queryKey: queryKeys.crm.enquiries.all(companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.crm.reports.all(companyId) });
    },
  });
}

export function useIgnoreSocial(companyId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (refs: InboxRef[]) => {
      const res = await apiFetch(`${social(companyId)}/ignore`, {
        method: "POST",
        body: JSON.stringify({ refs }),
      });
      return readJson(res, "Failed to discard those submissions") as Promise<{ ignored: number }>;
    },
    onSuccess: () => invalidateSocial(queryClient, companyId),
  });
}

/** Retry the platform fetch for a lead that arrived without its answers. */
export function useRefetchSocialLead(companyId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await apiFetch(`${social(companyId)}/leads/${id}/refetch`, { method: "POST" });
      return readJson(res, "Failed to re-fetch that lead") as Promise<Omit<SocialLeadRow, "kind">>;
    },
    onSuccess: () => invalidateSocial(queryClient, companyId),
  });
}

// ── commissions, settings, rules, tasks & penalties ─────────────────────────

export type CommissionBasisName = "gross_profit" | "revenue" | "fixed";

export type CommissionSettingsClient = {
  responseWindowHours: number;
  penaltyPerLateTask: number;
  penaltyCapPercent: number;
  workingDays: number[];
  workdayStart: string;
  workdayEnd: string;
  utcOffsetMinutes: number;
  defaultBasis: CommissionBasisName;
  defaultRatePercent: number;
  defaultFixedAmount: number;
};

export type CommissionRule = {
  id: number;
  companyId: number;
  salespersonId: string;
  salespersonName?: string;
  basis: CommissionBasisName;
  ratePercent: string;
  fixedAmount: string;
  isActive: boolean;
  notes: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type CommissionPenalty = {
  id: number;
  companyId: number;
  taskId: number | null;
  salespersonId: string;
  salespersonName?: string;
  commissionId: number | null;
  amount: string;
  lateHours: string;
  reason: string | null;
  appliedAt: string | null;
  createdAt: string | null;
};

export type Commission = {
  id: number;
  companyId: number;
  salespersonId: string;
  salespersonName?: string;
  enquiryId: number | null;
  vehicleId: number | null;
  invoiceId: number | null;
  reference: string | null;
  basis: string;
  saleAmount: string;
  costAmount: string;
  basisAmount: string;
  ratePercent: string;
  fixedAmount: string;
  grossAmount: string;
  penaltyAmount: string;
  netAmount: string;
  status: string;
  periodMonth: string | null;
  notes: string | null;
  requestedBy: string | null;
  requestedAt: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  paidAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  penalties: CommissionPenalty[];
};

export type CommissionSummary = {
  gross: number;
  penalties: number;
  net: number;
  pendingCount: number;
  pendingNet: number;
  approvedNet: number;
  paidNet: number;
  draftCount: number;
};

export type CommissionsResponse = {
  commissions: Commission[];
  summary: CommissionSummary;
  seeAll: boolean;
  canApprove: boolean;
  pendingPenalties: number;
};

export type CrmTask = {
  id: number;
  companyId: number;
  enquiryId: number | null;
  assignedTo: string;
  assigneeName?: string;
  createdBy: string | null;
  creatorName?: string | null;
  title: string;
  body: string | null;
  priority: string;
  status: string;
  dueAt: string;
  respondedAt: string | null;
  responseNote: string | null;
  penaltyApplied: boolean;
  penaltyAmount: string;
  completedAt: string | null;
  createdAt: string | null;
  overdue: boolean;
  lateHours: number;
  remainingHours: number;
};

export type CrmTasksResponse = {
  tasks: CrmTask[];
  settings: CommissionSettingsClient;
};

function invalidateCommissions(queryClient: ReturnType<typeof useQueryClient>, companyId: number) {
  queryClient.invalidateQueries({ queryKey: queryKeys.crm.commissions.all(companyId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.crm.commissions.settings(companyId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.crm.tasks.all(companyId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.crm.commissions.taskPenalties(companyId) });
}

// ── settings ─────────────────────────────────────────────────────────────────

export function useCommissionSettings(companyId: number) {
  return useQuery({
    queryKey: queryKeys.crm.commissions.settings(companyId),
    queryFn: async () => {
      if (!companyId) return null;
      const res = await apiFetch(`${crmBase(companyId)}/commission-settings`);
      return readJson(res, "Failed to fetch commission settings") as Promise<{
        settings: CommissionSettingsClient;
        pendingPenalties: number;
      }>;
    },
    enabled: !!companyId,
  });
}

export function useUpdateCommissionSettings(companyId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<{
      defaultBasis: CommissionBasisName;
      defaultRatePercent: number;
      defaultFixedAmount: number;
      responseWindowHours: number;
      penaltyPerLateTask: number;
      penaltyCapPercent: number;
      workingDays: number[];
      workdayStart: string;
      workdayEnd: string;
      utcOffsetMinutes: number;
    }>) => {
      const res = await apiFetch(`${crmBase(companyId)}/commission-settings`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
      return readJson(res, "Failed to update commission settings");
    },
    onSuccess: () => invalidateCommissions(queryClient, companyId),
  });
}

// ── rules (per-salesperson overrides) ────────────────────────────────────────

export function useCommissionRules(companyId: number) {
  return useQuery({
    queryKey: queryKeys.crm.commissions.rules(companyId),
    queryFn: async () => {
      if (!companyId) return [] as CommissionRule[];
      const res = await apiFetch(`${crmBase(companyId)}/commission-rules`);
      return readJson(res, "Failed to fetch commission rules") as Promise<CommissionRule[]>;
    },
    enabled: !!companyId,
  });
}

export type CommissionRuleDraft = {
  salespersonId: string;
  basis: CommissionBasisName;
  ratePercent: number;
  fixedAmount: number;
  isActive?: boolean;
  notes?: string | null;
};

export function useSaveCommissionRule(companyId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CommissionRuleDraft) => {
      const res = await apiFetch(`${crmBase(companyId)}/commission-rules`, {
        method: "POST",
        body: JSON.stringify(data),
      });
      return readJson(res, "Failed to save commission rule") as Promise<CommissionRule>;
    },
    onSuccess: () => invalidateCommissions(queryClient, companyId),
  });
}

export function useUpdateCommissionRule(companyId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: number } & Partial<CommissionRuleDraft>) => {
      const res = await apiFetch(`${crmBase(companyId)}/commission-rules/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
      return readJson(res, "Failed to update commission rule") as Promise<CommissionRule>;
    },
    onSuccess: () => invalidateCommissions(queryClient, companyId),
  });
}

export function useDeleteCommissionRule(companyId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await apiFetch(`${crmBase(companyId)}/commission-rules/${id}`, { method: "DELETE" });
      return readJson(res, "Failed to delete commission rule");
    },
    onSuccess: () => invalidateCommissions(queryClient, companyId),
  });
}

// ── commissions ──────────────────────────────────────────────────────────────

export type CommissionFilters = {
  status?: string;
  periodMonth?: string;
  salespersonId?: string;
};

export function useCommissions(companyId: number, filters: CommissionFilters = {}) {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.periodMonth) params.set("periodMonth", filters.periodMonth);
  if (filters.salespersonId) params.set("salespersonId", filters.salespersonId);
  const qs = params.toString();

  return useQuery({
    queryKey: queryKeys.crm.commissions.list(companyId, filters),
    queryFn: async () => {
      if (!companyId) return null;
      const res = await apiFetch(`${crmBase(companyId)}/commissions${qs ? `?${qs}` : ""}`);
      return readJson(res, "Failed to fetch commissions") as Promise<CommissionsResponse>;
    },
    enabled: !!companyId,
  });
}

export function useCreateCommission(companyId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      salespersonId?: string;
      enquiryId?: number | null;
      vehicleId?: number | null;
      reference?: string | null;
      saleAmount: number;
      costAmount?: number;
      basis?: CommissionBasisName;
      ratePercent?: number;
      fixedAmount?: number;
      periodMonth?: string;
      notes?: string | null;
    }) => {
      const res = await apiFetch(`${crmBase(companyId)}/commissions`, {
        method: "POST",
        body: JSON.stringify(data),
      });
      return readJson(res, "Failed to create commission") as Promise<Commission>;
    },
    onSuccess: () => invalidateCommissions(queryClient, companyId),
  });
}

export function useGenerateCommissions(companyId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiFetch(`${crmBase(companyId)}/commissions/generate`, { method: "POST" });
      return readJson(res, "Failed to generate commissions");
    },
    onSuccess: () => invalidateCommissions(queryClient, companyId),
  });
}

export function useSubmitCommission(companyId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await apiFetch(`${crmBase(companyId)}/commissions/${id}/submit`, { method: "POST" });
      return readJson(res, "Failed to submit commission") as Promise<Commission>;
    },
    onSuccess: () => invalidateCommissions(queryClient, companyId),
  });
}

export function useApproveCommission(companyId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reviewNotes }: { id: number; reviewNotes?: string }) => {
      const res = await apiFetch(`${crmBase(companyId)}/commissions/${id}/approve`, {
        method: "POST",
        body: JSON.stringify({ reviewNotes }),
      });
      return readJson(res, "Failed to approve commission") as Promise<Commission>;
    },
    onSuccess: () => invalidateCommissions(queryClient, companyId),
  });
}

export function useRejectCommission(companyId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reviewNotes }: { id: number; reviewNotes?: string }) => {
      const res = await apiFetch(`${crmBase(companyId)}/commissions/${id}/reject`, {
        method: "POST",
        body: JSON.stringify({ reviewNotes }),
      });
      return readJson(res, "Failed to reject commission") as Promise<Commission>;
    },
    onSuccess: () => invalidateCommissions(queryClient, companyId),
  });
}

export function usePayCommission(companyId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await apiFetch(`${crmBase(companyId)}/commissions/${id}/pay`, { method: "POST" });
      return readJson(res, "Failed to mark commission paid") as Promise<Commission>;
    },
    onSuccess: () => invalidateCommissions(queryClient, companyId),
  });
}

// ── team tasks & response penalties ──────────────────────────────────────────

export type CrmTaskFilters = { scope?: "mine" | "all"; status?: string };

export function useCrmTasks(companyId: number, filters: CrmTaskFilters = {}) {
  const params = new URLSearchParams();
  if (filters.scope) params.set("scope", filters.scope);
  if (filters.status) params.set("status", filters.status);
  const qs = params.toString();

  return useQuery({
    queryKey: queryKeys.crm.tasks.list(companyId, filters),
    queryFn: async () => {
      if (!companyId) return null;
      const res = await apiFetch(`${crmBase(companyId)}/tasks${qs ? `?${qs}` : ""}`);
      return readJson(res, "Failed to fetch tasks") as Promise<CrmTasksResponse>;
    },
    enabled: !!companyId,
  });
}

export type CrmTaskDraft = {
  assignedTo: string;
  title: string;
  body?: string | null;
  priority?: "low" | "normal" | "high" | "urgent";
  enquiryId?: number | null;
};

export function useCreateCrmTask(companyId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CrmTaskDraft) => {
      const res = await apiFetch(`${crmBase(companyId)}/tasks`, {
        method: "POST",
        body: JSON.stringify(data),
      });
      return readJson(res, "Failed to assign task");
    },
    onSuccess: () => invalidateCommissions(queryClient, companyId),
  });
}

export function useUpdateCrmTask(companyId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: number } & Partial<{
      assignedTo: string;
      title: string;
      body: string | null;
      priority: "low" | "normal" | "high" | "urgent";
      status: "pending" | "responded" | "completed" | "cancelled";
    }>) => {
      const res = await apiFetch(`${crmBase(companyId)}/tasks/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
      return readJson(res, "Failed to update task");
    },
    onSuccess: () => invalidateCommissions(queryClient, companyId),
  });
}

export function useRespondCrmTask(companyId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, responseNote }: { id: number; responseNote?: string | null }) => {
      const res = await apiFetch(`${crmBase(companyId)}/tasks/${id}/respond`, {
        method: "POST",
        body: JSON.stringify({ responseNote: responseNote ?? null }),
      });
      return readJson(res, "Failed to respond to task");
    },
    onSuccess: () => invalidateCommissions(queryClient, companyId),
  });
}

export function useSweepTasks(companyId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiFetch(`${crmBase(companyId)}/tasks/sweep`, { method: "POST" });
      return readJson(res, "Failed to run the penalty sweep") as Promise<{ applied: number }>;
    },
    onSuccess: () => invalidateCommissions(queryClient, companyId),
  });
}

export function useTaskPenalties(companyId: number) {
  return useQuery({
    queryKey: queryKeys.crm.commissions.taskPenalties(companyId),
    queryFn: async () => {
      if (!companyId) return [] as CommissionPenalty[];
      const res = await apiFetch(`${crmBase(companyId)}/task-penalties`);
      return readJson(res, "Failed to fetch penalties") as Promise<CommissionPenalty[]>;
    },
    enabled: !!companyId,
  });
}
