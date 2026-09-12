import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Search, RefreshCw, Loader2, Save, FileSpreadsheet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

const CATEGORY_COLORS: Record<string, string> = {
  BASIC:      "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  ALLOWANCE:  "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  BENEFIT:    "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  OVERTIME:   "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  BONUS:      "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  COMMISSION: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400",
  BACK_PAY:   "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
  LEAVE_PAY:  "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
  OTHER:      "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

const BLANK_FORM = {
  code: "",
  name: "",
  category: "ALLOWANCE",
  taxTreatment: "TAXABLE",
  isNssaApplicable: false,
  isRecurring: false,
  effectiveFrom: new Date().toISOString().slice(0, 10),
  isActive: true,
};

function YesNoBadge({ value }: { value: boolean }) {
  return value ? (
    <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px] px-1.5 py-0 border-0">
      YES
    </Badge>
  ) : (
    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 border-0 text-slate-500">
      NO
    </Badge>
  );
}

export function IncomesTab() {
  const { user } = useAuth();
  const { activeCompanyId } = useActiveCompany(!!user, user?.id ?? null);
  const companyId = activeCompanyId ?? null;
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState<any>({ ...BLANK_FORM });
  const [editingId, setEditingId] = useState<number | null>(null);

  const { data: earningTypes = [], isLoading, refetch } = useQuery({
    queryKey: [`/api/companies/${companyId}/payroll/earning-types`],
    enabled: !!companyId,
  });

  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      const url = editingId
        ? `/api/companies/${companyId}/payroll/earning-types/${editingId}`
        : `/api/companies/${companyId}/payroll/earning-types`;
      const method = editingId ? "PATCH" : "POST";
      return (await apiRequest(method, url, data)).json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${companyId}/payroll/earning-types`] });
      toast({ title: "Saved successfully", description: "The earning type has been saved." });
      setIsModalOpen(false);
    },
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const filtered = (earningTypes as any[]).filter((et: any) => {
    const q = search.toLowerCase();
    return !q || et.name?.toLowerCase().includes(q) || et.code?.toLowerCase().includes(q);
  });

  function openNewModal() {
    setEditingId(null);
    setForm({ ...BLANK_FORM });
    setIsModalOpen(true);
  }

  function openEditModal(et: any) {
    setEditingId(et.id);
    setForm({
      code: et.code ?? "",
      name: et.name ?? "",
      category: et.category ?? "ALLOWANCE",
      taxTreatment: et.taxTreatment ?? "TAXABLE",
      isNssaApplicable: !!et.isNssaApplicable,
      isRecurring: !!et.isRecurring,
      effectiveFrom: et.effectiveFrom ?? BLANK_FORM.effectiveFrom,
      isActive: !!et.isActive,
    });
    setIsModalOpen(true);
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    saveMutation.mutate({ ...form, companyId });
  }

  return (
    <div className="flex flex-col gap-6 h-full">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <FileSpreadsheet className="h-6 w-6 text-blue-600 dark:text-blue-500" />
            Earnings
          </h2>
          <p className="text-sm text-muted-foreground mt-1">Configure earning types and income categories for your payroll.</p>
        </div>
          <div className="flex items-center gap-2">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input 
                placeholder="Search incomes..." 
                value={search} 
                onChange={e => setSearch(e.target.value)}
                className="pl-9 h-10 bg-white/50 dark:bg-slate-950/50 backdrop-blur-sm border-slate-200 dark:border-slate-800"
              />
            </div>
            <Button variant="outline" size="icon" onClick={() => refetch()} className="h-10 w-10 shrink-0">
              <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
            </Button>
            <Button onClick={openNewModal} className="h-10 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md shadow-blue-500/20">
              <Plus className="h-4 w-4 mr-2" /> Create New
            </Button>
          </div>
        </div>

        {/* Data Table Card */}
        <Card className="border-slate-200/60 dark:border-slate-800/60 shadow-sm backdrop-blur-xl bg-white/50 dark:bg-slate-900/50">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50/50 dark:bg-slate-800/50 backdrop-blur-sm sticky top-0 z-10">
                  <TableRow className="border-slate-200 dark:border-slate-800">
                    <TableHead className="w-[100px] font-semibold text-slate-600 dark:text-slate-300">Code</TableHead>
                    <TableHead className="font-semibold text-slate-600 dark:text-slate-300">Name</TableHead>
                    <TableHead className="font-semibold text-slate-600 dark:text-slate-300">Category</TableHead>
                    <TableHead className="font-semibold text-slate-600 dark:text-slate-300">Tax Treatment</TableHead>
                    <TableHead className="text-center font-semibold text-slate-600 dark:text-slate-300">NSSA</TableHead>
                    <TableHead className="text-center font-semibold text-slate-600 dark:text-slate-300">Recurring</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-32 text-center">
                        <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                          <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                          <span>Loading earning types...</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-32 text-center">
                        <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                          <FileSpreadsheet className="h-8 w-8 text-slate-300 dark:text-slate-600" />
                          <span>No income records found.</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((et: any) => (
                      <TableRow 
                        key={et.id} 
                        onClick={() => openEditModal(et)}
                        className="cursor-pointer group hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors border-slate-100 dark:border-slate-800"
                      >
                        <TableCell className="font-mono text-xs font-medium text-slate-600 dark:text-slate-300">
                          {et.code}
                        </TableCell>
                        <TableCell className="font-medium text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                          {et.name}
                        </TableCell>
                        <TableCell>
                          <Badge className={cn("text-[10px] uppercase tracking-wider font-semibold border-0", CATEGORY_COLORS[et.category] ?? CATEGORY_COLORS.OTHER)}>
                            {et.category?.replace("_", " ")}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("text-[10px] font-medium border-slate-200 dark:border-slate-700", et.taxTreatment === 'TAXABLE' ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400')}>
                            {et.taxTreatment?.replace("_", " ")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <YesNoBadge value={!!et.isNssaApplicable} />
                        </TableCell>
                        <TableCell className="text-center">
                          <YesNoBadge value={!!et.isRecurring} />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Create/Edit Modal */}
        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogContent className="sm:max-w-[500px] p-0 overflow-hidden border-slate-200/60 dark:border-slate-800 shadow-2xl">
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/40 px-6 py-4 border-b border-blue-100 dark:border-blue-900/30">
              <DialogTitle className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {editingId ? "Edit Income Type" : "Create New Income Type"}
              </DialogTitle>
              <DialogDescription className="text-sm mt-1">
                Fill in the details below to configure this earning component.
              </DialogDescription>
            </div>
            
            <form onSubmit={handleSave} className="px-6 py-4 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="code" className="text-xs font-semibold text-slate-600 dark:text-slate-300">Code</Label>
                  <Input 
                    id="code"
                    required
                    value={form.code} 
                    onChange={e => setForm((f: any) => ({ ...f, code: e.target.value.toUpperCase() }))} 
                    className="font-mono text-sm h-9" 
                    placeholder="e.g. TRANSPORT" 
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="category" className="text-xs font-semibold text-slate-600 dark:text-slate-300">Category</Label>
                  <Select value={form.category} onValueChange={v => setForm((f: any) => ({ ...f, category: v }))}>
                    <SelectTrigger id="category" className="h-9">
                      <SelectValue placeholder="Select Category" />
                    </SelectTrigger>
                    <SelectContent>
                      {["BASIC","ALLOWANCE","BENEFIT","OVERTIME","BONUS","COMMISSION","BACK_PAY","LEAVE_PAY","OTHER"].map(c => (
                        <SelectItem key={c} value={c} className="text-sm">{c.replace("_", " ")}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="name" className="text-xs font-semibold text-slate-600 dark:text-slate-300">Name</Label>
                <Input 
                  id="name"
                  required 
                  value={form.name} 
                  onChange={e => setForm((f: any) => ({ ...f, name: e.target.value }))} 
                  className="h-9" 
                  placeholder="e.g. Transport Allowance"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="taxTreatment" className="text-xs font-semibold text-slate-600 dark:text-slate-300">Tax Treatment</Label>
                <Select value={form.taxTreatment} onValueChange={v => setForm((f: any) => ({ ...f, taxTreatment: v }))}>
                  <SelectTrigger id="taxTreatment" className="h-9">
                    <SelectValue placeholder="Select Treatment" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TAXABLE">Taxable</SelectItem>
                    <SelectItem value="NON_TAXABLE">Non-Taxable</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800 space-y-4">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Applicability Rules</h4>
                
                <div className="flex items-center space-x-3">
                  <Checkbox 
                    id="isNssaApplicable" 
                    checked={form.isNssaApplicable} 
                    onCheckedChange={(c) => setForm((f: any) => ({ ...f, isNssaApplicable: c === true }))}
                    className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                  />
                  <div className="space-y-1 leading-none">
                    <Label htmlFor="isNssaApplicable" className="text-sm font-medium cursor-pointer">
                      NSSA Applicable
                    </Label>
                    <p className="text-xs text-muted-foreground">Is this income subject to NSSA contributions?</p>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <Checkbox 
                    id="isRecurring" 
                    checked={form.isRecurring} 
                    onCheckedChange={(c) => setForm((f: any) => ({ ...f, isRecurring: c === true }))}
                    className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                  />
                  <div className="space-y-1 leading-none">
                    <Label htmlFor="isRecurring" className="text-sm font-medium cursor-pointer">
                      Recurring Income
                    </Label>
                    <p className="text-xs text-muted-foreground">Does this income recur every pay period?</p>
                  </div>
                </div>
              </div>

              <DialogFooter className="pt-2">
                <DialogClose asChild>
                  <Button type="button" variant="outline" className="h-9">Cancel</Button>
                </DialogClose>
                <Button 
                  type="submit" 
                  disabled={saveMutation.isPending}
                  className="h-9 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white min-w-[100px]"
                >
                  {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                  Save
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
  );
}
