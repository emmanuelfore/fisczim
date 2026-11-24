import { Layout } from "@/components/layout";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCostCenters } from "@/hooks/use-cost-centers";
import { useDepartments } from "@/hooks/use-departments";
import { useProducts } from "@/hooks/use-products";
import { useSuppliers } from "@/hooks/use-suppliers";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  CheckCircle2,
  ClipboardList,
  Clock,
  FileText,
  Loader2,
  Plus,
  Search,
  Send,
  ShoppingCart,
  Trash2,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";

// ─────────────────────────────────────────────
// Types (mirrors the /procurement API responses)
// ─────────────────────────────────────────────
type RequisitionItem = {
  id: number;
  requisitionId: number;
  productId: number | null;
  description: string;
  quantity: string;
  unitCost: string;
  notes?: string | null;
};

type Requisition = {
  id: number;
  requisitionNumber: string;
  departmentId: number | null;
  costCenterId: number | null;
  locationId?: number | null;
  status: string;
  currency: string;
  estimatedTotal: string;
  neededBy?: string | null;
  notes?: string | null;
  selectedQuoteId?: number | null;
  purchaseOrderId?: number | null;
  createdAt?: string | null;
  items?: RequisitionItem[];
};

type QuoteItem = {
  id?: number;
  quoteId?: number;
  requisitionItemId: number;
  productId?: number | null;
  description: string;
  quantity: string;
  unitCost: string;
  leadTimeDays?: number | null;
};

type SupplierQuote = {
  id: number;
  requisitionId: number;
  supplierId: number;
  quoteNumber: string;
  currency: string;
  status: string;
  total: string;
  receivedDate?: string | null;
  notes?: string | null;
  items?: QuoteItem[];
};

type RequisitionLine = {
  key: number;
  productId: string;
  description: string;
  quantity: string;
  unitCost: string;
  notes: string;
};

type RequisitionForm = {
  departmentId: string;
  costCenterId: string;
  currency: string;
  neededBy: string;
  notes: string;
  items: RequisitionLine[];
};

type QuoteLine = {
  key: number;
  requisitionItemId: string;
  productId: string;
  description: string;
  quantity: string;
  unitCost: string;
  leadTimeDays: string;
};

type QuoteForm = {
  supplierId: string;
  quoteNumber: string;
  currency: string;
  receivedDate: string;
  notes: string;
  items: QuoteLine[];
};

const requisitionsKey = (companyId: number) =>
  ["procurement-requisitions", companyId] as const;
const quotesKey = (companyId: number, requisitionId: number) =>
  ["procurement-quotes", companyId, requisitionId] as const;

let lineKey = 0;
const freshKey = () => ++lineKey;

const newRequisitionLine = (): RequisitionLine => ({
  key: freshKey(),
  productId: "",
  description: "",
  quantity: "",
  unitCost: "",
  notes: "",
});

const emptyRequisitionForm = (): RequisitionForm => ({
  departmentId: "",
  costCenterId: "",
  currency: "USD",
  neededBy: "",
  notes: "",
  items: [newRequisitionLine()],
});

// ─────────────────────────────────────────────
// Status meta
// ─────────────────────────────────────────────
const STATUS_META: Record<
  string,
  { label: string; icon: LucideIcon; badge: string }
> = {
  DRAFT: {
    label: "Draft",
    icon: FileText,
    badge: "border-slate-200 bg-slate-50 text-slate-600",
  },
  PENDING_APPROVAL: {
    label: "Pending approval",
    icon: Clock,
    badge: "border-amber-200 bg-amber-50 text-amber-700",
  },
  REJECTED: {
    label: "Rejected",
    icon: XCircle,
    badge: "border-red-200 bg-red-50 text-red-600",
  },
  APPROVED: {
    label: "Approved",
    icon: CheckCircle2,
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  QUOTE_SELECTED: {
    label: "Quote selected",
    icon: CheckCircle2,
    badge: "border-indigo-200 bg-indigo-50 text-indigo-700",
  },
  PO_PENDING_APPROVAL: {
    label: "PO pending approval",
    icon: Clock,
    badge: "border-amber-200 bg-amber-50 text-amber-700",
  },
  CONVERTED: {
    label: "Converted to PO",
    icon: ShoppingCart,
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
};

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? {
    label: status,
    icon: FileText,
    badge: "border-slate-200 bg-slate-50 text-slate-600",
  };
  const Icon = meta.icon;
  return (
    <Badge
      variant="outline"
      className={cn("gap-1 font-semibold text-xs", meta.badge)}
    >
      <Icon className="h-3 w-3" />
      {meta.label}
    </Badge>
  );
}

function money(value: string | number | null | undefined) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(parsed.getTime()) ? value : format(parsed, "dd MMM yyyy");
}

