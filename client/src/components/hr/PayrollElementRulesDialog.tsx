import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Loader2, Pencil, Trash2 } from "lucide-react";

import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type ElementRuleForm = {
  type: "ALLOWANCE" | "DEDUCTION";
  name: string;
  calculationMethod: "FIXED" | "PERCENTAGE";
  amount: string;
  percentageRate: string;
  isTaxable: boolean;
  isTaxDeductible: boolean;
  appliesToAll: boolean;
  employeeIds: number[];
  startDate: string;
  endDate: string;
};

type Props = {
  companyId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedEmployeeIds?: number[];
  onSaved?: () => void;
};

function blankForm(selectedEmployeeIds: number[]): ElementRuleForm {
  return {
    type: "ALLOWANCE",
    name: "",
    calculationMethod: "FIXED",
    amount: "",
    percentageRate: "",
    isTaxable: true,
    isTaxDeductible: false,
    appliesToAll: selectedEmployeeIds.length === 0,
    employeeIds: selectedEmployeeIds,
    startDate: new Date().toISOString().slice(0, 10),
    endDate: "",
  };
}

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

export function PayrollElementRulesDialog({
  companyId,
  open,
  onOpenChange,
  selectedEmployeeIds = [],
  onSaved,
}: Props) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [form, setForm] = useState<ElementRuleForm>(() => blankForm(selectedEmployeeIds));

  const rulesKey = [`/api/companies/${companyId}/payroll/element-rules`];
  const employeesKey = [`/api/companies/${companyId}/payroll/employees`];

  useEffect(() => {
    if (open) setForm(blankForm(selectedEmployeeIds));
  }, [open, selectedEmployeeIds.join(",")]);

  const { data: rules = [], isLoading } = useQuery<any[]>({
    queryKey: rulesKey,
    enabled: !!companyId && open,
  });

  const { data: employees = [] } = useQuery<any[]>({
    queryKey: employeesKey,
    enabled: !!companyId && open,
  });

  const resetForm = () => {
    setEditingId(null);
    setForm(blankForm(selectedEmployeeIds));
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        type: form.type,
        name: form.name,
        calculationMethod: form.calculationMethod,
        amount: form.calculationMethod === "FIXED" ? form.amount : null,
        percentageRate: form.calculationMethod === "PERCENTAGE" ? form.percentageRate : null,
        isTaxable: form.isTaxable,
        isTaxDeductible: form.isTaxDeductible,
        appliesToAll: form.appliesToAll,
        employeeIds: form.appliesToAll ? [] : form.employeeIds,
        startDate: form.startDate,
        endDate: form.endDate || null,
      };
      const url = editingId
        ? `/api/companies/${companyId}/payroll/element-rules/${editingId}`
        : `/api/companies/${companyId}/payroll/element-rules`;
      const res = await apiRequest(editingId ? "PATCH" : "POST", url, payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: rulesKey });
      toast({ title: editingId ? "Pay rule updated" : "Pay rule applied" });
      resetForm();
      onSaved?.();
    },
    onError: (error: any) => {
      toast({ title: "Could not save pay rule", description: readableError(error), variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/companies/${companyId}/payroll/element-rules/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: rulesKey });
      setDeleteTarget(null);
      if (deleteTarget?.id === editingId) resetForm();
      toast({ title: "Pay rule deleted" });
      onSaved?.();
    },
    onError: (error: any) => {
      toast({ title: "Could not delete pay rule", description: readableError(error), variant: "destructive" });
    },
  });

  const openEdit = (rule: any) => {
    setEditingId(rule.id);
    setForm({
      type: rule.type,
      name: rule.name,
      calculationMethod: rule.calculationMethod,
      amount: rule.amount ? String(rule.amount) : "",
      percentageRate: rule.percentageRate ? String(rule.percentageRate) : "",
      isTaxable: !!rule.isTaxable,
      isTaxDeductible: !!rule.isTaxDeductible,
      appliesToAll: !!rule.appliesToAll,
      employeeIds: rule.employeeIds || [],
      startDate: String(rule.startDate).slice(0, 10),
      endDate: rule.endDate ? String(rule.endDate).slice(0, 10) : "",
    });
  };

  const toggleEmployee = (id: number, checked: boolean) => {
    setForm((prev) => ({
      ...prev,
      employeeIds: checked
        ? Array.from(new Set([...prev.employeeIds, id]))
        : prev.employeeIds.filter((value) => value !== id),
    }));
  };

  const canSave =
    !!companyId &&
    form.name.trim().length > 0 &&
    !!form.startDate &&
    (form.appliesToAll || form.employeeIds.length > 0) &&
    (form.calculationMethod === "FIXED"
      ? Number(form.amount) >= 0 && form.amount !== ""
      : Number(form.percentageRate) > 0 && Number(form.percentageRate) <= 100);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[900px] max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Bulk allowances &amp; deductions</DialogTitle>
            <DialogDescription>
              Apply a pay item to all employees, including future hires, or only to selected employees.
              Fixed amounts and percentages of basic salary are both supported.
            </DialogDescription>
          </DialogHeader>

          <div className="grid md:grid-cols-2 gap-6 pt-4">
            <div className="space-y-3">
              <div className="rounded-xl border bg-slate-50/70 dark:bg-slate-900/40 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">
                    {editingId ? "Edit pay rule" : "New pay rule"}
                  </h3>
                  {editingId && (
                    <Button variant="ghost" size="sm" onClick={resetForm}>
                      Cancel edit
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Type</Label>
                    <Select
                      value={form.type}
                      onValueChange={(value) => setForm({ ...form, type: value as ElementRuleForm["type"] })}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALLOWANCE">Allowance</SelectItem>
                        <SelectItem value="DEDUCTION">Deduction</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Calculation</Label>
                    <Select
                      value={form.calculationMethod}
                      onValueChange={(value) =>
                        setForm({ ...form, calculationMethod: value as ElementRuleForm["calculationMethod"] })
                      }
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="FIXED">Fixed amount</SelectItem>
                        <SelectItem value="PERCENTAGE">Percentage of basic</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Name</Label>
                  <Input
                    className="h-8"
                    required
                    placeholder="e.g. Transport Allowance"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>

                {form.calculationMethod === "FIXED" ? (
                  <div className="space-y-1">
                    <Label className="text-xs">Amount per period</Label>
                    <Input
                      className="h-8"
                      type="number"
                      min="0"
                      step="0.01"
                      required
                      value={form.amount}
                      onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    />
                  </div>
                ) : (
                  <div className="space-y-1">
                    <Label className="text-xs">Percentage of basic salary (%)</Label>
                    <Input
                      className="h-8"
                      type="number"
                      min="0.01"
                      max="100"
                      step="0.01"
                      required
                      value={form.percentageRate}
                      onChange={(e) => setForm({ ...form, percentageRate: e.target.value })}
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Effective from</Label>
                    <Input
                      className="h-8"
                      type="date"
                      required
                      value={form.startDate}
                      onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Effective to (optional)</Label>
                    <Input
                      className="h-8"
                      type="date"
                      value={form.endDate}
                      onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                    />
                  </div>
                </div>

                <div className="flex gap-4 pt-1">
                  {form.type === "ALLOWANCE" && (
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <Checkbox
                        checked={form.isTaxable}
                        onCheckedChange={(checked) => setForm({ ...form, isTaxable: !!checked })}
                      />
                      Taxable
                    </label>
                  )}
                  {form.type === "DEDUCTION" && (
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <Checkbox
                        checked={form.isTaxDeductible}
                        onCheckedChange={(checked) => setForm({ ...form, isTaxDeductible: !!checked })}
                      />
                      Tax deductible
                    </label>
                  )}
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Applies to</Label>
                  <Select
                    value={form.appliesToAll ? "ALL" : "SELECTED"}
                    onValueChange={(value) =>
                      setForm({
                        ...form,
                        appliesToAll: value === "ALL",
                        employeeIds: value === "ALL" ? [] : form.employeeIds,
                      })
                    }
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All employees (including future hires)</SelectItem>
                      <SelectItem value="SELECTED">Selected employees only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {!form.appliesToAll && (
                  <div className="rounded-lg border max-h-40 overflow-y-auto p-2 space-y-1">
                    {employees.length === 0 ? (
                      <p className="text-xs text-muted-foreground p-2">No employees found.</p>
                    ) : (
                      employees.map((employee: any) => (
                        <label
                          key={employee.id}
                          className="flex items-center gap-2 text-xs cursor-pointer rounded px-1 py-1 hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <Checkbox
                            checked={form.employeeIds.includes(employee.id)}
                            onCheckedChange={(checked) => toggleEmployee(employee.id, !!checked)}
                          />
                          <span>{employee.firstName} {employee.lastName}</span>
                          <span className="text-muted-foreground">· {employee.employeeNumber}</span>
                        </label>
                      ))
                    )}
                  </div>
                )}

                <Button
                  className="w-full"
                  disabled={!canSave || saveMutation.isPending}
                  onClick={() => saveMutation.mutate()}
                >
                  {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editingId ? "Update rule" : "Apply rule"}
                </Button>
              </div>
            </div>

            <div className="rounded-xl border overflow-hidden">
              <div className="p-3 border-b bg-slate-50 dark:bg-slate-900/40">
                <h3 className="text-sm font-semibold">Existing pay rules</h3>
              </div>
              <div className="max-h-[520px] overflow-y-auto">
                {isLoading ? (
                  <div className="p-4"><Loader2 className="h-4 w-4 animate-spin" /></div>
                ) : rules.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-8">
                    No bulk pay rules yet.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Rule</TableHead>
                        <TableHead>Value</TableHead>
                        <TableHead>Target</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rules.map((rule) => (
                        <TableRow key={rule.id} className={cn(!rule.isActive && "opacity-60")}>
                          <TableCell>
                            <div className="font-medium text-xs">{rule.name}</div>
                            <div className="text-[10px] text-muted-foreground">
                              {rule.type} · {rule.calculationMethod === "FIXED" ? "Fixed" : "% of basic"}
                              {format(new Date(rule.startDate), " · MMM yyyy")}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs">
                            {rule.calculationMethod === "FIXED"
                              ? String(rule.amount)
                              : `${rule.percentageRate}%`}
                          </TableCell>
                          <TableCell className="text-xs">
                            {rule.appliesToAll ? "All employees" : `${rule.employeeIds?.length || 0} selected`}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit rule" onClick={() => openEdit(rule)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-rose-600"
                                title="Delete rule"
                                onClick={() => setDeleteTarget(rule)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => (!open && setDeleteTarget(null))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this pay rule?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `${deleteTarget.name} will stop applying to payroll immediately. Already finalized payslips are unchanged.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 text-white hover:bg-rose-700"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
