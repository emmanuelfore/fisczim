import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Settings2, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export function BankExportSettingsModal({ companyId }: { companyId: number }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: company, isLoading } = useQuery({
    queryKey: [`/api/companies/${companyId}`],
    enabled: !!companyId,
  });

  const [columns, setColumns] = useState<any[]>([]);

  useEffect(() => {
    if (company && (company as any).payrollBankExportFormat) {
      setColumns((company as any).payrollBankExportFormat.columns || []);
    } else if (company && !(company as any).payrollBankExportFormat) {
      setColumns([
        { label: "Account Name", field: "employee.lastName" },
        { label: "Account Number", field: "employee.bankAccountNumber" },
        { label: "Bank Name", field: "employee.bankName" },
        { label: "Branch Code", field: "employee.bankBranch" },
        { label: "Amount", field: "runData.netSalary" },
        { label: "Reference", field: "static", value: "SALARY" }
      ]);
    }
  }, [company]);

  const updateCompanyMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await apiRequest("PATCH", `/api/companies/${companyId}`, payload);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Settings saved successfully" });
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${companyId}`] });
      setOpen(false);
    },
    onError: (err: any) => {
      toast({ title: "Failed to save", description: err.message, variant: "destructive" });
    }
  });

  const addColumn = () => {
    setColumns([...columns, { label: "New Column", field: "employee.lastName" }]);
  };

  const removeColumn = (index: number) => {
    setColumns(columns.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    updateCompanyMutation.mutate({
      payrollBankExportFormat: { columns }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Settings2 className="h-4 w-4" />
          CSV Export Layout
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Bank File Format</DialogTitle>
          <DialogDescription>
            Configure the columns included in the generated Bank CSV export file.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-8 text-center">Loading...</div>
        ) : (
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
            {columns.map((col, idx) => (
              <div key={idx} className="flex items-end gap-3 p-3 bg-slate-50 dark:bg-slate-900 rounded-lg border">
                <div className="grid gap-2 flex-1">
                  <Label>CSV Header</Label>
                  <Input 
                    value={col.label} 
                    onChange={e => {
                      const newCols = [...columns];
                      newCols[idx].label = e.target.value;
                      setColumns(newCols);
                    }} 
                  />
                </div>
                <div className="grid gap-2 flex-1">
                  <Label>Data Source</Label>
                  <Select 
                    value={col.field} 
                    onValueChange={v => {
                      const newCols = [...columns];
                      newCols[idx].field = v;
                      setColumns(newCols);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="employee.firstName">First Name</SelectItem>
                      <SelectItem value="employee.lastName">Full Name</SelectItem>
                      <SelectItem value="employee.bankAccountNumber">Bank Account</SelectItem>
                      <SelectItem value="employee.bankName">Bank Name</SelectItem>
                      <SelectItem value="employee.bankBranch">Branch Code</SelectItem>
                      <SelectItem value="runData.netSalary">Net Pay (Amount)</SelectItem>
                      <SelectItem value="static">Static Value</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {col.field === 'static' && (
                  <div className="grid gap-2 flex-1">
                    <Label>Static Value</Label>
                    <Input 
                      value={col.value || ""} 
                      onChange={e => {
                        const newCols = [...columns];
                        newCols[idx].value = e.target.value;
                        setColumns(newCols);
                      }} 
                      placeholder="e.g. SALARY"
                    />
                  </div>
                )}
                <Button variant="ghost" size="icon" onClick={() => removeColumn(idx)} className="text-red-500 mb-0.5 shrink-0">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}

            <Button variant="outline" className="w-full border-dashed gap-2" onClick={addColumn}>
              <Plus className="h-4 w-4" /> Add Column
            </Button>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={updateCompanyMutation.isPending}>
            {updateCompanyMutation.isPending ? "Saving..." : "Save Layout"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
