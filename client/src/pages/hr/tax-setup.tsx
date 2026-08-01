import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Loader2, Save, Calculator, Pencil, Power, PowerOff } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useAuth } from "@/hooks/use-auth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

const BLANK_FORM = {
  effectiveFrom: new Date().toISOString().slice(0, 10),
  nssaRateEmployee: 0.045,
  nssaRateEmployer: 0.045,
  nssaCeilingLimit: 700.00,
  aidsLevyRate: 0.03,
  brackets: `[\n  { "min": 0, "max": null, "rate": 0, "deduction": 0 }\n]`
};

// Pre-fill the new config from the current active one so an empty form can
// never silently zero-out the live PAYE table.
function prefillFromActive(configs: any[]): typeof BLANK_FORM {
  const active = configs?.find((c) => c.isActive) || configs?.[0];
  if (!active) return BLANK_FORM;
  return {
    effectiveFrom: new Date().toISOString().slice(0, 10),
    nssaRateEmployee: Number(active.nssaRateEmployee || 0.045),
    nssaRateEmployer: Number(active.nssaRateEmployer || 0.045),
    nssaCeilingLimit: Number(active.nssaCeilingLimit || 700),
    aidsLevyRate: Number(active.aidsLevyRate || 0.03),
    brackets: JSON.stringify(active.brackets || [], null, 2),
  };
}

function fromConfig(config: any): typeof BLANK_FORM {
  return {
    effectiveFrom: (config.effectiveFrom || new Date().toISOString().slice(0, 10)).slice(0, 10),
    nssaRateEmployee: Number(config.nssaRateEmployee || 0.045),
    nssaRateEmployer: Number(config.nssaRateEmployer || 0.045),
    nssaCeilingLimit: Number(config.nssaCeilingLimit || 700),
    aidsLevyRate: Number(config.aidsLevyRate || 0.03),
    brackets: JSON.stringify(config.brackets || [], null, 2),
  };
}

export function TaxTablesTab() {
  const { user } = useAuth();
  const { activeCompanyId: companyId } = useActiveCompany(!!user, user?.id ?? null);
  const { toast } = useToast();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);

  const { data: taxConfigs = [], isLoading } = useQuery<any[]>({
    queryKey: [`/api/companies/${companyId}/payroll/tax-config`],
    enabled: !!companyId,
  });

  const saveMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number | null; data: any }) => {
      // Parse brackets back to JSON
      let parsedBrackets;
      try {
        parsedBrackets = JSON.parse(data.brackets);
      } catch (err) {
        throw new Error("Invalid JSON format for Brackets.");
      }

      const payload = {
        ...data,
        nssaRateEmployee: Number(data.nssaRateEmployee),
        nssaRateEmployer: Number(data.nssaRateEmployer),
        nssaCeilingLimit: Number(data.nssaCeilingLimit),
        aidsLevyRate: Number(data.aidsLevyRate),
        brackets: parsedBrackets,
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
      toast({ title: "Failed to save configuration", description: err.message, variant: "destructive" });
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
      toast({ title: "Action failed", description: err.message, variant: "destructive" });
    }
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate({ id: editingId, data: form });
  };

  const openEdit = (config: any) => {
    setEditingId(config.id);
    setForm(fromConfig(config));
    setIsDialogOpen(true);
  };

  return (
    <div className="flex flex-col gap-6 max-w-6xl mx-auto w-full">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-600 dark:from-slate-100 dark:to-slate-400 tracking-tight">
            Tax Tables
          </h2>
          <p className="text-sm text-slate-500 mt-1">Manage PAYE tax tables, NSSA limits, and AIDS levy rates.</p>
        </div>
          
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => { setEditingId(null); setForm(prefillFromActive(taxConfigs)); }} className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md gap-2">
                <Plus className="h-4 w-4" />
                Create New
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl border-slate-200 dark:border-slate-800 shadow-xl">
              <DialogHeader>
                <DialogTitle className="text-xl">{editingId ? "Edit Tax Configuration" : "Create Tax Configuration"}</DialogTitle>
              </DialogHeader>
              
              <form onSubmit={handleSave} className="space-y-4 mt-2">
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
                    <Label>NSSA Ceiling Limit (USD)</Label>
                    <Input 
                      type="number" 
                      step="0.01" 
                      required
                      value={form.nssaCeilingLimit} 
                      onChange={e => setForm(f => ({ ...f, nssaCeilingLimit: parseFloat(e.target.value) || 0 }))} 
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>NSSA Rate Employee</Label>
                    <Input 
                      type="number" 
                      step="0.0001" 
                      required
                      value={form.nssaRateEmployee} 
                      onChange={e => setForm(f => ({ ...f, nssaRateEmployee: parseFloat(e.target.value) || 0 }))} 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>NSSA Rate Employer</Label>
                    <Input 
                      type="number" 
                      step="0.0001" 
                      required
                      value={form.nssaRateEmployer} 
                      onChange={e => setForm(f => ({ ...f, nssaRateEmployer: parseFloat(e.target.value) || 0 }))} 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>AIDS Levy Rate</Label>
                    <Input 
                      type="number" 
                      step="0.0001" 
                      required
                      value={form.aidsLevyRate} 
                      onChange={e => setForm(f => ({ ...f, aidsLevyRate: parseFloat(e.target.value) || 0 }))} 
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Tax Brackets (JSON format)</Label>
                  <Textarea 
                    required
                    rows={8}
                    className="font-mono text-sm bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                    value={form.brackets}
                    onChange={e => setForm(f => ({ ...f, brackets: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">Example: {`[{"min":0,"max":100,"rate":0,"deduction":0}]`}</p>
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
            <CardDescription>View all tax configurations over time.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="h-48 flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
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
                    <TableHead>Effective Date</TableHead>
                    <TableHead>NSSA Ceil.</TableHead>
                    <TableHead>NSSA (Emp)</TableHead>
                    <TableHead>NSSA (Er)</TableHead>
                    <TableHead>AIDS Levy</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Brackets</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {taxConfigs.map((config: any) => (
                    <TableRow key={config.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <TableCell className="font-medium">
                        {new Date(config.effectiveFrom).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="font-mono text-slate-600 dark:text-slate-300">
                        ${Number(config.nssaCeilingLimit).toFixed(2)}
                      </TableCell>
                      <TableCell>{(Number(config.nssaRateEmployee) * 100).toFixed(2)}%</TableCell>
                      <TableCell>{(Number(config.nssaRateEmployer) * 100).toFixed(2)}%</TableCell>
                      <TableCell>{(Number(config.aidsLevyRate) * 100).toFixed(2)}%</TableCell>
                      <TableCell>
                        {config.isActive ? (
                          <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400">
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Historical</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="outline" className="font-mono text-xs">
                          {Array.isArray(config.brackets) ? config.brackets.length : 0} Bands
                        </Badge>
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
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
  );
}
