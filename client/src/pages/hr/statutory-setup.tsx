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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Loader2, Settings2, Lock, Pencil, Trash2, Building2, BadgeCheck } from "lucide-react";
import { format } from "date-fns";
import { BankExportSettingsModal } from "@/components/hr/BankExportSettingsModal";

import { LoadingRows } from "@/components/ui/page-skeleton";

const RULE_TYPES = [
  { value: "FIXED_AMOUNT", label: "Fixed Amount" },
  { value: "PERCENTAGE_GROSS", label: "Percentage of Gross" },
  { value: "PERCENTAGE_BASIC", label: "Percentage of Basic" },
  { value: "TIERED_BRACKETS", label: "Tiered Brackets" },
];

const CATEGORIES = [
  { value: "EMPLOYEE_DEDUCTION", label: "Employee deduction" },
  { value: "EMPLOYER_CONTRIBUTION", label: "Employer contribution / levy" },
  { value: "TAX_CREDIT", label: "Employee tax credit / exemption" },
];

const CATEGORY_SECTIONS = [
  {
    value: "EMPLOYEE_DEDUCTION",
    title: "Employee deductions",
    description: "Amounts withheld from the employee — PAYE, NSSA, AIDS levy, NEC and other deductions.",
  },
  {
    value: "EMPLOYER_CONTRIBUTION",
    title: "Employer contributions & levies",
    description: "Costs borne by the employer rather than deducted from salary.",
  },
  {
    value: "TAX_CREDIT",
    title: "Tax credits & exemptions",
    description: "Credits and exemptions applied against the employee's tax liability.",
  },
];

const RESPONSIBLE_PARTIES = [
  { value: "EMPLOYEE", label: "Employee" },
  { value: "EMPLOYER", label: "Employer" },
  { value: "BOTH", label: "Both" },
];

const CALCULATION_TYPES = [
  { value: "PERCENTAGE", label: "Percentage" },
  { value: "FIXED_ANNUAL", label: "Fixed annual amount" },
  { value: "PERCENT_OF_QUALIFYING_EXPENSE", label: "% of qualifying expense" },
];

