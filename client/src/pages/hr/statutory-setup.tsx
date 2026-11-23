import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useActiveCompany } from "@/hooks/use-active-company";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Loader2, Settings2, Lock, Pencil, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { BankExportSettingsModal } from "@/components/hr/BankExportSettingsModal";

import { LoadingRows } from "@/components/ui/page-skeleton";

const RULE_TYPES = [
  { value: "FIXED_AMOUNT", label: "Fixed Amount" },
  { value: "PERCENTAGE_GROSS", label: "Percentage of Gross" },
  { value: "PERCENTAGE_BASIC", label: "Percentage of Basic" },
  { value: "TIERED_BRACKETS", label: "Tiered Brackets" },
];

const BLANK_FORM = {
  ruleCode: "",
  name: "",
  ruleType: "PERCENTAGE_GROSS",
  effectiveFrom: format(new Date(), "yyyy-MM-dd"),
  rate: "0.00",
};

type RuleForm = typeof BLANK_FORM;

const BASIS_LABELS: Record<string, string> = {
  PAYE: "Percentage of PAYE",
  TAXABLE_INCOME: "Percentage of Taxable Income",
  GROSS: "Percentage of Gross",
  BASIC: "Percentage of Basic",
  FIXED_AMOUNT: "Fixed Amount",
};

const isKnownRuleType = (value: any): value is string =>
  typeof value === "string" && RULE_TYPES.some((type) => type.value === value);

// Seeded statutory rows have no `formula`/`ruleType`; their type is described
// by `calculationBasis` (e.g. PAYE for the AIDS levy, TAXABLE_INCOME for NSSA).
function ruleTypeLabel(rule: any): string {
  const stored = rule.ruleType || rule.formula || rule.metadata?.ruleType;
  if (isKnownRuleType(stored)) {
    return RULE_TYPES.find((type) => type.value === stored)!.label;
  }
  if (typeof stored === "string" && stored.length > 0) return stored;

  const basis = rule.calculationBasis || rule.metadata?.calculationBasis;
  if (typeof basis !== "string" || basis.length === 0) return "—";
  return BASIS_LABELS[basis] || basis.replace(/_/g, " ");
}

function isFixedRateRule(rule: any): boolean {
  const type = rule.formula || rule.metadata?.ruleType;
  return type === "FIXED_AMOUNT" || rule.calculationBasis === "FIXED_AMOUNT";
}

