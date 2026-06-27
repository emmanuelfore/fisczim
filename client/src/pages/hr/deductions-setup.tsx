import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Search, Loader2, Save } from "lucide-react";
import { HRLayout } from "./layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

const CAT_COLORS: Record<string, string> = {
  STATUTORY: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
  COMPANY: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  VOLUNTARY: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  OTHER: "bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-400",
};

const BLANK_FORM = {
  code: "",
  name: "",
  category: "STATUTORY",
  timing: "PRE_TAX",
  employeeRate: "0",
};

export default function DeductionsSetup() {
  const { user } = useAuth();
  const { activeCompanyId } = useActiveCompany(!!user, user?.id ?? null);
  const companyId = activeCompanyId ?? null;
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);

  const { data: deductionTypes = [], isLoading } = useQuery({
    queryKey: [`/api/companies/${companyId}/payroll/deduction-types`],
    enabled: !!companyId,
  });

  const saveMutation = useMutation({
    mutationFn: async (data: typeof BLANK_FORM) => {
      const res = await apiRequest("POST", `/api/companies/${companyId}/payroll/deduction-types`, {
        ...data,
        companyId,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${companyId}/payroll/deduction-types`] });
      toast({ title: "Saved successfully" });
      setIsModalOpen(false);
      setForm(BLANK_FORM);
    },
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const filtered = (deductionTypes as any[]).filter((d: any) => {
    const q = search.toLowerCase();
    return !q || d.name?.toLowerCase().includes(q) || d.code?.toLowerCase().includes(q);
  });

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    saveMutation.mutate(form);
  }

  return (
    <HRLayout>
      <div className="flex flex-col gap-6 max-w-7xl mx-auto w-full">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-600 dark:from-slate-100 dark:to-slate-400">Deductions Setup</h1>
            <p className="text-sm text-muted-foreground mt-1">Configure company-wide payroll deductions</p>
          </div>

          <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => setForm(BLANK_FORM)} className="bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white shadow-md shadow-indigo-200 dark:shadow-none gap-2">
                <Plus className="h-4 w-4" /> Create New
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Add Deduction Type</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSave} className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>Code</Label>
                  <Input 
                    required 
                    value={form.code} 
                    onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} 
                    placeholder="e.g. NSSA"
                    className="font-mono uppercase" 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input 
                    required 
                    value={form.name} 
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))} 
                    placeholder="e.g. National Social Security" 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="STATUTORY">Statutory</SelectItem>
                      <SelectItem value="COMPANY">Company</SelectItem>
                      <SelectItem value="VOLUNTARY">Voluntary</SelectItem>
                      <SelectItem value="OTHER">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Timing</Label>
                  <Select value={form.timing} onValueChange={v => setForm(f => ({ ...f, timing: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PRE_TAX">Pre-Tax</SelectItem>
                      <SelectItem value="POST_TAX">Post-Tax</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Employee Rate (%)</Label>
                  <Input 
                    type="number" 
                    step="0.01" 
                    value={form.employeeRate} 
                    onChange={e => setForm(f => ({ ...f, employeeRate: e.target.value }))} 
                    className="font-mono"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={saveMutation.isPending} className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
                    {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save Record
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Card className="border-slate-200/60 dark:border-slate-800 shadow-sm overflow-hidden">
          <CardHeader className="bg-slate-50/50 dark:bg-slate-900/20 border-b border-slate-100 dark:border-slate-800 py-3">
            <div className="flex items-center gap-2 max-w-sm">
              <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input 
                  placeholder="Search deductions..." 
                  value={search} 
                  onChange={e => setSearch(e.target.value)}
                  className="pl-9 h-9 bg-white dark:bg-slate-950" 
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 dark:bg-slate-900/50 hover:bg-slate-50 dark:hover:bg-slate-900/50">
                  <TableHead className="w-[100px]">Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Timing</TableHead>
                  <TableHead className="text-right">Employee Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                      Loading records...
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                      No deductions found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((d: any) => (
                    <TableRow key={d.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <TableCell className="font-mono font-medium text-slate-700 dark:text-slate-300">{d.code}</TableCell>
                      <TableCell className="font-medium text-slate-900 dark:text-slate-100">{d.name}</TableCell>
                      <TableCell>
                        <Badge className={cn("font-medium", CAT_COLORS[d.category] || CAT_COLORS.OTHER)}>
                          {d.category}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-slate-500">{d.timing.replace('_', '-')}</TableCell>
                      <TableCell className="text-right font-mono">
                        {d.employeeRate && Number(d.employeeRate) > 0 ? `${Number(d.employeeRate).toFixed(2)}%` : "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </HRLayout>
  );
}
