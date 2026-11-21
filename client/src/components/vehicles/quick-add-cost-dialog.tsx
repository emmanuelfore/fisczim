import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSuppliers } from "@/hooks/use-suppliers";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { COST_CATEGORIES, fmtMoney, useVehicleAction } from "@/hooks/use-vehicles";
import { Loader2 } from "lucide-react";

/** Cash and bank asset accounts that a cost can be paid from. */
export function useCostBankAccounts(companyId: number) {
  return useQuery<any[]>({
    queryKey: ["vehicle-bank-accounts", companyId],
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const res = await apiFetch(`/api/companies/${companyId}/accounting/accounts`);
      if (!res.ok) return [];
      const rows = await res.json();
      return (Array.isArray(rows) ? rows : []).filter((a: any) => {
        if (a.type !== "ASSET" || a.isActive === false) return false;
        const haystack = `${a.name ?? ""} ${a.category ?? ""} ${a.subType ?? ""}`.toLowerCase();
        return haystack.includes("cash") || haystack.includes("bank");
      });
    },
  });
}

const today = () => new Date().toISOString().slice(0, 10);

export function QuickAddCostDialog({
  companyId,
  vehicle,
  open,
  onOpenChange,
  onAdded,
}: {
  companyId: number;
  vehicle: { id: number; label: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded?: () => void;
}) {
  const { toast } = useToast();
  const { data: suppliers = [] } = useSuppliers(companyId);
  const { data: bankAccounts = [] } = useCostBankAccounts(companyId);
  const action = useVehicleAction(companyId);

  const blank = {
    category: "shipping",
    description: "",
    amount: "",
    currency: "USD",
    exchangeRate: "1",
    status: "pending",
    settlementMethod: "cash",
    bankAccountId: "none",
    supplierId: "none",
    costDate: today(),
  };
  const [form, setForm] = useState(blank);
  const set = (k: keyof typeof blank, v: string) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (open) setForm({ ...blank, bankAccountId: bankAccounts[0] ? String(bankAccounts[0].id) : "none" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, vehicle?.id]);

  const isBill = form.settlementMethod === "supplier_bill";
  const valid =
    Number(form.amount) > 0 &&
    (isBill ? form.supplierId !== "none" : form.bankAccountId !== "none");

  const submit = async () => {
    if (!vehicle || !valid) return;
    try {
      await action.mutateAsync({
        path: `/${vehicle.id}/costs`,
        body: {
          category: form.category,
          description: form.description || null,
          amount: String(form.amount),
          currency: form.currency || "USD",
          exchangeRate: String(form.exchangeRate || 1),
          costDate: form.costDate || null,
          status: form.status,
          settlementMethod: form.settlementMethod,
          supplierId: form.supplierId === "none" ? null : Number(form.supplierId),
          bankAccountId: isBill || form.bankAccountId === "none" ? null : Number(form.bankAccountId),
          inputVatAmount: 0,
        },
      });
      toast({ title: "Cost added", description: `${fmtMoney(Number(form.amount) * Number(form.exchangeRate || 1))} added to ${vehicle.label}` });
      onAdded?.();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Could not add cost", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add cost</DialogTitle>
          <DialogDescription>{vehicle?.label ?? ""}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={form.category} onValueChange={(v) => set("category", v)}>
              <SelectTrigger id="quick-cost-category"><SelectValue /></SelectTrigger>
              <SelectContent>
                {COST_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input id="quick-cost-date" type="date" value={form.costDate} onChange={(e) => set("costDate", e.target.value)} />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Description</Label>
            <Input id="quick-cost-description" value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="e.g. Durban port clearing" />
          </div>
          <div className="space-y-1.5">
            <Label>Amount</Label>
            <Input id="quick-cost-amount" type="number" step="0.01" value={form.amount} onChange={(e) => set("amount", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Input id="quick-cost-currency" value={form.currency} onChange={(e) => set("currency", e.target.value.toUpperCase())} />
            </div>
            <div className="space-y-1.5">
              <Label>Rate</Label>
              <Input id="quick-cost-rate" type="number" step="0.000001" value={form.exchangeRate} onChange={(e) => set("exchangeRate", e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => set("status", v)}>
              <SelectTrigger id="quick-cost-status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Settlement</Label>
            <Select value={form.settlementMethod} onValueChange={(v) => set("settlementMethod", v)}>
              <SelectTrigger id="quick-cost-settlement"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="bank_transfer">Bank transfer</SelectItem>
                <SelectItem value="supplier_bill">Supplier bill</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {isBill ? (
            <div className="col-span-2 space-y-1.5">
              <Label>Supplier</Label>
              <Select value={form.supplierId} onValueChange={(v) => set("supplierId", v)}>
                <SelectTrigger id="quick-cost-supplier"><SelectValue placeholder="Choose supplier" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Choose supplier</SelectItem>
                  {suppliers.map((s: any) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="col-span-2 space-y-1.5">
              <Label>Paid from (bank / cash account)</Label>
              <Select value={form.bankAccountId} onValueChange={(v) => set("bankAccountId", v)}>
                <SelectTrigger id="quick-cost-bank"><SelectValue placeholder="Choose account" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Choose account</SelectItem>
                  {bankAccounts.map((a: any) => <SelectItem key={a.id} value={String(a.id)}>{a.code} · {a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {Number(form.exchangeRate) !== 1 && Number(form.amount) > 0 && (
            <p className="col-span-2 text-xs text-slate-500">
              Base amount: <strong>{fmtMoney(Number(form.amount) * Number(form.exchangeRate || 1))}</strong>
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button id="quick-cost-submit" onClick={submit} disabled={!valid || action.isPending}>
            {action.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Add cost
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
