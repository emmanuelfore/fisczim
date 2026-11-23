import { Fragment, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Plus,
  Loader2,
  Save,
  Calculator,
  Pencil,
  Power,
  PowerOff,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useAuth } from "@/hooks/use-auth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { LoadingRows } from "@/components/ui/page-skeleton";
import { rateAsPercent } from "@shared/statutory/brackets";

type BracketFormRow = {
  min: string;
  max: string;
  rate: string;
  deduction: string;
};

type TaxFormState = {
  currency: string;
  payFrequency: string;
  taxYear: string;
  effectiveFrom: string;
  effectiveTo: string;
  sourceReference: string;
  brackets: BracketFormRow[];
};

const numberText = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "";
  const number = Number(value);
  return Number.isFinite(number) ? String(number) : String(value);
};

const BLANK_BRACKETS: BracketFormRow[] = [
  { min: "0", max: "100", rate: "0", deduction: "0" },
  { min: "100", max: "300", rate: "20", deduction: "20" },
  { min: "300", max: "1000", rate: "25", deduction: "35" },
  { min: "1000", max: "2000", rate: "30", deduction: "85" },
  { min: "2000", max: "3000", rate: "35", deduction: "185" },
  { min: "3000", max: "", rate: "40", deduction: "335" },
];

const BLANK_FORM: TaxFormState = {
  currency: "USD",
  payFrequency: "MONTHLY",
  taxYear: String(new Date().getFullYear()),
  effectiveFrom: new Date().toISOString().slice(0, 10),
  effectiveTo: "",
  sourceReference: "",
  brackets: BLANK_BRACKETS.map((bracket) => ({ ...bracket })),
};

// Pre-fill the new config from the current active one so an empty form can
// never silently zero-out the live PAYE table.
function prefillFromActive(configs: any[]): TaxFormState {
  const active = configs?.find((c) => c.isActive) || configs?.[0];
  if (!active) {
    return {
      ...BLANK_FORM,
      brackets: BLANK_BRACKETS.map((bracket) => ({ ...bracket })),
    };
  }
  return {
    currency: active.currency || "USD",
    payFrequency: active.payFrequency || "MONTHLY",
    taxYear: String(active.taxYear || new Date().getFullYear()),
    effectiveFrom: new Date().toISOString().slice(0, 10),
    effectiveTo: "",
    sourceReference: active.sourceReference || "",
    brackets: (active.brackets || []).map((bracket: any) => ({
      min: numberText(bracket.min),
      max: bracket.max === null || bracket.max === undefined ? "" : numberText(bracket.max),
      rate: numberText(rateAsPercent(bracket.rate)),
      deduction: numberText(bracket.deduction),
    })),
  };
}

function fromConfig(config: any): TaxFormState {
  return {
    currency: config.currency || "USD",
    payFrequency: config.payFrequency || "MONTHLY",
    taxYear: String(config.taxYear || new Date().getFullYear()),
    effectiveFrom: (config.effectiveFrom || new Date().toISOString().slice(0, 10)).slice(0, 10),
    effectiveTo: (config.effectiveTo || "").slice(0, 10),
    sourceReference: config.sourceReference || "",
    brackets: (config.brackets || []).map((bracket: any) => ({
      min: numberText(bracket.min),
      max: bracket.max === null || bracket.max === undefined ? "" : numberText(bracket.max),
      rate: numberText(rateAsPercent(bracket.rate)),
      deduction: numberText(bracket.deduction),
    })),
  };
}

function parseBrackets(brackets: BracketFormRow[]) {
  return brackets.map((bracket) => ({
    min: Number(bracket.min || 0),
    max: bracket.max.trim() === "" ? null : Number(bracket.max),
    rate: Number(bracket.rate || 0),
    deduction: Number(bracket.deduction || 0),
  }));
}

function validateBrackets(brackets: BracketFormRow[]): string | null {
  if (!brackets.length) return "Add at least one tax band.";

  let previousMax: number | null = null;
  brackets.forEach((bracket, index) => {
    const min = Number(bracket.min);
    const max = bracket.max.trim() === "" ? null : Number(bracket.max);
    const rate = Number(bracket.rate);
    const deduction = Number(bracket.deduction);
    const label = `Band ${index + 1}`;

    if (!Number.isFinite(min) || min < 0) throw new Error(`${label}: enter a valid lower income.`);
    if (index === 0 && min !== 0) throw new Error("The first band must start at 0.");
    if (index > 0 && min !== previousMax) throw new Error(`${label}: lower income must equal the previous band's upper income.`);
    if (max !== null && (!Number.isFinite(max) || max <= min)) throw new Error(`${label}: upper income must be greater than lower income.`);
    if (!Number.isFinite(rate) || rate < 0) throw new Error(`${label}: enter a valid tax rate.`);
    if (!Number.isFinite(deduction) || deduction < 0) throw new Error(`${label}: enter a valid deduction.`);
    if (max === null && index !== brackets.length - 1) throw new Error("Only the last band can be open-ended.");
    if (max !== null && index === brackets.length - 1) throw new Error("The last band must be open-ended (leave upper income blank).");
    previousMax = max;
  });

  return null;
}

