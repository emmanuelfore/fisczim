import { Layout } from "@/components/layout";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useBranches } from "@/hooks/use-branches";
import { useToast } from "@/hooks/use-toast";
import { useBranchContext } from "@/lib/branch-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Building2,
  ChevronRight,
  Loader2,
  MapPin,
  Package,
  Pencil,
  Plus,
  ShoppingCart,
  Truck,
  Warehouse,
  LayoutGrid,
  CheckCircle2,
  XCircle,
  Star,
  AlertTriangle,
} from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
type InventoryLocation = {
  id: number;
  companyId: number;
  type: "WAREHOUSE" | "BRANCH" | "VAN" | "SHOP_FLOOR";
  name: string;
  code: string | null;
  address: string | null;
  branchId: number | null;
  isDefaultReceiving: boolean;
  isDefaultDispatch: boolean;
  isActive: boolean;
  createdAt: string;
  stockSummary?: {
    totalProducts: number;
    totalQuantity: number;
    totalValue: number;
  };
};

type Branch = {
  id: number;
  name: string;
  code: string | null;
  isActive: boolean;
};

type LocationFormData = {
  name: string;
  type: string;
  code: string;
  address: string;
  branchId: string;
  isDefaultReceiving: boolean;
  isDefaultDispatch: boolean;
  isActive: boolean;
};

const EMPTY_FORM: LocationFormData = {
  name: "",
  type: "WAREHOUSE",
  code: "",
  address: "",
  branchId: "",
  isDefaultReceiving: false,
  isDefaultDispatch: false,
  isActive: true,
};