async function responseBody(res: Response): Promise<any> {
  return res.json().catch(() => ({}));
}

async function failureMessage(res: Response, fallback: string) {
  const body = await responseBody(res);
  return String(body?.message || body?.error || fallback);
}

function asError(err: unknown) {
  return err instanceof Error ? err.message : "Something went wrong";
}

// ─────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────
export default function ProcurementRequisitionsPage() {
  const { activeCompanyId } = useActiveCompany();
  const companyId = activeCompanyId ?? 0;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: departments = [] } = useDepartments(companyId);
  const { data: costCenters = [] } = useCostCenters(companyId);
  const { data: suppliers = [] } = useSuppliers(companyId);
  const { data: products = [] } = useProducts(companyId);

  const fetchRequisition = async (id: number): Promise<Requisition> => {
    const res = await apiFetch(
      `/api/companies/${companyId}/procurement/requisitions/${id}`,
    );
    if (!res.ok)
      throw new Error(await failureMessage(res, "Failed to load requisition"));
    return res.json();
  };

  const fetchQuotes = async (id: number): Promise<SupplierQuote[]> => {
    const res = await apiFetch(
      `/api/companies/${companyId}/procurement/requisitions/${id}/quotes`,
    );
    if (!res.ok)
      throw new Error(await failureMessage(res, "Failed to load supplier quotes"));
    return res.json();
  };

  const requisitionsQuery = useQuery<Requisition[]>({
    queryKey: requisitionsKey(companyId),
    enabled: !!companyId,
    queryFn: async () => {
      const res = await apiFetch(
        `/api/companies/${companyId}/procurement/requisitions`,
      );
      if (!res.ok)
        throw new Error(await failureMessage(res, "Failed to load requisitions"));
      return res.json();
    },
  });

  const requisitions = requisitionsQuery.data ?? [];

  // Quote counts drive the "Select Quote" action. Only approved requisitions
  // (and ones with a selected quote) can have quotes, so only query those.
  const quoteTargets = useMemo(
    () =>
      requisitions.filter(
        (r) => r.status === "APPROVED" || r.status === "QUOTE_SELECTED",
      ),
    [requisitions],
  );

  const quotesQueries = useQueries({
    queries: quoteTargets.map((r) => ({
      queryKey: quotesKey(companyId, r.id),
      enabled: !!companyId,
      queryFn: () => fetchQuotes(r.id),
    })),
  });

  const quotesByRequisition = useMemo(() => {
    const map = new Map<number, SupplierQuote[]>();
    quoteTargets.forEach((r, i) => map.set(r.id, quotesQueries[i]?.data ?? []));
    return map;
  }, [quoteTargets, quotesQueries]);

  const [quotesTarget, setQuotesTarget] = useState<Requisition | null>(null);
  const targetQuotesQuery = useQuery<SupplierQuote[]>({
    queryKey: quotesKey(companyId, quotesTarget?.id ?? 0),
    enabled: !!companyId && !!quotesTarget,
    queryFn: () => fetchQuotes(quotesTarget!.id),
  });

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [busyId, setBusyId] = useState<number | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createForm, setCreateForm] = useState<RequisitionForm>(emptyRequisitionForm);

  const [quoteTarget, setQuoteTarget] = useState<Requisition | null>(null);
  const [quoteForm, setQuoteForm] = useState<QuoteForm | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteBusy, setQuoteBusy] = useState(false);

  const departmentName = (id?: number | null) =>
    departments.find((d) => d.id === id)?.name ?? "—";
  const costCenterName = (id?: number | null) => {
    const center = costCenters.find((c) => c.id === id);
    return center ? center.name || center.code || `#${center.id}` : "—";
  };
  const supplierName = (id: number) =>
    suppliers.find((s) => s.id === id)?.name ?? `#${id}`;
  const quoteIndexOfTarget = quotesTarget
    ? quoteTargets.findIndex((r) => r.id === quotesTarget.id)
    : -1;
  const quotesForTarget = quotesTarget
    ? targetQuotesQuery.data ?? quotesByRequisition.get(quotesTarget.id) ?? []
    : [];

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: requisitionsKey(companyId) });
    quoteTargets.forEach((r) =>
      void queryClient.invalidateQueries({
        queryKey: quotesKey(companyId, r.id),
      }),
    );
  };

  const filtered = useMemo(() => {
    let result = requisitions;
    if (statusFilter !== "all")
      result = result.filter((r) => r.status === statusFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (r) =>
          r.requisitionNumber.toLowerCase().includes(q) ||
          (r.notes || "").toLowerCase().includes(q) ||
          departmentName(r.departmentId).toLowerCase().includes(q) ||
          costCenterName(r.costCenterId).toLowerCase().includes(q),
      );
    }
    return result;
  }, [requisitions, search, statusFilter, departments, costCenters]);

  // ── Actions ──────────────────────────────────────────────────────────────
  const handleSubmit = async (req: Requisition) => {
    setBusyId(req.id);
    try {
      const res = await apiFetch(
        `/api/companies/${companyId}/procurement/requisitions/${req.id}/submit`,
        { method: "POST", body: JSON.stringify({}) },
      );
      const data = await responseBody(res);
      if (!res.ok)
        throw new Error(data?.message || "Could not submit requisition");
      if (res.status === 202 || data?.approval) {
        toast({
          title: "Submitted for approval",
          description:
            data?.message ||
            `${req.requisitionNumber} was submitted for approval. Supplier quotes can be captured once it is approved.`,
        });
      } else {
        toast({
          title: "Requisition submitted",
          description: `${req.requisitionNumber} is approved for supplier quotes.`,
        });
      }
      refresh();
    } catch (err) {
      toast({
        title: "Submission failed",
        description: asError(err),
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleSelectQuote = async (
    req: Requisition,
    quote: SupplierQuote,
  ) => {
    setBusyId(req.id);
    try {
      const res = await apiFetch(
        `/api/companies/${companyId}/procurement/quotes/${quote.id}/select`,
        { method: "POST", body: JSON.stringify({}) },
      );
      const data = await responseBody(res);
      if (!res.ok) throw new Error(data?.message || "Could not select quote");
      toast({
        title: "Quote selected",
        description: `${quote.quoteNumber} from ${supplierName(quote.supplierId)} is selected for ${req.requisitionNumber}.`,
      });
      refresh();
      void queryClient.invalidateQueries({
        queryKey: quotesKey(companyId, req.id),
      });
    } catch (err) {
      toast({
        title: "Selection failed",
        description: asError(err),
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleCreatePo = async (req: Requisition) => {
    setBusyId(req.id);
    try {
      const res = await apiFetch(
        `/api/companies/${companyId}/procurement/requisitions/${req.id}/create-po`,
        { method: "POST", body: JSON.stringify({}) },
      );
      const data = await responseBody(res);
      if (!res.ok) throw new Error(data?.message || "Could not create purchase order");
      if (res.status === 202 || data?.approval) {
        toast({
          title: "PO submitted for approval",
          description:
            data?.message ||
            `${req.requisitionNumber} was submitted for purchase order approval. No purchase order has been created yet.`,
        });
      } else {
        toast({
          title: "Purchase order created",
          description: `${data?.poNumber || "Purchase order"} was created from the selected quote for ${req.requisitionNumber}.`,
        });
      }
      refresh();
    } catch (err) {
      toast({
        title: "Could not create purchase order",
        description: asError(err),
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  };

  const openCreateDialog = () => {
    setCreateForm(emptyRequisitionForm());
    setCreateOpen(true);
  };

  const openQuoteDialog = async (req: Requisition) => {
    setQuoteTarget(req);
    setQuoteForm(null);
    setQuoteLoading(true);
    try {
      const detail = await fetchRequisition(req.id);
      setQuoteForm({
        supplierId: "",
        quoteNumber: "",
        currency: detail.currency || "USD",
        receivedDate: "",
        notes: "",
        items: (detail.items || []).map((item) => ({
          key: freshKey(),
          requisitionItemId: String(item.id),
          productId: item.productId ? String(item.productId) : "",
          description: item.description,
          quantity: String(item.quantity),
          unitCost: String(item.unitCost ?? ""),
          leadTimeDays: "",
        })),
      });
    } catch (err) {
      toast({
        title: "Could not load requisition items",
        description: asError(err),
        variant: "destructive",
      });
      setQuoteTarget(null);
    } finally {
      setQuoteLoading(false);
    }
  };

  const updateLine = (
    key: number,
    patch: Partial<RequisitionLine>,
  ) => {
    setCreateForm((form) => ({
      ...form,
      items: form.items.map((line) =>
        line.key === key ? { ...line, ...patch } : line,
      ),
    }));
  };

  const submitRequisition = async () => {
    if (!createForm.departmentId || !createForm.costCenterId) {
      toast({
        title: "Missing details",
        description: "Department and cost centre are required.",
        variant: "destructive",
      });
      return;
    }
    if (!createForm.items.length) {
      toast({
        title: "Missing items",
        description: "Add at least one requisition item.",
        variant: "destructive",
      });
      return;
    }
    if (createForm.currency.trim().length < 3) {
      toast({
        title: "Invalid currency",
        description: "Enter a currency code of at least 3 characters.",
        variant: "destructive",
      });
      return;
    }

    const items: {
      productId: number | null;
      description: string;
      quantity: number;
      unitCost: number;
      notes: string | null;
    }[] = [];
    for (const [index, line] of createForm.items.entries()) {
      if (!line.description.trim()) {
        toast({
          title: "Missing description",
          description: `Item ${index + 1} needs a description.`,
          variant: "destructive",
        });
        return;
      }
      const quantity = Number(line.quantity);
      const unitCost = Number(line.unitCost);
      if (
        line.quantity === "" ||
        !Number.isFinite(quantity) ||
        quantity <= 0
      ) {
        toast({
          title: "Invalid quantity",
          description: `Item ${index + 1} needs a quantity greater than zero.`,
          variant: "destructive",
        });
        return;
      }
      if (line.unitCost === "" || !Number.isFinite(unitCost) || unitCost < 0) {
        toast({
          title: "Invalid unit cost",
          description: `Item ${index + 1} needs a unit cost of zero or more.`,
          variant: "destructive",
        });
        return;
      }
      items.push({
        productId: line.productId ? Number(line.productId) : null,
        description: line.description.trim(),
        quantity,
        unitCost,
        notes: line.notes.trim() || null,
      });
    }

    setCreateBusy(true);
    try {
      const res = await apiFetch(
        `/api/companies/${companyId}/procurement/requisitions`,
        {
          method: "POST",
          body: JSON.stringify({
            departmentId: Number(createForm.departmentId),
            costCenterId: Number(createForm.costCenterId),
            locationId: null,
            neededBy: createForm.neededBy || null,
            currency: createForm.currency.trim().toUpperCase(),
            notes: createForm.notes.trim() || null,
            items,
          }),
        },
      );
      const data = await responseBody(res);
      if (!res.ok)
        throw new Error(data?.message || "Could not create requisition");
      toast({
        title: "Requisition created",
        description: `${data?.requisitionNumber || "Requisition"} saved as a draft. Submit it to request approval.`,
      });
      setCreateOpen(false);
      setCreateForm(emptyRequisitionForm());
      refresh();
    } catch (err) {
      toast({
        title: "Could not create requisition",
        description: asError(err),
        variant: "destructive",
      });
    } finally {
      setCreateBusy(false);
    }
  };

  const updateQuoteLine = (key: number, patch: Partial<QuoteLine>) => {
    setQuoteForm((form) =>
      form
        ? {
            ...form,
            items: form.items.map((line) =>
              line.key === key ? { ...line, ...patch } : line,
            ),
          }
        : form,
    );
  };

  const submitQuote = async () => {
    if (!quoteTarget || !quoteForm) return;
    if (!quoteForm.supplierId || !quoteForm.quoteNumber.trim()) {
      toast({
        title: "Missing quote details",
        description: "Supplier and quote number are required.",
        variant: "destructive",
      });
      return;
    }
    if (quoteForm.currency.trim().length < 3) {
      toast({
        title: "Invalid currency",
        description: "Enter a currency code of at least 3 characters.",
        variant: "destructive",
      });
      return;
    }
    if (!quoteForm.items.length) {
      toast({
        title: "Missing quote lines",
        description: "The requisition has no items to quote.",
        variant: "destructive",
      });
      return;
    }

    const items: {
      requisitionItemId: number;
      productId: number | null;
      description: string;
      quantity: number;
      unitCost: number;
      leadTimeDays: number | null;
    }[] = [];
    for (const [index, line] of quoteForm.items.entries()) {
      if (line.unitCost === "" || Number(line.unitCost) < 0 || !Number.isFinite(Number(line.unitCost))) {
        toast({
          title: "Invalid unit cost",
          description: `Quote line ${index + 1} needs a unit cost of zero or more.`,
          variant: "destructive",
        });
        return;
      }
      if (
        line.leadTimeDays !== "" &&
        (!Number.isInteger(Number(line.leadTimeDays)) ||
          Number(line.leadTimeDays) < 0)
      ) {
        toast({
          title: "Invalid lead time",
          description: `Quote line ${index + 1} lead time must be a whole number of days.`,
          variant: "destructive",
        });
        return;
      }
      items.push({
        requisitionItemId: Number(line.requisitionItemId),
        productId: line.productId ? Number(line.productId) : null,
        description: line.description,
        quantity: Number(line.quantity),
        unitCost: Number(line.unitCost),
        leadTimeDays: line.leadTimeDays === "" ? null : Number(line.leadTimeDays),
      });
    }

    setQuoteBusy(true);
    try {
      const res = await apiFetch(
        `/api/companies/${companyId}/procurement/requisitions/${quoteTarget.id}/quotes`,
        {
          method: "POST",
          body: JSON.stringify({
            supplierId: Number(quoteForm.supplierId),
            quoteNumber: quoteForm.quoteNumber.trim(),
            currency: quoteForm.currency.trim().toUpperCase(),
            receivedDate: quoteForm.receivedDate || null,
            notes: quoteForm.notes.trim() || null,
            items,
          }),
        },
      );
      const data = await responseBody(res);
      if (!res.ok) throw new Error(data?.message || "Could not capture quote");
      toast({
        title: "Supplier quote captured",
        description: `${data?.quoteNumber || quoteForm.quoteNumber} was added to ${quoteTarget.requisitionNumber}.`,
      });
      setQuoteTarget(null);
      setQuoteForm(null);
      void queryClient.invalidateQueries({
        queryKey: quotesKey(companyId, quoteTarget.id),
      });
      refresh();
    } catch (err) {
      toast({
        title: "Could not capture quote",
        description: asError(err),
        variant: "destructive",
      });
    } finally {
      setQuoteBusy(false);
    }
  };

  const eligibleForQuotes = (r: Requisition) =>
    r.status === "APPROVED" || r.status === "QUOTE_SELECTED";

  // ── Row actions ──────────────────────────────────────────────────────────
  function renderActions(req: Requisition, compact: boolean) {
    const busy = busyId === req.id;
    const relatedQuotes = quotesByRequisition.get(req.id) ?? [];
    const targetIndex = quoteTargets.findIndex((r) => r.id === req.id);
    const quotesLoading = targetIndex >= 0 && quotesQueries[targetIndex]?.isLoading;
    const quotesFailed = targetIndex >= 0 && quotesQueries[targetIndex]?.isError;
    const buttonClass = compact
      ? "h-8 rounded-lg text-xs"
      : "h-8 rounded-lg text-xs gap-1";

    return (
      <>
        {(req.status === "DRAFT" || req.status === "REJECTED") && (
          <Button
            size="sm"
            className={cn(buttonClass, "bg-blue-600 hover:bg-blue-700")}
            onClick={() => void handleSubmit(req)}
            disabled={busy}
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            Submit
          </Button>
        )}
        {eligibleForQuotes(req) && (
          <Button
            size="sm"
            variant="outline"
            className={buttonClass}
            onClick={() => void openQuoteDialog(req)}
          >
            <FileText className="h-3.5 w-3.5" />
            Capture Quote
          </Button>
        )}
        {eligibleForQuotes(req) && quotesLoading ? (
          <Button size="sm" variant="outline" className={buttonClass} disabled>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Quotes…
          </Button>
        ) : eligibleForQuotes(req) && (relatedQuotes.length > 0 || quotesFailed) ? (
          <Button
            size="sm"
            variant="outline"
            className={buttonClass}
            onClick={() => setQuotesTarget(req)}
          >
            <FileText className="h-3.5 w-3.5" />
            {quotesFailed && relatedQuotes.length === 0
              ? "Select Quote"
              : `Select Quote (${relatedQuotes.length})`}
          </Button>
        ) : null}
        {req.status === "QUOTE_SELECTED" && (
          <Button
            size="sm"
            className={cn(buttonClass, "bg-emerald-600 hover:bg-emerald-700")}
            onClick={() => void handleCreatePo(req)}
            disabled={busy}
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ShoppingCart className="h-3.5 w-3.5" />
            )}
            Create PO
          </Button>
        )}
      </>
    );
  }

  // ── No company guard ─────────────────────────────────────────────────────
  if (!companyId) {
    return (
      <Layout>
        <Card className="max-w-2xl mx-auto mt-8 border-slate-200">
          <CardContent className="py-12 text-center">
            <ClipboardList className="mx-auto mb-4 h-10 w-10 text-slate-300" />
            <h3 className="text-lg font-bold text-slate-700">No active company</h3>
            <p className="mt-2 text-sm text-slate-500">
              Select a company to manage purchase requisitions.
            </p>
          </CardContent>
        </Card>
      </Layout>
    );
  }

  return (
    <Layout>
      <PageHeader
        title="Purchase Requisitions"
        subtitle="Raise departmental requests, compare supplier quotes and convert the selected quote into a purchase order."
        actions={
          <Button
            onClick={openCreateDialog}
            className="rounded-xl font-bold gap-2 bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            New Requisition
          </Button>
        }
      />

      {requisitionsQuery.isError ? (
        <Card className="mb-4 border-rose-200 bg-rose-50/40">
          <CardContent className="flex items-center justify-between gap-3 py-4">
            <p className="text-sm text-rose-700">
              Could not load requisitions: {asError(requisitionsQuery.error)}
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void requisitionsQuery.refetch()}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {/* Search + Status Tabs */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search requisition, department..."
            className="pl-9 rounded-xl border-slate-200 bg-white shadow-sm"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setStatusFilter("all")}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-all",
              statusFilter === "all"
                ? "border-blue-500 bg-blue-500 text-white shadow-sm"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
            )}
          >
            All
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[10px] font-black",
                statusFilter === "all"
                  ? "bg-white/25 text-white"
                  : "bg-slate-100 text-slate-500",
              )}
            >
              {requisitions.length}
            </span>
          </button>
          {Object.entries(STATUS_META).map(([status, meta]) => {
            const Icon = meta.icon;
            const isActive = statusFilter === status;
            const count = requisitions.filter((r) => r.status === status).length;
            return (
              <button
                key={status}
                onClick={() =>
                  setStatusFilter(isActive ? "all" : status)
                }
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-all",
                  isActive
                    ? meta.badge
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {meta.label}
                <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-black text-slate-500">
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <Card className="overflow-hidden rounded-[18px] border-slate-200 shadow-sm">
        <CardContent className="p-0 overflow-x-auto">
          {/* Mobile cards */}
          <div className="grid grid-cols-1 gap-4 p-4 md:hidden bg-slate-50/50">
            {requisitionsQuery.isLoading ? (
              <div className="p-12 text-center text-slate-400">
                <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin" />
                Loading requisitions…
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <ClipboardList className="mx-auto mb-2 h-8 w-8 text-slate-200" />
                <p className="font-bold text-slate-500">No requisitions found</p>
                <p className="text-sm">Create a requisition to start the procurement flow.</p>
              </div>
            ) : (
              filtered.map((req) => (
                <div
                  key={req.id}
                  className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-mono text-sm font-bold text-slate-900">
                        {req.requisitionNumber}
                      </span>
                      <p className="text-[11px] text-slate-400">
                        {formatDate(req.createdAt)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="mb-1.5 font-bold text-slate-900">
                        {req.currency} {money(req.estimatedTotal)}
                      </p>
                      <StatusBadge status={req.status} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 text-sm">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                        Department
                      </p>
                      <p className="font-semibold text-slate-700">
                        {departmentName(req.departmentId)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                        Cost centre
                      </p>
                      <p className="font-semibold text-slate-700">
                        {costCenterName(req.costCenterId)}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap justify-end gap-1.5 border-t border-slate-100 pt-3">
                    {renderActions(req, true)}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block w-full overflow-x-auto min-w-0">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <th className="p-4">Requisition</th>
                  <th className="p-4">Department / Cost centre</th>
                  <th className="p-4">Needed by</th>
                  <th className="p-4">Estimated total</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {requisitionsQuery.isLoading ? (
                  <tr>
                    <td colSpan={5} className="p-12 text-center text-slate-400">
                      <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin" />
                      Loading requisitions…
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-12 text-center text-slate-400">
                      <ClipboardList className="mx-auto mb-2 h-8 w-8 text-slate-200" />
                      <p className="font-bold text-slate-500">No requisitions found</p>
                      <p className="text-sm">Create a requisition to start the procurement flow.</p>
                    </td>
                  </tr>
                ) : (
                  filtered.map((req) => (
                    <tr
                      key={req.id}
                      className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors"
                    >
                      <td className="p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-bold text-slate-900">
                            {req.requisitionNumber}
                          </span>
                          <StatusBadge status={req.status} />
                        </div>
                        <p className="mt-0.5 text-[11px] text-slate-400">
                          {formatDate(req.createdAt)}
                        </p>
                        {req.notes ? (
                          <p className="max-w-[240px] truncate text-[11px] text-slate-400">
                            {req.notes}
                          </p>
                        ) : null}
                      </td>
                      <td className="p-4 font-semibold text-slate-700">
                        <div>{departmentName(req.departmentId)}</div>
                        <div className="mt-0.5 text-[11px] font-normal text-slate-400">
                          {costCenterName(req.costCenterId)}
                        </div>
                      </td>
                      <td className="p-4 text-sm font-medium text-slate-600">
                        {formatDate(req.neededBy)}
                      </td>
                      <td className="p-4 font-bold text-slate-900">
                        {req.currency} {money(req.estimatedTotal)}
                      </td>
                      <td className="p-4">
                        <div className="flex justify-end gap-1.5">
                          {renderActions(req, false)}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Create requisition dialog */}
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          if (!open) {
            setCreateOpen(false);
            setCreateForm(emptyRequisitionForm());
          }
        }}
      >
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-blue-600" />
              New Purchase Requisition
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Department *</Label>
              <Select
                value={createForm.departmentId}
                onValueChange={(value) =>
                  setCreateForm((form) => ({
                    ...form,
                    departmentId: String(value),
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((dept) => (
                    <SelectItem key={dept.id} value={String(dept.id)}>
                      {dept.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Cost centre *</Label>
              <Select
                value={createForm.costCenterId}
                onValueChange={(value) =>
                  setCreateForm((form) => ({
                    ...form,
                    costCenterId: String(value),
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select cost centre" />
                </SelectTrigger>
                <SelectContent>
                  {costCenters.map((center) => (
                    <SelectItem key={center.id} value={String(center.id)}>
                      {center.name || center.code || `#${center.id}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Currency *</Label>
              <Input
                value={createForm.currency}
                onChange={(e) =>
                  setCreateForm((form) => ({
                    ...form,
                    currency: e.target.value,
                  }))
                }
                placeholder="USD"
                maxLength={10}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Needed by (optional)</Label>
              <Input
                type="date"
                value={createForm.neededBy}
                onChange={(e) =>
                  setCreateForm((form) => ({
                    ...form,
                    neededBy: e.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Notes (optional)</Label>
              <Textarea
                value={createForm.notes}
                onChange={(e) =>
                  setCreateForm((form) => ({ ...form, notes: e.target.value }))
                }
                placeholder="Why is this requisition needed?"
                rows={2}
              />
            </div>
          </div>

          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                Requested items
              </p>
              <Button
                size="sm"
                variant="outline"
                className="h-7 rounded-lg text-xs"
                onClick={() =>
                  setCreateForm((form) => ({
                    ...form,
                    items: [...form.items, newRequisitionLine()],
                  }))
                }
              >
                <Plus className="mr-1 h-3 w-3" />
                Add item
              </Button>
            </div>
            <div className="space-y-3">
              {createForm.items.map((line, index) => (
                <div
                  key={line.key}
                  className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                      Item {index + 1}
                    </span>
                    {createForm.items.length > 1 ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-xs text-red-500"
                        onClick={() =>
                          setCreateForm((form) => ({
                            ...form,
                            items: form.items.filter((item) => item.key !== line.key),
                          }))
                        }
                      >
                        <Trash2 className="mr-1 h-3 w-3" />
                        Remove
                      </Button>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Product (optional)</Label>
                      <Select
                        value={line.productId || "none"}
                        onValueChange={(value) => {
                          const selected = products.find(
                            (p) => String(p.id) === value,
                          );
                          updateLine(line.key, {
                            productId: value === "none" ? "" : value,
                            description:
                              selected && !line.description
                                ? selected.name
                                : line.description,
                          });
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Free-text item" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Free-text item</SelectItem>
                          {products.map((product) => (
                            <SelectItem
                              key={product.id}
                              value={String(product.id)}
                            >
                              {product.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Description *</Label>
                      <Input
                        value={line.description}
                        onChange={(e) =>
                          updateLine(line.key, { description: e.target.value })
                        }
                        placeholder="e.g. Copper cable 10mm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Quantity *</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.001"
                        value={line.quantity}
                        onChange={(e) =>
                          updateLine(line.key, { quantity: e.target.value })
                        }
                        placeholder="0"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Unit cost *</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.unitCost}
                        onChange={(e) =>
                          updateLine(line.key, { unitCost: e.target.value })
                        }
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Line notes (optional)</Label>
                    <Input
                      value={line.notes}
                      onChange={(e) =>
                        updateLine(line.key, { notes: e.target.value })
                      }
                      placeholder="Optional specification or reference"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={submitRequisition}
              disabled={createBusy}
              className="gap-2 bg-blue-600 hover:bg-blue-700"
            >
              {createBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Create Requisition
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Capture quote dialog */}
      <Dialog
        open={!!quoteTarget}
        onOpenChange={(open) => {
          if (!open) {
            setQuoteTarget(null);
            setQuoteForm(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-blue-600" />
              Capture Supplier Quote — {quoteTarget?.requisitionNumber}
            </DialogTitle>
          </DialogHeader>

          {quoteLoading ? (
            <div className="py-12 text-center text-slate-400">
              <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin" />
              Loading requisition items…
            </div>
          ) : !quoteForm ? (
            <p className="py-8 text-center text-sm text-slate-500">
              Requisition items could not be loaded.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Supplier *</Label>
                  <Select
                    value={quoteForm.supplierId}
                    onValueChange={(value) =>
                      setQuoteForm((form) =>
                        form ? { ...form, supplierId: String(value) } : form,
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select supplier" />
                    </SelectTrigger>
                    <SelectContent>
                      {suppliers.map((supplier) => (
                        <SelectItem
                          key={supplier.id}
                          value={String(supplier.id)}
                        >
                          {supplier.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Quote number *</Label>
                  <Input
                    value={quoteForm.quoteNumber}
                    onChange={(e) =>
                      setQuoteForm((form) =>
                        form
                          ? { ...form, quoteNumber: e.target.value }
                          : form,
                      )
                    }
                    placeholder="e.g. SUP-QUOTE-102"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Currency *</Label>
                  <Input
                    value={quoteForm.currency}
                    onChange={(e) =>
                      setQuoteForm((form) =>
                        form ? { ...form, currency: e.target.value } : form,
                      )
                    }
                    maxLength={10}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Received date (optional)</Label>
                  <Input
                    type="date"
                    value={quoteForm.receivedDate}
                    onChange={(e) =>
                      setQuoteForm((form) =>
                        form
                          ? { ...form, receivedDate: e.target.value }
                          : form,
                      )
                    }
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Quote notes (optional)</Label>
                  <Textarea
                    value={quoteForm.notes}
                    onChange={(e) =>
                      setQuoteForm((form) =>
                        form ? { ...form, notes: e.target.value } : form,
                      )
                    }
                    rows={2}
                  />
                </div>
              </div>

              <div className="mt-5 overflow-hidden rounded-xl border border-slate-200">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-blue-600 text-white">
                      {[
                        "Req item",
                        "Description",
                        "Qty",
                        "Unit cost *",
                        "Lead time (days)",
                      ].map((heading) => (
                        <th
                          key={heading}
                          className="px-3 py-2 text-left font-black uppercase tracking-wide"
                        >
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {quoteForm.items.map((line, index) => (
                      <tr
                        key={line.key}
                        className={index % 2 === 1 ? "bg-slate-50" : "bg-white"}
                      >
                        <td className="px-3 py-2 font-mono text-slate-500">
                          #{line.requisitionItemId}
                        </td>
                        <td className="px-3 py-2 font-semibold text-slate-700">
                          {line.description}
                        </td>
                        <td className="px-3 py-2 font-mono text-slate-600">
                          {line.quantity}
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            className="h-8 w-28 rounded-lg"
                            value={line.unitCost}
                            onChange={(e) =>
                              updateQuoteLine(line.key, {
                                unitCost: e.target.value,
                              })
                            }
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            min="0"
                            step="1"
                            className="h-8 w-24 rounded-lg"
                            value={line.leadTimeDays}
                            onChange={(e) =>
                              updateQuoteLine(line.key, {
                                leadTimeDays: e.target.value,
                              })
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setQuoteTarget(null);
                    setQuoteForm(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={submitQuote}
                  disabled={quoteBusy}
                  className="gap-2 bg-blue-600 hover:bg-blue-700"
                >
                  {quoteBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileText className="h-4 w-4" />
                  )}
                  Capture Quote
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Quotes list / selection dialog */}
      <Dialog
        open={!!quotesTarget}
        onOpenChange={(open) => {
          if (!open) setQuotesTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-blue-600" />
              Supplier Quotes — {quotesTarget?.requisitionNumber}
            </DialogTitle>
          </DialogHeader>

          {(quoteIndexOfTarget >= 0 && quotesQueries[quoteIndexOfTarget]?.isLoading) ||
          targetQuotesQuery.isLoading ? (
            <div className="py-12 text-center text-slate-400">
              <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin" />
              Loading supplier quotes…
            </div>
          ) : targetQuotesQuery.isError ? (
            <div className="py-12 text-center text-slate-500">
              <p className="font-bold text-rose-600">Could not load quotes</p>
              <p className="mt-1 text-sm">
                {asError(targetQuotesQuery.error)}
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-3"
                onClick={() => void targetQuotesQuery.refetch()}
              >
                Retry
              </Button>
            </div>
          ) : quotesForTarget.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <FileText className="mx-auto mb-2 h-8 w-8 text-slate-200" />
              <p className="font-bold text-slate-500">No quotes captured yet</p>
              <p className="text-sm">Capture a supplier quote to compare options.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {quotesForTarget.map((quote) => (
                <div
                  key={quote.id}
                  className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-bold text-slate-900">
                        {quote.quoteNumber}
                      </span>
                      <Badge
                        variant="outline"
                        className={cn(
                          "font-semibold text-xs",
                          quote.status === "SELECTED"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : quote.status === "REJECTED"
                              ? "border-red-200 bg-red-50 text-red-600"
                              : "border-slate-200 bg-slate-50 text-slate-600",
                        )}
                      >
                        {quote.status}
                      </Badge>
                      {quotesTarget?.selectedQuoteId === quote.id ? (
                        <Badge
                          variant="outline"
                          className="border-indigo-200 bg-indigo-50 font-semibold text-xs text-indigo-700"
                        >
                          Selected for PO
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {supplierName(quote.supplierId)} · received{" "}
                      {formatDate(quote.receivedDate)} · {quote.items?.length ?? 0}{" "}
                      lines
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-slate-900">
                      {quote.currency} {money(quote.total)}
                    </span>
                    <Button
                      size="sm"
                      className="h-8 rounded-lg text-xs bg-blue-600 hover:bg-blue-700"
                      disabled={
                        quote.status === "SELECTED" ||
                        busyId === quotesTarget?.id ||
                        !quotesTarget ||
                        !eligibleForQuotes(quotesTarget)
                      }
                      onClick={() => {
                        if (quotesTarget) void handleSelectQuote(quotesTarget, quote);
                      }}
                    >
                      {busyId === quotesTarget?.id ? (
                        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                      ) : null}
                      Select
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setQuotesTarget(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