const BLANK_FORM = {
  ruleCode: "",
  name: "",
  ruleType: "PERCENTAGE_GROSS",
  category: "EMPLOYEE_DEDUCTION",
  responsibleParty: "EMPLOYEE",
  calculationType: "PERCENTAGE",
  calculationBasis: "GROSS",
  statutoryAuthority: "",
  sourceReference: "",
  ceilingAmount: "",
  ceilingPeriod: "",
  annualAmount: "",
  isCapped: false,
  requiresIndustryRate: false,
  effectiveFrom: format(new Date(), "yyyy-MM-dd"),
  effectiveTo: "",
  employeeRate: "",
  employerRate: "",
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
  const type = rule.calculationType || rule.formula || rule.metadata?.ruleType;
  return type === "FIXED_ANNUAL" || type === "FIXED_AMOUNT" || rule.calculationBasis === "FIXED_AMOUNT";
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
    ...BLANK_FORM,
    ruleCode: rule.ruleCode || "",
    name: rule.name || "",
    ruleType: isKnownRuleType(storedType) ? storedType : "PERCENTAGE_GROSS",
    category: rule.category || "EMPLOYEE_DEDUCTION",
    responsibleParty: rule.responsibleParty || "EMPLOYEE",
    calculationType: rule.calculationType || "PERCENTAGE",
    calculationBasis: rule.calculationBasis || "GROSS",
    statutoryAuthority: rule.statutoryAuthority || "",
    sourceReference: rule.sourceReference || "",
    ceilingAmount: rule.ceilingAmount ?? "",
    ceilingPeriod: rule.ceilingPeriod || "",
    annualAmount: rule.annualAmount ?? "",
    isCapped: !!rule.isCapped,
    requiresIndustryRate: !!rule.requiresIndustryRate,
    effectiveFrom: (rule.effectiveFrom || format(new Date(), "yyyy-MM-dd")).slice(0, 10),
    effectiveTo: rule.effectiveTo ? String(rule.effectiveTo).slice(0, 10) : "",
    employeeRate: rule.employeeRate ?? "",
    employerRate: rule.employerRate ?? "",
    rate: String(rule.employeeRate ?? rule.employerRate ?? rule.rate ?? "0.000000"),
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
        category: data.category,
        responsibleParty: data.responsibleParty,
        calculationType: data.calculationType,
        calculationBasis: data.calculationBasis,
        statutoryAuthority: data.statutoryAuthority || null,
        sourceReference: data.sourceReference || null,
        ceilingAmount: data.ceilingAmount === "" ? null : data.ceilingAmount,
        ceilingPeriod: data.ceilingPeriod || null,
        annualAmount: data.annualAmount === "" ? null : data.annualAmount,
        isCapped: data.isCapped,
        requiresIndustryRate: data.requiresIndustryRate,
        effectiveFrom: data.effectiveFrom,
        effectiveTo: data.effectiveTo || null,
        employeeRate: data.employeeRate === "" ? null : data.employeeRate,
        employerRate: data.employerRate === "" ? null : data.employerRate,
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
            <DialogContent className="sm:max-w-[900px] max-h-[85vh] overflow-y-auto">
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
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select
                      value={formData.category}
                      onValueChange={(val) => setFormData({ ...formData, category: val })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map((item) => (
                          <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Responsible Party</Label>
                    <Select
                      value={formData.responsibleParty}
                      onValueChange={(val) => setFormData({ ...formData, responsibleParty: val })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {RESPONSIBLE_PARTIES.map((item) => (
                          <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Calculation Type</Label>
                    <Select
                      value={formData.calculationType}
                      onValueChange={(val) => setFormData({ ...formData, calculationType: val })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CALCULATION_TYPES.map((item) => (
                          <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Legacy Rule Type</Label>
                    <Select
                      value={formData.ruleType}
                      onValueChange={(val) => setFormData({ ...formData, ruleType: val })}
                    >
                      <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                      <SelectContent>
                        {RULE_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Calculation Basis</Label>
                  <Input
                    placeholder="GROSS, INSURABLE_EARNINGS, PAYE_AFTER_CREDITS..."
                    value={formData.calculationBasis}
                    onChange={(e) => setFormData({ ...formData, calculationBasis: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Employee Rate / Fixed Amount</Label>
                    <Input
                      type="number"
                      step="0.000001"
                      value={formData.employeeRate}
                      placeholder="0.045 or 900"
                      onChange={(e) => setFormData({ ...formData, employeeRate: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Employer Rate</Label>
                    <Input
                      type="number"
                      step="0.000001"
                      value={formData.employerRate}
                      placeholder="0.045"
                      onChange={(e) => setFormData({ ...formData, employerRate: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Single Rate (legacy editor)</Label>
                  <Input
                    type="number"
                    step="0.000001"
                    required
                    value={formData.rate}
                    onChange={(e) => setFormData({ ...formData, rate: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Used only when employee and employer rates are left blank.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Ceiling Amount</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.ceilingAmount}
                      placeholder="e.g. 700"
                      onChange={(e) => setFormData({ ...formData, ceilingAmount: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Ceiling Period</Label>
                    <Select
                      value={formData.ceilingPeriod || "NONE"}
                      onValueChange={(val) => setFormData({ ...formData, ceilingPeriod: val === "NONE" ? "" : val })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NONE">None</SelectItem>
                        <SelectItem value="MONTHLY">Monthly</SelectItem>
                        <SelectItem value="QUARTERLY">Quarterly</SelectItem>
                        <SelectItem value="ANNUAL">Annual</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Annual Credit Amount</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.annualAmount}
                      placeholder="e.g. 900"
                      onChange={(e) => setFormData({ ...formData, annualAmount: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Statutory Authority</Label>
                    <Input
                      value={formData.statutoryAuthority}
                      placeholder="ZIMRA, NSSA, ZIMDEF..."
                      onChange={(e) => setFormData({ ...formData, statutoryAuthority: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Source Reference</Label>
                  <Input
                    value={formData.sourceReference}
                    placeholder="Gazette / circular reference"
                    onChange={(e) => setFormData({ ...formData, sourceReference: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Capped?</Label>
                    <Select
                      value={String(formData.isCapped)}
                      onValueChange={(val) => setFormData({ ...formData, isCapped: val === "true" })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="false">No</SelectItem>
                        <SelectItem value="true">Yes</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Requires Industry Rate?</Label>
                    <Select
                      value={String(formData.requiresIndustryRate)}
                      onValueChange={(val) => setFormData({ ...formData, requiresIndustryRate: val === "true" })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="false">No</SelectItem>
                        <SelectItem value="true">Yes</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Effective From</Label>
                    <Input
                      type="date"
                      required
                      value={formData.effectiveFrom}
                      onChange={(e) => setFormData({ ...formData, effectiveFrom: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Effective To</Label>
                    <Input
                      type="date"
                      value={formData.effectiveTo}
                      onChange={(e) => setFormData({ ...formData, effectiveTo: e.target.value })}
                    />
                  </div>
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

      <div className="flex flex-col gap-5 w-full">
        {isLoading ? (
          <Card className="border-slate-200/60 dark:border-slate-800 shadow-sm overflow-hidden">
            <CardContent className="p-6">
              <LoadingRows rows={4} />
            </CardContent>
          </Card>
        ) : !rules?.length ? (
          <Card className="border-slate-200/60 dark:border-slate-800 shadow-sm overflow-hidden">
            <CardContent className="p-10 text-center text-muted-foreground">
              No statutory rules found.
            </CardContent>
          </Card>
        ) : (
          CATEGORY_SECTIONS.map((section) => {
            const sectionRules = (rules || []).filter(
              (rule: any) => String(rule.category || "EMPLOYEE_DEDUCTION") === section.value,
            );
            if (!sectionRules.length) return null;
            return (
              <Card
                key={section.value}
                className="border-slate-200/60 dark:border-slate-800 shadow-sm overflow-hidden"
              >
                <CardHeader className="bg-slate-50/60 dark:bg-slate-900/30 border-b border-slate-100 dark:border-slate-800 pb-4">
                  <CardTitle className="text-base flex items-center gap-2">
                    {section.title}
                    <span className="text-xs font-normal text-muted-foreground">
                      {sectionRules.length} rule{sectionRules.length === 1 ? "" : "s"}
                    </span>
                  </CardTitle>
                  <CardDescription>{section.description}</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader className="bg-slate-50 dark:bg-slate-800/50">
                      <TableRow>
                        <TableHead className="w-[26%] min-w-[220px]">Rule</TableHead>
                        <TableHead className="w-[28%] min-w-[220px]">Rate &amp; basis</TableHead>
                        <TableHead className="w-[18%] min-w-[150px]">Cap / ceiling</TableHead>
                        <TableHead className="w-[16%] min-w-[140px]">Effective</TableHead>
                        <TableHead className="w-[12%] min-w-[110px] text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sectionRules.map((rule: any) => {
                        const fixed = isFixedRateRule(rule);
                        const employeeRate = rule.employeeRate ?? rule.rate;
                        const employerRate = rule.employerRate;
                        const hasSplitRate =
                          employerRate !== null &&
                          employerRate !== undefined &&
                          Number(employerRate) !== Number(employeeRate);
                        return (
                          <TableRow key={rule.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                            <TableCell className="align-top">
                              <div className="flex items-center gap-2 font-medium">
                                {rule.ruleCode}
                                {rule.isSystemLocked && (
                                  <span title="System Locked (Required)"><Lock className="w-3.5 h-3.5 text-slate-400" /></span>
                                )}
                              </div>
                              <div className="mt-1 text-sm">{rule.name}</div>
                              <div className="mt-0.5 text-xs text-muted-foreground">
                                {rule.statutoryAuthority || "—"}
                                {rule.sourceReference ? ` · ${rule.sourceReference}` : ""}
                              </div>
                            </TableCell>
                            <TableCell className="align-top">
                              {hasSplitRate ? (
                                <div className="space-y-1 text-sm">
                                  <div>Employee: <span className="font-semibold">{formatRate(employeeRate, fixed)}</span></div>
                                  <div>Employer: <span className="font-semibold">{formatRate(employerRate, fixed)}</span></div>
                                </div>
                              ) : (
                                <div className="text-sm font-semibold">{formatRate(employeeRate, fixed)}</div>
                              )}
                              <div className="mt-1 text-xs text-muted-foreground">
                                {rule.calculationType || ruleTypeLabel(rule)} · {String(rule.calculationBasis || "—").replace(/_/g, " ")}
                              </div>
                              {fixed && rule.annualAmount != null && (
                                <div className="mt-0.5 text-xs text-muted-foreground">Annual: {formatRate(rule.annualAmount, true)}</div>
                              )}
                            </TableCell>
                            <TableCell className="align-top text-sm">
                              {rule.isCapped ? (
                                <>
                                  <div>Capped at {formatRate(rule.ceilingAmount, true)}</div>
                                  <div className="mt-0.5 text-xs text-muted-foreground">{rule.ceilingPeriod || "period not set"}</div>
                                </>
                              ) : (
                                <span className="text-xs text-muted-foreground">Uncapped</span>
                              )}
                              {rule.requiresIndustryRate && (
                                <div className="mt-1 text-xs text-amber-600">Industry rate required</div>
                              )}
                            </TableCell>
                            <TableCell className="align-top text-sm">
                              <div>{rule.effectiveFrom ? format(new Date(rule.effectiveFrom), "PP") : "-"}</div>
                              <div className="mt-0.5 text-xs text-muted-foreground">
                                {rule.effectiveTo ? `to ${format(new Date(rule.effectiveTo), "PP")}` : "open ended"}
                              </div>
                            </TableCell>
                            <TableCell className="align-top text-right">
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
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            );
          })
        )}
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

      <ApwcsSetupSection companyId={companyId} />
      <TaxCreditClaimsSection companyId={companyId} />
    </div>
  );
}

function ApwcsSetupSection({ companyId }: { companyId: number | null }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [codeForm, setCodeForm] = useState({
    code: "",
    description: "",
    effectiveFrom: format(new Date(), "yyyy-MM-dd"),
    sourceReference: "",
  });
  const [premiumForm, setPremiumForm] = useState({
    industryCodeId: "",
    rate: "",
    ceilingAmount: "",
    effectiveFrom: format(new Date(), "yyyy-MM-dd"),
    effectiveTo: "",
    sourceReference: "",
    gazetteReference: "",
  });

  const keys = {
    codes: [`/api/companies/${companyId}/payroll/industry-codes`],
    premiums: [`/api/companies/${companyId}/payroll/industry-premium-rates`],
  };

  const { data: codes } = useQuery<any[]>({
    queryKey: keys.codes,
    enabled: !!companyId,
  });
  const { data: premiums } = useQuery<any[]>({
    queryKey: keys.premiums,
    enabled: !!companyId,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: keys.codes });
    queryClient.invalidateQueries({ queryKey: keys.premiums });
  };

  const codeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/companies/${companyId}/payroll/industry-codes`, codeForm);
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      setCodeForm({ code: "", description: "", effectiveFrom: format(new Date(), "yyyy-MM-dd"), sourceReference: "" });
      toast({ title: "NSSA industry code saved" });
    },
    onError: (error: Error) => toast({ title: "Could not save industry code", description: readableError(error), variant: "destructive" }),
  });

  const premiumMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/companies/${companyId}/payroll/industry-premium-rates`, {
        industryCodeId: Number(premiumForm.industryCodeId),
        rate: Number(premiumForm.rate),
        ceilingAmount: premiumForm.ceilingAmount || null,
        effectiveFrom: premiumForm.effectiveFrom,
        effectiveTo: premiumForm.effectiveTo || null,
        sourceReference: premiumForm.sourceReference,
        gazetteReference: premiumForm.gazetteReference || null,
      });
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      setPremiumForm({
        industryCodeId: "", rate: "", ceilingAmount: "", effectiveFrom: format(new Date(), "yyyy-MM-dd"),
        effectiveTo: "", sourceReference: "", gazetteReference: "",
      });
      toast({ title: "APWCS premium rate saved" });
    },
    onError: (error: Error) => toast({ title: "Could not save APWCS rate", description: readableError(error), variant: "destructive" }),
  });

  return (
    <section className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Building2 className="w-5 h-5 text-rose-500" />
        <div>
          <h3 className="text-lg font-semibold">NSSA APWCS industry classification</h3>
          <p className="text-sm text-muted-foreground">
            Employer-only levy. No default rate is applied: configure the employer's industry code and an effective-dated gazetted premium.
          </p>
        </div>
      </div>

      <form
        className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end"
        onSubmit={(e) => { e.preventDefault(); codeMutation.mutate(); }}
      >
        <div className="space-y-1">
          <Label>Industry code</Label>
          <Input required value={codeForm.code} onChange={(e) => setCodeForm({ ...codeForm, code: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label>Description</Label>
          <Input required value={codeForm.description} onChange={(e) => setCodeForm({ ...codeForm, description: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label>Effective from</Label>
          <Input type="date" required value={codeForm.effectiveFrom} onChange={(e) => setCodeForm({ ...codeForm, effectiveFrom: e.target.value })} />
        </div>
        <div className="space-y-1 md:col-span-2">
          <Label>Source reference</Label>
          <Input value={codeForm.sourceReference} onChange={(e) => setCodeForm({ ...codeForm, sourceReference: e.target.value })} />
        </div>
        <Button type="submit" disabled={!companyId || codeMutation.isPending} className="md:w-fit">
          Save code
        </Button>
      </form>

      <form
        className="grid grid-cols-1 md:grid-cols-7 gap-3 items-end"
        onSubmit={(e) => { e.preventDefault(); premiumMutation.mutate(); }}
      >
        <div className="space-y-1">
          <Label>Industry code</Label>
          <Select value={premiumForm.industryCodeId} onValueChange={(val) => setPremiumForm({ ...premiumForm, industryCodeId: val })}>
            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              {(codes || []).map((code) => (
                <SelectItem key={code.id} value={String(code.id)}>{code.code} — {code.description}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Rate (%)</Label>
          <Input type="number" step="0.000001" required value={premiumForm.rate} onChange={(e) => setPremiumForm({ ...premiumForm, rate: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label>Ceiling</Label>
          <Input type="number" step="0.01" value={premiumForm.ceilingAmount} onChange={(e) => setPremiumForm({ ...premiumForm, ceilingAmount: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label>Effective from</Label>
          <Input type="date" required value={premiumForm.effectiveFrom} onChange={(e) => setPremiumForm({ ...premiumForm, effectiveFrom: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label>Effective to</Label>
          <Input type="date" value={premiumForm.effectiveTo} onChange={(e) => setPremiumForm({ ...premiumForm, effectiveTo: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label>Source (required)</Label>
          <Input required value={premiumForm.sourceReference} onChange={(e) => setPremiumForm({ ...premiumForm, sourceReference: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label>Gazette reference</Label>
          <Input value={premiumForm.gazetteReference} onChange={(e) => setPremiumForm({ ...premiumForm, gazetteReference: e.target.value })} />
          <Button type="submit" className="mt-2 w-full" disabled={!premiumForm.industryCodeId || premiumMutation.isPending}>
            Save premium
          </Button>
        </div>
      </form>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Code</TableHead>
            <TableHead>Rate</TableHead>
            <TableHead>Ceiling</TableHead>
            <TableHead>Effective</TableHead>
            <TableHead>Source</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {!premiums?.length ? (
            <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">No APWCS premium configured. Payroll will report zero with a warning.</TableCell></TableRow>
          ) : premiums.map((rate) => (
            <TableRow key={rate.id}>
              <TableCell className="font-medium">{rate.industryCode}</TableCell>
              <TableCell>{Number((Number(rate.rate) * 100).toFixed(4))}%</TableCell>
              <TableCell>{rate.ceilingAmount ? formatRate(rate.ceilingAmount, true) : "Uncapped"}</TableCell>
              <TableCell>
                {format(new Date(rate.effectiveFrom), "PP")}
                {rate.effectiveTo ? ` – ${format(new Date(rate.effectiveTo), "PP")}` : " – open ended"}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">{rate.gazetteReference || rate.sourceReference}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}

function TaxCreditClaimsSection({ companyId }: { companyId: number | null }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const currentYear = new Date().getFullYear();

  const [form, setForm] = useState({
    employeeId: "",
    creditCode: "MEDICAL_CREDIT",
    taxYear: String(currentYear),
    qualifyingExpenses: "",
    annualAmountOverride: "",
    documentationReference: "",
    effectiveFrom: `${currentYear}-01-01`,
    effectiveTo: `${currentYear}-12-31`,
    notes: "",
  });

  const keys = {
    employees: [`/api/companies/${companyId}/payroll/employees`],
    credits: [`/api/companies/${companyId}/payroll/employee-tax-credits`],
    rules: [`/api/companies/${companyId}/payroll/statutory-rules`],
  };

  const { data: employees } = useQuery<any[]>({ queryKey: keys.employees, enabled: !!companyId });
  const { data: credits } = useQuery<any[]>({ queryKey: keys.credits, enabled: !!companyId });
  const { data: rules } = useQuery<any[]>({ queryKey: keys.rules, enabled: !!companyId });
  const creditRules = (rules || []).filter((rule: any) => rule.category === "TAX_CREDIT");

  const createMutation = useMutation({
    mutationFn: async () => {
      const selectedRule = creditRules.find((rule: any) => rule.ruleCode === form.creditCode);
      const res = await apiRequest("POST", `/api/companies/${companyId}/payroll/employee-tax-credits`, {
        employeeId: Number(form.employeeId),
        statutoryRuleId: selectedRule?.id || null,
        creditCode: form.creditCode,
        taxYear: Number(form.taxYear),
        qualifyingExpenses: Number(form.qualifyingExpenses || 0),
        annualAmountOverride: form.annualAmountOverride === "" ? null : Number(form.annualAmountOverride),
        documentationReference: form.documentationReference,
        effectiveFrom: form.effectiveFrom,
        effectiveTo: form.effectiveTo || null,
        notes: form.notes,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.credits });
      toast({ title: "Tax credit claim submitted for approval" });
    },
    onError: (error: Error) => toast({ title: "Could not save tax credit claim", description: readableError(error), variant: "destructive" }),
  });

  const decisionMutation = useMutation({
    mutationFn: async ({ id, decision }: { id: number; decision: "APPROVED" | "REJECTED" }) => {
      const res = await apiRequest("POST", `/api/companies/${companyId}/payroll/employee-tax-credits/${id}/decision`, { decision });
      return res.json();
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: keys.credits });
      toast({ title: `Credit claim ${vars.decision.toLowerCase()}` });
    },
    onError: (error: Error) => toast({ title: "Could not update credit claim", description: readableError(error), variant: "destructive" }),
  });

  const employeeName = (id: number) => {
    const emp = (employees || []).find((item) => item.id === id);
    return emp ? `${emp.firstName} ${emp.lastName}`.trim() : `#${id}`;
  };

  return (
    <section className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-5 space-y-4">
      <div className="flex items-center gap-2">
        <BadgeCheck className="w-5 h-5 text-rose-500" />
        <div>
          <h3 className="text-lg font-semibold">Employee tax credit claims</h3>
          <p className="text-sm text-muted-foreground">
            Credits are never applied automatically. Capture eligibility and documents, then approve the claim before payroll uses it.
          </p>
        </div>
      </div>

      <form
        className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end"
        onSubmit={(e) => { e.preventDefault(); createMutation.mutate(); }}
      >
        <div className="space-y-1">
          <Label>Employee</Label>
          <Select value={form.employeeId} onValueChange={(val) => setForm({ ...form, employeeId: val })}>
            <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
            <SelectContent>
              {(employees || []).map((emp) => (
                <SelectItem key={emp.id} value={String(emp.id)}>{emp.firstName} {emp.lastName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Credit</Label>
          <Select value={form.creditCode} onValueChange={(val) => setForm({ ...form, creditCode: val })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {creditRules.length ? creditRules.map((rule) => (
                <SelectItem key={rule.id} value={rule.ruleCode}>{rule.name}</SelectItem>
              )) : (
                <>
                  <SelectItem value="MEDICAL_CREDIT">Medical expenses</SelectItem>
                  <SelectItem value="ELDERLY_CREDIT">Elderly person</SelectItem>
                  <SelectItem value="BLIND_CREDIT">Blind person</SelectItem>
                  <SelectItem value="DISABLED_CREDIT">Disabled person</SelectItem>
                </>
              )}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Tax year</Label>
          <Input type="number" required value={form.taxYear} onChange={(e) => setForm({ ...form, taxYear: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label>Qualifying expenses / override</Label>
          <Input type="number" step="0.01" value={form.qualifyingExpenses} onChange={(e) => setForm({ ...form, qualifyingExpenses: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label>Document reference</Label>
          <Input value={form.documentationReference} onChange={(e) => setForm({ ...form, documentationReference: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label>Effective from</Label>
          <Input type="date" required value={form.effectiveFrom} onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label>Effective to</Label>
          <Input type="date" value={form.effectiveTo} onChange={(e) => setForm({ ...form, effectiveTo: e.target.value })} />
        </div>
        <div className="space-y-1 md:col-span-2">
          <Label>Notes / interactions</Label>
          <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="e.g. does not combine with another fixed credit" />
        </div>
        <Button type="submit" disabled={!form.employeeId || createMutation.isPending} className="md:w-fit">Submit claim</Button>
      </form>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Employee</TableHead>
            <TableHead>Credit</TableHead>
            <TableHead>Tax year / period</TableHead>
            <TableHead>Value</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {!credits?.length ? (
            <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">No tax credit claims captured.</TableCell></TableRow>
          ) : credits.map((claim) => (
            <TableRow key={claim.id}>
              <TableCell className="font-medium">{employeeName(claim.employeeId)}</TableCell>
              <TableCell>{String(claim.creditCode).replace(/_/g, " ")}</TableCell>
              <TableCell>
                {claim.taxYear}<br />
                <span className="text-xs text-muted-foreground">
                  {format(new Date(claim.effectiveFrom), "PP")}
                  {claim.effectiveTo ? ` – ${format(new Date(claim.effectiveTo), "PP")}` : " – open ended"}
                </span>
              </TableCell>
              <TableCell>
                {claim.annualAmountOverride != null ? `Override ${formatRate(claim.annualAmountOverride, true)}` : `Expenses ${formatRate(claim.qualifyingExpenses, true)}`}
                <div className="text-xs text-muted-foreground">{claim.documentationReference || "No document reference"}</div>
              </TableCell>
              <TableCell>
                <span className={`text-xs font-medium ${claim.approvalStatus === "APPROVED" ? "text-emerald-600" : claim.approvalStatus === "REJECTED" ? "text-rose-600" : "text-amber-600"}`}>
                  {claim.approvalStatus}
                </span>
              </TableCell>
              <TableCell className="text-right">
                {claim.approvalStatus === "PENDING" && (
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="outline" onClick={() => decisionMutation.mutate({ id: claim.id, decision: "APPROVED" })}>Approve</Button>
                    <Button size="sm" variant="ghost" onClick={() => decisionMutation.mutate({ id: claim.id, decision: "REJECTED" })}>Reject</Button>
                  </div>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}
