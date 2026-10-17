import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useTaxConfig } from "@/hooks/use-tax-config";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useFiscalAuthority } from "@/hooks/use-fiscal-authority";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, Save } from "lucide-react";
import { cn } from "@/lib/utils";

export type LevySelection = { taxTypeId: number; appliedForQuantity?: number };

const LEVY_KINDS = ["PercentageLevy", "FixedValueLevy", "WithholdingTax"];

/**
 * Multi-levy editor for a product (LEKAKU additional taxes). A product keeps
 * ONE main tax (VAT/NonVAT/Exempt) and can stack ANY number of levies on top
 * — each becomes an entry in the receipt line's additionalTaxes array.
 *
 * Create mode: controlled draft (saved by the parent after the product exists).
 * Edit mode (productId set): loads existing assignments and saves via its own
 * button with PUT /products/:id/lekaku-levies (full-set replace).
 */
export function ProductLevyEditor({
  companyId,
  productId,
  draft,
  onDraftChange,
}: {
  companyId: number;
  productId?: number;
  draft: LevySelection[];
  onDraftChange: (v: LevySelection[]) => void;
}) {
  const { isLesotho } = useFiscalAuthority();
  const { activeCompany } = useActiveCompany();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { taxTypes } = useTaxConfig(companyId);
  const env = (activeCompany as any)?.zimraEnvironment === "production" ? "production" : "test";

  const levyOptions = ((taxTypes.data || []) as any[]).filter(
    (t) =>
      LEVY_KINDS.includes(t.lekakuTaxType) &&
      (!isLesotho || ((t.lekakuEnvironment || "test") === env && t.isActive !== false)),
  );

  const { data: assignments = [], isLoading: loadingAssignments } = useQuery({
    queryKey: ["lekaku-product-levies", companyId],
    queryFn: async () => {
      const res = await apiFetch(`/api/companies/${companyId}/lekaku/product-levies`);
      if (!res.ok) return [];
      return res.json() as Promise<Array<{ productId: number; taxTypeId: number; appliedForQuantity?: string | null }>>;
    },
    enabled: !!productId && !!companyId,
  });

  // Seed the draft from saved assignments when editing an existing product.
  const [seededFor, setSeededFor] = useState<number | null>(null);
  useEffect(() => {
    if (!productId || seededFor === productId || loadingAssignments) return;
    const saved = assignments
      .filter((a) => a.productId === productId)
      .map((a) => ({
        taxTypeId: a.taxTypeId,
        ...(a.appliedForQuantity ? { appliedForQuantity: Number(a.appliedForQuantity) } : {}),
      }));
    onDraftChange(saved);
    setSeededFor(productId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, loadingAssignments, seededFor]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!productId) throw new Error("Save the product first, then assign levies.");
      const res = await apiFetch(`/api/companies/${companyId}/products/${productId}/lekaku-levies`, {
        method: "PUT",
        body: JSON.stringify({
          levies: draft.map((d) => ({
            taxTypeId: d.taxTypeId,
            ...(d.appliedForQuantity ? { appliedForQuantity: d.appliedForQuantity } : {}),
          })),
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.message || "Could not save levies");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lekaku-product-levies", companyId] });
      toast({ title: draft.length ? `${draft.length} additional tax${draft.length > 1 ? "es" : ""} saved` : "Additional taxes cleared" });
    },
    onError: (err: any) => toast({ title: "Could not save levies", description: err.message, variant: "destructive" }),
  });

  if (!isLesotho) return null;

  const toggle = (taxTypeId: number, checked: boolean) => {
    if (checked) {
      if (!draft.some((d) => d.taxTypeId === taxTypeId)) onDraftChange([...draft, { taxTypeId }]);
    } else {
      onDraftChange(draft.filter((d) => d.taxTypeId !== taxTypeId));
    }
  };

  const setQty = (taxTypeId: number, qty: string) => {
    const n = Number(qty);
    onDraftChange(
      draft.map((d) =>
        d.taxTypeId === taxTypeId ? { ...d, appliedForQuantity: n > 0 ? n : undefined } : d,
      ),
    );
  };

  return (
    <div className="space-y-3 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-emerald-900">Additional taxes</p>
          <p className="text-xs text-emerald-700/80">
            Stack one or more levies on top of the main tax — each is sent as an additional tax on every sale line.
          </p>
        </div>
        {draft.length > 0 && (
          <span className="shrink-0 rounded-full bg-emerald-600 px-2.5 py-0.5 text-[11px] font-bold text-white">
            {draft.length} selected
          </span>
        )}
      </div>

      {levyOptions.length === 0 ? (
        <p className="text-xs text-slate-500">
          No levy taxes synced yet. Run <strong>Sync from RSL</strong> in fiscal setup first.
        </p>
      ) : (
        <div className="space-y-2">
          {levyOptions.map((t: any) => {
            const selected = draft.some((d) => d.taxTypeId === t.id);
            const qty = draft.find((d) => d.taxTypeId === t.id)?.appliedForQuantity;
            const isFixed = t.lekakuTaxType === "FixedValueLevy";
            return (
              <div
                key={t.id}
                className={cn(
                  "flex items-center gap-3 rounded-xl border bg-white p-2.5 transition-colors",
                  selected ? "border-emerald-300" : "border-slate-200",
                )}
              >
                <Checkbox checked={selected} onCheckedChange={(c) => toggle(t.id, !!c)} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800">
                    {t.name}{" "}
                    <span className="font-normal text-slate-500">
                      ({t.rate}
                      {isFixed ? " LSL/unit" : "%"} · ID {t.lekakuTaxId})
                    </span>
                  </p>
                  <p className="text-[11px] text-slate-400">{t.lekakuTaxType}</p>
                </div>
                {isFixed && selected && (
                  <div className="flex w-28 shrink-0 items-center gap-1.5">
                    <Label className="text-[10px] uppercase text-slate-400">Qty</Label>
                    <Input
                      type="number"
                      min="0.001"
                      step="0.001"
                      value={qty ?? ""}
                      onChange={(e) => setQty(t.id, e.target.value)}
                      placeholder="1"
                      className="h-8 font-mono"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {productId && (
        <Button
          type="button"
          size="sm"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || loadingAssignments}
          className="bg-emerald-700 hover:bg-emerald-800 text-white"
        >
          {saveMutation.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          {saveMutation.isPending ? "Saving…" : "Save additional taxes"}
        </Button>
      )}
    </div>
  );
}