function formatRate(value: any, fixed: boolean): string {
  if (value === null || value === undefined || value === "") return "—";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return String(value);
  if (fixed) {
    return amount.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  return `${Number((amount * 100).toFixed(4))}%`;
}

// The API stores a UI ruleType in `formula` and a single rate in both
// employeeRate and employerRate. Reconstruct the simple editor shape so an
// existing rule can be edited without zeroing out its rates.
function formFromRule(rule: any): RuleForm {
  const storedType = rule.formula || rule.ruleType;
  return {
    ruleCode: rule.ruleCode || "",
    name: rule.name || "",
    ruleType: isKnownRuleType(storedType) ? storedType : "PERCENTAGE_GROSS",
    effectiveFrom: (rule.effectiveFrom || format(new Date(), "yyyy-MM-dd")).slice(0, 10),
    rate: String(rule.employeeRate ?? rule.rate ?? "0.000000"),
  };
}

// apiRequest surfaces non-2xx responses as a message ending in the JSON body.
function readableError(err: any): string {
  const raw = String(err?.message || "Unknown error");
  const match = raw.match(/\{.*\}$/s);
  if (!match) return raw;
  try {
    const body = JSON.parse(match[0]);
    return body.message || body.error || raw;
  } catch {
    return raw;
  }
}

export function StatutoryTab() {
  const { user } = useAuth();
  const { activeCompanyId } = useActiveCompany(!!user, user?.id ?? null);
  const companyId = activeCompanyId ?? null;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [formData, setFormData] = useState<RuleForm>(BLANK_FORM);

  const rulesKey = [`/api/companies/${companyId}/payroll/statutory-rules`];

  const { data: rules, isLoading } = useQuery<any[]>({
    queryKey: rulesKey,
    enabled: !!companyId,
  });

  const editingRule = rules?.find((rule: any) => rule.id === editingId);

  const saveMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number | null; data: RuleForm }) => {
      const payload = {
        ruleCode: data.ruleCode,
        name: data.name,
        ruleType: data.ruleType,
        effectiveFrom: data.effectiveFrom,
        rate: data.rate,
      };
      const res = id
        ? await apiRequest(
            "PATCH",
            `/api/companies/${companyId}/payroll/statutory-rules/${id}`,
            payload
          )
        : await apiRequest(
            "POST",
            `/api/companies/${companyId}/payroll/statutory-rules`,
            payload
          );
      return res.json();
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: rulesKey });
      setIsOpen(false);
      setEditingId(null);
      setFormData(BLANK_FORM);
      toast({
        title: vars.id
          ? "Statutory rule updated successfully"
          : "Statutory rule saved successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not save statutory rule",
        description: readableError(error),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest(
        "DELETE",
        `/api/companies/${companyId}/payroll/statutory-rules/${id}`
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: rulesKey });
      setDeleteTarget(null);
      toast({ title: "Statutory rule deleted" });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not delete statutory rule",
        description: readableError(error),
        variant: "destructive",
      });
    },
  });

  const openCreate = () => {
    setEditingId(null);
    setFormData({
      ...BLANK_FORM,
      effectiveFrom: format(new Date(), "yyyy-MM-dd"),
    });
    setIsOpen(true);
  };

  const openEdit = (rule: any) => {
    setEditingId(rule.id);
    setFormData(formFromRule(rule));
    setIsOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate({ id: editingId, data: formData });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-3">
            <Settings2 className="w-7 h-7 text-rose-500" />
            Statutory
          </h2>
          <p className="text-muted-foreground mt-1">
            Configure statutory rates (ZIMDEF, NEC, AIDS levy) and logic rules
          </p>
        </div>

        <div className="flex items-center gap-2">
          {companyId && <BankExportSettingsModal companyId={companyId} />}
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button
                className="bg-gradient-to-r from-rose-500 to-red-600 text-white shadow-md"
                onClick={openCreate}
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Rule
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>
                  {editingId ? "Edit Statutory Rule" : "Create Statutory Rule"}
                </DialogTitle>
                <DialogDescription>
                  {editingId
                    ? "Update the rate or details of this statutory calculation rule."
                    : "Define a new statutory calculation rule for the payroll engine."}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>Rule Code</Label>
                  <Input
                    required
                    placeholder="e.g. NSSA_POBS"
                    disabled={!!editingRule?.isSystemLocked}
                    value={formData.ruleCode}
                    onChange={(e) =>
                      setFormData({ ...formData, ruleCode: e.target.value })
                    }
                  />
                  {editingRule?.isSystemLocked && (
                    <p className="text-xs text-muted-foreground">
                      The code of a system-locked rule cannot be changed.
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Rule Name</Label>
                  <Input
                    required
                    placeholder="e.g. NSSA POBS Contribution"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Rule Type</Label>
                  <Select
                    value={formData.ruleType}
                    onValueChange={(val) =>
                      setFormData({ ...formData, ruleType: val })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {RULE_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Rate (Decimal or Amount)</Label>
                  <Input
                    type="number"
                    step="0.000001"
                    required
                    value={formData.rate}
                    onChange={(e) =>
                      setFormData({ ...formData, rate: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Effective From</Label>
                  <Input
                    type="date"
                    required
                    value={formData.effectiveFrom}
                    onChange={(e) =>
                      setFormData({ ...formData, effectiveFrom: e.target.value })
                    }
                  />
                </div>

                <div className="pt-4 flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={saveMutation.isPending}
                    className="bg-rose-600 hover:bg-rose-700 text-white"
                  >
                    {saveMutation.isPending && (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    )}
                    {editingId ? "Update Rule" : "Save Rule"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50 dark:bg-slate-800/50">
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Rule Type</TableHead>
              <TableHead>Rate</TableHead>
              <TableHead>Effective From</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  <LoadingRows rows={4} />
                </TableCell>
              </TableRow>
            ) : !rules?.length ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No statutory rules found.
                </TableCell>
              </TableRow>
            ) : (
              rules.map((rule: any) => {
                const fixed = isFixedRateRule(rule);
                const employeeRate = rule.employeeRate ?? rule.rate;
                const employerRate = rule.employerRate;
                const hasSplitRate =
                  employerRate !== null &&
                  employerRate !== undefined &&
                  Number(employerRate) !== Number(employeeRate);
                return (
                  <TableRow key={rule.id}>
                    <TableCell className="font-medium flex items-center gap-2">
                      {rule.ruleCode}
                      {rule.isSystemLocked && (
                        <span title="System Locked (Required)"><Lock className="w-3.5 h-3.5 text-slate-400" /></span>
                      )}
                    </TableCell>
                    <TableCell>{rule.name}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300">
                        {ruleTypeLabel(rule)}
                      </span>
                    </TableCell>
                    <TableCell>
                      {hasSplitRate ? (
                        <div className="space-y-0.5 text-xs">
                          <div>Employee: <span className="font-medium">{formatRate(employeeRate, fixed)}</span></div>
                          <div>Employer: <span className="font-medium">{formatRate(employerRate, fixed)}</span></div>
                        </div>
                      ) : (
                        formatRate(employeeRate, fixed)
                      )}
                    </TableCell>
                    <TableCell>
                      {rule.effectiveFrom ? format(new Date(rule.effectiveFrom), 'PP') : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-slate-500 hover:text-rose-600"
                          title="Edit rule"
                          onClick={() => openEdit(rule)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-slate-500 hover:text-rose-600"
                          title={
                            rule.isSystemLocked
                              ? "System-locked rules cannot be deleted"
                              : "Delete rule"
                          }
                          disabled={!!rule.isSystemLocked || deleteMutation.isPending}
                          onClick={() => setDeleteTarget(rule)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => (open ? null : setDeleteTarget(null))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this statutory rule?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `${deleteTarget.ruleCode} — ${deleteTarget.name}. This cannot be undone. Rules already used by a finalized payroll run cannot be deleted.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 text-white hover:bg-rose-700"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              Delete rule
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