// ─────────────────────────────────────────────
// Hooks
// ─────────────────────────────────────────────
function useInventoryLocations(companyId: number) {
  return useQuery<InventoryLocation[]>({
    queryKey: [`/api/companies/${companyId}/inventory/locations`],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/companies/${companyId}/inventory/locations`);
      return res.json();
    },
    enabled: companyId > 0,
  });
}

type LocationApiPayload = {
  name: string;
  type: string;
  code: string | null;
  address: string | null;
  branchId: number | null;
  isDefaultReceiving: boolean;
  isDefaultDispatch: boolean;
  isActive: boolean;
};

function useCreateLocation(companyId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: LocationApiPayload) => {
      const res = await apiRequest("POST", `/api/companies/${companyId}/inventory/locations`, data);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to create location");
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [`/api/companies/${companyId}/inventory/locations`] }),
  });
}

function useUpdateLocation(companyId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: number } & Partial<LocationApiPayload>) => {
      const res = await apiRequest("PATCH", `/api/companies/${companyId}/inventory/locations/${id}`, data);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to update location");
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [`/api/companies/${companyId}/inventory/locations`] }),
  });
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
const TYPE_META: Record<string, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  WAREHOUSE: { label: "Warehouse", icon: Warehouse, color: "text-blue-700", bg: "bg-blue-50 border-blue-200" },
  BRANCH: { label: "Branch", icon: Building2, color: "text-violet-700", bg: "bg-violet-50 border-violet-200" },
  SHOP_FLOOR: { label: "Shop Floor", icon: ShoppingCart, color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
  VAN: { label: "Van / Mobile", icon: Truck, color: "text-amber-700", bg: "bg-amber-50 border-amber-200" },
};

function TypeBadge({ type }: { type: string }) {
  const meta = TYPE_META[type] || { label: type, icon: Package, color: "text-slate-600", bg: "bg-slate-50 border-slate-200" };
  const Icon = meta.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold", meta.bg, meta.color)}>
      <Icon className="h-3 w-3" />
      {meta.label}
    </span>
  );
}

function LocationIcon({ type, className }: { type: string; className?: string }) {
  const meta = TYPE_META[type] || { icon: Package, color: "text-slate-400", bg: "bg-slate-50" };
  const Icon = meta.icon;
  return (
    <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl border", meta.bg, className)}>
      <Icon className={cn("h-5 w-5", meta.color)} />
    </div>
  );
}

function fmt(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

// ─────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────
export default function InventoryLocationsPage() {
  const { activeCompanyId } = useActiveCompany();
  const companyId = activeCompanyId || 0;
  const { selectedBranchId } = useBranchContext();
  const { data: locations = [], isLoading } = useInventoryLocations(companyId);
  const { data: branches = [] } = useBranches(companyId);
  const { toast } = useToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<InventoryLocation | null>(null);
  const [editing, setEditing] = useState<InventoryLocation | null>(null);
  const [form, setForm] = useState<LocationFormData>(EMPTY_FORM);
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [search, setSearch] = useState("");

  const createLocation = useCreateLocation(companyId);
  const updateLocation = useUpdateLocation(companyId);

  const openCreate = () => {
    setEditing(null);
    setForm({
      ...EMPTY_FORM,
      branchId: selectedBranchId ? String(selectedBranchId) : "",
    });
    setDialogOpen(true);
  };

  const openEdit = (loc: InventoryLocation) => {
    setEditing(loc);
    setForm({
      name: loc.name,
      type: loc.type,
      code: loc.code || "",
      address: loc.address || "",
      branchId: loc.branchId ? String(loc.branchId) : "",
      isDefaultReceiving: loc.isDefaultReceiving,
      isDefaultDispatch: loc.isDefaultDispatch,
      isActive: loc.isActive,
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.name.trim()) {
      toast({ title: "Name required", variant: "destructive" });
      return;
    }

    const payload = {
      name: form.name.trim(),
      type: form.type,
      code: form.code.trim() || null,
      address: form.address.trim() || null,
      branchId: form.branchId ? Number(form.branchId) : null,
      isDefaultReceiving: form.isDefaultReceiving,
      isDefaultDispatch: form.isDefaultDispatch,
      isActive: form.isActive,
    };

    if (editing) {
      updateLocation.mutate(
        { id: editing.id, ...payload },
        {
          onSuccess: () => {
            toast({ title: "Location updated" });
            setDialogOpen(false);
          },
          onError: (err: any) =>
            toast({ title: "Error", description: err.message, variant: "destructive" }),
        },
      );
    } else {
      createLocation.mutate(payload, {
        onSuccess: () => {
          toast({ title: "Location created" });
          setDialogOpen(false);
        },
        onError: (err: any) =>
          toast({ title: "Error", description: err.message, variant: "destructive" }),
      });
    }
  };

  const handleToggleActive = (loc: InventoryLocation) => {
    updateLocation.mutate(
      { id: loc.id, isActive: !loc.isActive },
      {
        onSuccess: () =>
          toast({ title: loc.isActive ? "Location deactivated" : "Location activated" }),
        onError: (err: any) =>
          toast({ title: "Error", description: err.message, variant: "destructive" }),
      },
    );
    setDeactivateTarget(null);
  };

  // Group by type/branch for display
  const filtered = locations.filter((loc) => {
    const matchType = typeFilter === "ALL" || loc.type === typeFilter;
    const matchSearch =
      !search ||
      loc.name.toLowerCase().includes(search.toLowerCase()) ||
      (loc.code || "").toLowerCase().includes(search.toLowerCase());
    return matchType && matchSearch;
  });

  const branchMap = Object.fromEntries((branches as Branch[]).map((b) => [b.id, b]));

  // Summary stats
  const totalActive = locations.filter((l) => l.isActive).length;
  const warehouses = locations.filter((l) => l.type === "WAREHOUSE").length;
  const branchLocs = locations.filter((l) => l.type === "BRANCH" || l.type === "SHOP_FLOOR").length;
  const inTransitLocs = locations.filter((l) => l.type === "VAN").length;

  const isPending = createLocation.isPending || updateLocation.isPending;

  return (
    <Layout>
      <PageHeader
        title="Inventory Locations"
        subtitle="Manage warehouses, branch stores, shop floors, and delivery vans. Stock is tracked per location."
      />

      {/* ── Summary KPI cards ── */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total Active", value: totalActive, icon: LayoutGrid, color: "text-slate-700", bg: "bg-slate-50 border-slate-200" },
          { label: "Warehouses", value: warehouses, icon: Warehouse, color: "text-blue-700", bg: "bg-blue-50 border-blue-200" },
          { label: "Branch / Shop", value: branchLocs, icon: Building2, color: "text-violet-700", bg: "bg-violet-50 border-violet-200" },
          { label: "Vans / Mobile", value: inTransitLocs, icon: Truck, color: "text-amber-700", bg: "bg-amber-50 border-amber-200" },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className={cn("flex items-center gap-3 rounded-2xl border p-4", bg)}>
            <div className={cn("flex h-9 w-9 items-center justify-center rounded-xl border bg-white", color.replace("text-", "border-").replace("700", "200"))}>
              <Icon className={cn("h-4 w-4", color)} />
            </div>
            <div>
              <p className="text-xl font-black text-slate-900">{value}</p>
              <p className={cn("text-xs font-bold", color)}>{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Toolbar ── */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-2">
          <Input
            placeholder="Search locations…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs rounded-xl"
          />
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[150px] rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All types</SelectItem>
              <SelectItem value="WAREHOUSE">Warehouse</SelectItem>
              <SelectItem value="BRANCH">Branch</SelectItem>
              <SelectItem value="SHOP_FLOOR">Shop Floor</SelectItem>
              <SelectItem value="VAN">Van / Mobile</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={openCreate} className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white gap-2">
          <Plus className="h-4 w-4" />
          New Location
        </Button>
      </div>

      {/* ── Location grid ── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-24 text-slate-400">
          <Loader2 className="mr-2 h-6 w-6 animate-spin" />
          Loading locations…
        </div>
      ) : filtered.length === 0 ? (
        <Card className="rounded-2xl border-dashed border-slate-200">
          <CardContent className="flex flex-col items-center py-16 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 border border-blue-100">
              <Warehouse className="h-8 w-8 text-blue-400" />
            </div>
            <p className="text-base font-bold text-slate-700">No locations yet</p>
            <p className="mt-1 text-sm text-slate-500 max-w-xs">
              Create your first inventory location — a warehouse, branch store, shop floor, or delivery van.
            </p>
            <Button onClick={openCreate} className="mt-5 rounded-xl gap-2">
              <Plus className="h-4 w-4" />
              Create first location
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((loc) => {
            const branch = loc.branchId ? branchMap[loc.branchId] : null;
            const meta = TYPE_META[loc.type] || { icon: Package, color: "text-slate-400", bg: "bg-slate-50 border-slate-100" };
            return (
              <div
                key={loc.id}
                className={cn(
                  "group relative flex flex-col gap-3 rounded-2xl border bg-white p-5 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5",
                  !loc.isActive && "opacity-60",
                )}
              >
                {/* Header row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <LocationIcon type={loc.type} />
                    <div>
                      <p className="font-bold text-slate-900 leading-tight">{loc.name}</p>
                      {loc.code && (
                        <p className="mt-0.5 font-mono text-[11px] text-slate-400">{loc.code}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {!loc.isActive && (
                      <Badge variant="outline" className="text-[10px] bg-slate-50 text-slate-400 border-slate-200">
                        Inactive
                      </Badge>
                    )}
                    <TypeBadge type={loc.type} />
                  </div>
                </div>

                {/* Branch link */}
                {branch && (
                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
                    <Building2 className="h-3.5 w-3.5 text-violet-400" />
                    <span className="font-medium">{branch.name}</span>
                  </div>
                )}

                {/* Address */}
                {loc.address && (
                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <MapPin className="h-3.5 w-3.5 text-slate-300 shrink-0" />
                    <span className="truncate">{loc.address}</span>
                  </div>
                )}

                {/* Default flags */}
                <div className="flex flex-wrap gap-1.5">
                  {loc.isDefaultReceiving && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                      <Star className="h-3 w-3" />
                      Default Receiving
                    </span>
                  )}
                  {loc.isDefaultDispatch && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 border border-sky-200 px-2 py-0.5 text-[10px] font-bold text-sky-700">
                      <Star className="h-3 w-3" />
                      Default Dispatch
                    </span>
                  )}
                </div>

                {/* Divider + Actions */}
                <div className="mt-auto flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                  <button
                    onClick={() =>
                      loc.isActive
                        ? setDeactivateTarget(loc)
                        : handleToggleActive(loc)
                    }
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold transition-colors",
                      loc.isActive
                        ? "text-slate-400 hover:text-red-500 hover:bg-red-50"
                        : "text-emerald-600 hover:bg-emerald-50",
                    )}
                  >
                    {loc.isActive ? (
                      <><XCircle className="h-3.5 w-3.5" /> Deactivate</>
                    ) : (
                      <><CheckCircle2 className="h-3.5 w-3.5" /> Reactivate</>
                    )}
                  </button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openEdit(loc)}
                    className="h-7 rounded-lg gap-1.5 text-xs"
                  >
                    <Pencil className="h-3 w-3" />
                    Edit
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Create / Edit Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) setDialogOpen(false); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editing ? (
                <><Pencil className="h-4 w-4 text-blue-600" /> Edit Location</>
              ) : (
                <><Plus className="h-4 w-4 text-blue-600" /> New Inventory Location</>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            {/* Type */}
            <div className="grid gap-1.5">
              <Label>Type <span className="text-red-500">*</span></Label>
              <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TYPE_META).map(([key, meta]) => {
                    const Icon = meta.icon;
                    return (
                      <SelectItem key={key} value={key}>
                        <span className="flex items-center gap-2">
                          <Icon className={cn("h-4 w-4", meta.color)} />
                          {meta.label}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-slate-400">
                {form.type === "WAREHOUSE" && "Central storage not tied to a branch. Goods received here first."}
                {form.type === "BRANCH" && "The primary stock area for a branch. Link it to a branch below."}
                {form.type === "SHOP_FLOOR" && "The selling floor of a branch. Link it to a branch below."}
                {form.type === "VAN" && "A mobile stock location such as a delivery or field service van."}
              </p>
            </div>

            {/* Name & Code */}
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Name <span className="text-red-500">*</span></Label>
                <Input
                  placeholder="e.g. Main Warehouse"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Code</Label>
                <Input
                  placeholder="e.g. WH-01"
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                />
              </div>
            </div>

            {/* Branch link */}
            <div className="grid gap-1.5">
              <Label>Link to Branch</Label>
              <Select
                value={form.branchId || "none"}
                onValueChange={(v) => setForm((f) => ({ ...f, branchId: v === "none" ? "" : v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select branch…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— No branch link —</SelectItem>
                  {(branches as Branch[]).map((b) => (
                    <SelectItem key={b.id} value={String(b.id)}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Address */}
            <div className="grid gap-1.5">
              <Label>Address</Label>
              <Textarea
                placeholder="Physical address of this location"
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                rows={2}
              />
            </div>

            {/* Default flags */}
            <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-700">Default Receiving</p>
                  <p className="text-[11px] text-slate-400">Goods arrivals (GRV) post here by default</p>
                </div>
                <Switch
                  id="receiving"
                  checked={form.isDefaultReceiving}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, isDefaultReceiving: v }))}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-700">Default Dispatch</p>
                  <p className="text-[11px] text-slate-400">New stock transfers originate from here</p>
                </div>
                <Switch
                  id="dispatch"
                  checked={form.isDefaultDispatch}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, isDefaultDispatch: v }))}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-700">Active</p>
                  <p className="text-[11px] text-slate-400">Inactive locations are hidden from workflows</p>
                </div>
                <Switch
                  id="active"
                  checked={form.isActive}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isPending} className="gap-2">
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {editing ? "Save changes" : "Create location"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Deactivate confirm ── */}
      <AlertDialog open={!!deactivateTarget} onOpenChange={(o) => { if (!o) setDeactivateTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Deactivate {deactivateTarget?.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This location will be hidden from GRV receiving, stock transfers, and adjustments. Existing
              stock records are preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => deactivateTarget && handleToggleActive(deactivateTarget)}
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