// The API rejects a bad table with { error, details: string[] } inside the raw
// thrown message; show the band problems rather than a JSON blob.
function readableSaveError(err: any): string {
  const raw = String(err?.message || "Unknown error");
  const match = raw.match(/\{.*\}$/s);
  if (!match) return raw;
  try {
    const body = JSON.parse(match[0]);
    const details = Array.isArray(body.details) ? body.details : null;
    if (details) return details.join(" ");
    return body.message || body.error || raw;
  } catch {
    return raw;
  }
}

const money = (value: unknown, currency: string) => {
  const number = Number(value || 0);
  try {
    return new Intl.NumberFormat("en-ZW", {
      style: "currency",
      currency: currency === "ZiG" ? "ZWG" : currency,
      maximumFractionDigits: 2,
    }).format(number);
  } catch {
    return `${currency} ${number.toLocaleString()}`;
  }
};

export function TaxTablesTab() {
  const { user } = useAuth();
  const { activeCompanyId: companyId } = useActiveCompany(!!user, user?.id ?? null);
  const { toast } = useToast();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [form, setForm] = useState<TaxFormState>(BLANK_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [expandedConfigId, setExpandedConfigId] = useState<number | null>(null);

  const { data: taxConfigs = [], isLoading } = useQuery<any[]>({
    queryKey: [`/api/companies/${companyId}/payroll/tax-config`],
    enabled: !!companyId,
  });

  const saveMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number | null; data: TaxFormState }) => {
      const payload = {
        currency: data.currency,
        payFrequency: data.payFrequency,
        taxYear: Number(data.taxYear),
        effectiveFrom: data.effectiveFrom,
        effectiveTo: data.effectiveTo || null,
        sourceReference: data.sourceReference,
        brackets: parseBrackets(data.brackets),
      };

      const res = id
        ? await apiRequest("PATCH", `/api/companies/${companyId}/payroll/tax-config/${id}`, payload)
        : await apiRequest("POST", `/api/companies/${companyId}/payroll/tax-config`, payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${companyId}/payroll/tax-config`] });
      toast({ title: "Tax configuration saved successfully!" });
      setIsDialogOpen(false);
      setEditingId(null);
      setForm(BLANK_FORM);
    },
    onError: (err: any) => {
      toast({ title: "Failed to save configuration", description: readableSaveError(err), variant: "destructive" });
    }
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, activate }: { id: number; activate: boolean }) => {
      const res = await apiRequest("POST", `/api/companies/${companyId}/payroll/tax-config/${id}/${activate ? "activate" : "deactivate"}`);
      return res.json();
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${companyId}/payroll/tax-config`] });
      toast({ title: vars.activate ? "Configuration activated" : "Configuration deactivated" });
    },
    onError: (err: any) => {
      toast({ title: "Action failed", description: readableSaveError(err), variant: "destructive" });
    }
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const error = validateBrackets(form.brackets);
      if (error) {
        toast({ title: "Check the tax bands", description: error, variant: "destructive" });
        return;
      }
      saveMutation.mutate({ id: editingId, data: form });
    } catch (err: any) {
      toast({ title: "Check the tax bands", description: err?.message || "Invalid tax bands", variant: "destructive" });
    }
  };

  const openEdit = (config: any) => {
    setEditingId(config.id);
    setForm(fromConfig(config));
    setIsDialogOpen(true);
  };

  const updateBracket = (index: number, patch: Partial<BracketFormRow>) => {
    setForm((current) => ({
      ...current,
      brackets: current.brackets.map((bracket, i) => (i === index ? { ...bracket, ...patch } : bracket)),
    }));
  };

  const removeBracket = (index: number) => {
    setForm((current) => {
      if (current.brackets.length <= 1) return current;
      const brackets = current.brackets.filter((_, i) => i !== index);
      brackets[brackets.length - 1] = { ...brackets[brackets.length - 1], max: "" };
      return { ...current, brackets };
    });
  };

  const addBracket = () => {
    setForm((current) => {
      const brackets = current.brackets.map((bracket) => ({ ...bracket }));
      const last = brackets[brackets.length - 1];
      if (last && last.max.trim() === "") return current;
      const nextMin = last ? last.max.trim() : "0";
      if (last) last.max = nextMin;
      brackets.push({ min: nextMin || "0", max: "", rate: "0", deduction: "0" });
      return { ...current, brackets };
    });
  };

  return (
    <div className="flex flex-col gap-6 max-w-6xl mx-auto w-full">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-600 dark:from-slate-100 dark:to-slate-400 tracking-tight">
            Tax Tables
          </h2>
          <p className="text-sm text-slate-500 mt-1">PAYE bands only. NSSA limits and the AIDS levy are set in Statutory Settings.</p>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => { setEditingId(null); setForm(prefillFromActive(taxConfigs)); }} className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md gap-2">
              <Plus className="h-4 w-4" />
              Create New
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl border-slate-200 dark:border-slate-800 shadow-xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-xl">{editingId ? "Edit Tax Configuration" : "Create Tax Configuration"}</DialogTitle>
            </DialogHeader>

            <form onSubmit={handleSave} className="space-y-4 mt-2">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Currency</Label>
                  <Select value={form.currency} onValueChange={e => setForm(f => ({ ...f, currency: e }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="ZiG">ZiG</SelectItem>
                      <SelectItem value="ZWG">ZWG</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Pay frequency</Label>
                  <Select value={form.payFrequency} onValueChange={e => setForm(f => ({ ...f, payFrequency: e }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MONTHLY">Monthly</SelectItem>
                      <SelectItem value="WEEKLY">Weekly</SelectItem>
                      <SelectItem value="FORTNIGHTLY">Fortnightly</SelectItem>
                      <SelectItem value="DAILY">Daily</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Tax year</Label>
                  <Input type="number" required value={form.taxYear} onChange={e => setForm(f => ({ ...f, taxYear: e.target.value }))} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Effective From Date</Label>
                  <Input
                    type="date"
                    required
                    value={form.effectiveFrom}
                    onChange={e => setForm(f => ({ ...f, effectiveFrom: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Effective To Date <span className="text-muted-foreground">(blank = open-ended)</span></Label>
                  <Input
                    type="date"
                    value={form.effectiveTo}
                    onChange={e => setForm(f => ({ ...f, effectiveTo: e.target.value }))}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Source <span className="text-muted-foreground">(which published table or gazette this came from)</span></Label>
                <Input
                  placeholder="e.g. ZIMRA 2026 USD PAYE tax tables — monthly column"
                  value={form.sourceReference}
                  onChange={e => setForm(f => ({ ...f, sourceReference: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label>Tax bands</Label>
                  <span className="text-xs text-muted-foreground">PAYE = income × rate − deduction</span>
                </div>
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-x-auto">
                  <div className="min-w-[680px]">
                    <div className="grid grid-cols-[1fr_1fr_0.7fr_0.9fr_40px] gap-2 bg-slate-50 dark:bg-slate-900/60 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <div>From income</div>
                      <div>To income</div>
                      <div>Rate %</div>
                      <div>Deduction</div>
                      <div />
                    </div>
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                      {form.brackets.map((bracket, index) => (
                        <div key={index} className="grid grid-cols-[1fr_1fr_0.7fr_0.9fr_40px] gap-2 items-center px-3 py-2">
                          <Input
                            inputMode="decimal"
                            aria-label={`Band ${index + 1} lower income`}
                            value={bracket.min}
                            onChange={e => updateBracket(index, { min: e.target.value })}
                          />
                          <Input
                            inputMode="decimal"
                            aria-label={`Band ${index + 1} upper income`}
                            placeholder={index === form.brackets.length - 1 ? "Open-ended" : "Upper limit"}
                            value={bracket.max}
                            onChange={e => updateBracket(index, { max: e.target.value })}
                          />
                          <Input
                            inputMode="decimal"
                            aria-label={`Band ${index + 1} rate percent`}
                            value={bracket.rate}
                            onChange={e => updateBracket(index, { rate: e.target.value })}
                          />
                          <Input
                            inputMode="decimal"
                            aria-label={`Band ${index + 1} deduction`}
                            value={bracket.deduction}
                            onChange={e => updateBracket(index, { deduction: e.target.value })}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-slate-400 hover:text-rose-600"
                            title="Remove band"
                            disabled={form.brackets.length <= 1}
                            onClick={() => removeBracket(index)}
                          >
                            ×
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={addBracket} className="gap-2">
                    <Plus className="h-3.5 w-3.5" /> Add band
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Bands must be contiguous, start at 0, and only the last band can be open-ended.
                    Enter the published table for the selected pay frequency.
                  </p>
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <Button type="submit" disabled={saveMutation.isPending} className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
                  {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save Configuration
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="border-slate-200/60 dark:border-slate-800 shadow-sm overflow-hidden">
        <CardHeader className="bg-slate-50/50 dark:bg-slate-900/20 border-b border-slate-100 dark:border-slate-800 pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <Calculator className="h-5 w-5 text-blue-500" />
            Active & Historical Configurations
          </CardTitle>
          <CardDescription>View all tax configurations over time. Select a configuration to inspect its bands.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="h-48 flex items-center justify-center">
              <LoadingRows rows={4} />
            </div>
          ) : taxConfigs.length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center text-slate-400 space-y-2">
              <Calculator className="h-8 w-8 opacity-20" />
              <p className="text-sm">No tax configurations found.</p>
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-slate-50 dark:bg-slate-900/50">
                <TableRow className="hover:bg-transparent">
                  <TableHead>Effective Period</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Bands</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {taxConfigs.map((config: any) => (
                  <Fragment key={config.id}>
                    <TableRow className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <TableCell className="font-medium">
                        {config.currency} · {new Date(config.effectiveFrom).toLocaleDateString()}
                        {config.effectiveTo
                          ? ` → ${new Date(config.effectiveTo).toLocaleDateString()}`
                          : " → open"}
                        {config.sourceReference && (
                          <p className="mt-0.5 max-w-[28rem] truncate text-xs font-normal text-slate-400">
                            {config.sourceReference}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1">
                          {config.isActive ? (
                            <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400">
                              Active
                            </Badge>
                          ) : (
                            <Badge variant="secondary">Historical</Badge>
                          )}
                          {config.isActive && config.stale && (
                            <Badge variant="outline" className="border-amber-300 text-amber-700 dark:text-amber-400">
                              Tax year {config.taxYear} — confirm no newer table is published
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1 text-slate-600 hover:text-blue-600"
                          onClick={() => setExpandedConfigId(expandedConfigId === config.id ? null : config.id)}
                        >
                          {expandedConfigId === config.id ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                          {Array.isArray(config.brackets) ? config.brackets.length : 0} bands
                        </Button>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-slate-500 hover:text-blue-600"
                            title="Edit configuration"
                            onClick={() => openEdit(config)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {config.isActive ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-slate-500 hover:text-rose-600"
                              title="Deactivate (stop using for new payroll)"
                              disabled={toggleMutation.isPending}
                              onClick={() => toggleMutation.mutate({ id: config.id, activate: false })}
                            >
                              <PowerOff className="h-4 w-4" />
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-slate-500 hover:text-emerald-600"
                              title="Activate (used for payroll from now on)"
                              disabled={toggleMutation.isPending}
                              onClick={() => toggleMutation.mutate({ id: config.id, activate: true })}
                            >
                              <Power className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    {expandedConfigId === config.id && (
                      <TableRow className="bg-slate-50/60 dark:bg-slate-900/30 hover:bg-slate-50/60">
                        <TableCell colSpan={4} className="p-4">
                          {Array.isArray(config.brackets) && config.brackets.length ? (
                            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/40">
                              <div className="min-w-[620px]">
                                <div className="grid grid-cols-[1fr_1fr_0.6fr_0.9fr_1.2fr] gap-3 bg-slate-100/70 dark:bg-slate-900 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                  <div>Taxable income from</div>
                                  <div>Taxable income to</div>
                                  <div>Rate</div>
                                  <div>Deduction</div>
                                  <div>PAYE calculation</div>
                                </div>
                                {config.brackets.map((bracket: any, index: number) => (
                                  <div key={index} className="grid grid-cols-[1fr_1fr_0.6fr_0.9fr_1.2fr] gap-3 px-3 py-2 text-sm border-t border-slate-100 dark:border-slate-800">
                                    <div>{money(bracket.min, config.currency)}</div>
                                    <div>{bracket.max === null || bracket.max === undefined ? "and above" : money(bracket.max, config.currency)}</div>
                                    <div className="font-semibold">{rateAsPercent(Number(bracket.rate || 0))}%</div>
                                    <div>{money(bracket.deduction, config.currency)}</div>
                                    <div className="text-xs text-muted-foreground">
                                      income × {rateAsPercent(Number(bracket.rate || 0))}% − {money(bracket.deduction, config.currency)}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground">No bands stored for this configuration.</p>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
