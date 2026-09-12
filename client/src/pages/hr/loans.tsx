import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useActiveCompany } from "@/hooks/use-active-company";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Banknote, Landmark, Loader2 } from "lucide-react";
import { HRLayout } from "./layout";

export default function LoansAdvances() {
  const { activeCompanyId: companyId } = useActiveCompany();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  const [formData, setFormData] = useState({
    employeeId: "",
    type: "LOAN",
    principalAmount: "",
    monthlyRepaymentAmount: "",
    issueDate: new Date().toISOString().slice(0, 10),
    notes: ""
  });

  const { data: loans = [], isLoading } = useQuery<any[]>({
    queryKey: [`/api/companies/${companyId}/payroll/loans`],
    enabled: !!companyId,
  });

  const { data: employees = [] } = useQuery<any[]>({
    queryKey: [`/api/companies/${companyId}/payroll/employees`],
    enabled: !!companyId,
  });

  const createLoanMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      // Calculate repayment term dynamically
      const principal = parseFloat(data.principalAmount);
      const monthly = parseFloat(data.monthlyRepaymentAmount);
      const months = Math.ceil(principal / monthly);
      
      const res = await apiRequest("POST", `/api/companies/${companyId}/payroll/loans`, {
        employeeId: Number(data.employeeId),
        loanType: data.type,
        principalAmount: data.principalAmount,
        monthlyRepaymentAmount: data.monthlyRepaymentAmount,
        repaymentTermMonths: months || 1,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${companyId}/payroll/loans`] });
      setIsModalOpen(false);
      setFormData({
        employeeId: "",
        type: "LOAN",
        principalAmount: "",
        monthlyRepaymentAmount: "",
        issueDate: new Date().toISOString().slice(0, 10),
        notes: ""
      });
      toast({ title: "Loan/Advance created successfully" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to create", description: err.message, variant: "destructive" });
    }
  });

  const approveLoanMutation = useMutation({
    mutationFn: async (loanId: number) => {
      const res = await apiRequest("POST", `/api/companies/${companyId}/payroll/loans/${loanId}/approve`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${companyId}/payroll/loans`] });
      toast({ title: "Loan approved & activated" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to approve", description: err.message, variant: "destructive" });
    }
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createLoanMutation.mutate(formData);
  };

  if (!companyId) return <HRLayout><div>Please select a company first.</div></HRLayout>;

  return (
    <HRLayout>
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Loans & Advances</h1>
          <p className="text-sm text-slate-500">Manage employee loans and salary advances</p>
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white">
          <Plus className="mr-2 h-4 w-4" /> Issue Loan / Advance
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <Card className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 shadow-sm">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <Landmark className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Active Loans</p>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white">
                {loans.filter((l: any) => l.status === "ACTIVE" && l.loanType === "LOAN").length}
              </h3>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 shadow-sm">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
              <Banknote className="h-6 w-6 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Active Advances</p>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white">
                {loans.filter((l: any) => l.status === "ACTIVE" && l.loanType === "ADVANCE").length}
              </h3>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 shadow-sm">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg">
              <Banknote className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Total Outstanding</p>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white">
                $ {loans.filter((l: any) => l.status === "ACTIVE").reduce((sum: number, l: any) => sum + Number(l.remainingBalance), 0).toFixed(2)}
              </h3>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 shadow-sm">
        <CardHeader className="border-b border-slate-100 dark:border-slate-800 pb-4">
          <CardTitle>Loan Ledgers</CardTitle>
          <CardDescription>All issued loans and their remaining balances</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50 dark:bg-slate-900/50">
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Principal</TableHead>
                  <TableHead>Monthly Deduct</TableHead>
                  <TableHead>Balance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto text-blue-500" />
                    </TableCell>
                  </TableRow>
                ) : loans.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center text-slate-500">
                      No loans or advances found.
                    </TableCell>
                  </TableRow>
                ) : (
                  loans.map((loan: any) => {
                    const emp = employees.find((e: any) => e.id === loan.employeeId);
                    return (
                      <TableRow key={loan.id}>
                        <TableCell className="font-medium">
                          {emp ? `${emp.firstName} ${emp.lastName}` : `Emp #${loan.employeeId}`}
                        </TableCell>
                        <TableCell>
                          <Badge variant={loan.loanType === "ADVANCE" ? "secondary" : "outline"} className="text-xs">
                            {loan.loanType}
                          </Badge>
                        </TableCell>
                        <TableCell>$ {Number(loan.principalAmount).toFixed(2)}</TableCell>
                        <TableCell>$ {Number(loan.monthlyRepaymentAmount).toFixed(2)}</TableCell>
                        <TableCell className="font-semibold">
                          $ {Number(loan.remainingBalance).toFixed(2)}
                        </TableCell>
                        <TableCell>
                          <Badge className={loan.status === "ACTIVE" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-700"}>
                            {loan.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {loan.status === "PENDING" && (
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="text-green-600 hover:text-green-700 border-green-200"
                              disabled={approveLoanMutation.isPending}
                              onClick={() => approveLoanMutation.mutate(loan.id)}
                            >
                              Approve
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Issue Loan or Advance</DialogTitle>
            <DialogDescription>
              Record a new cash issuance to an employee. Deductions will automatically apply in the next payroll run.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>Employee</Label>
              <Select value={formData.employeeId} onValueChange={(v) => setFormData({...formData, employeeId: v})}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Employee" />
                </SelectTrigger>
                <SelectContent>
                  {employees.filter((e: any) => e.status === "ACTIVE").map((emp: any) => (
                    <SelectItem key={emp.id} value={String(emp.id)}>
                      {emp.firstName} {emp.lastName} ({emp.employeeNumber})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={formData.type} onValueChange={(v) => setFormData({...formData, type: v})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOAN">Loan (Long-term)</SelectItem>
                    <SelectItem value="ADVANCE">Advance (Short-term)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Issue Date</Label>
                <Input type="date" required value={formData.issueDate} onChange={(e) => setFormData({...formData, issueDate: e.target.value})} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Principal Amount ($)</Label>
                <Input type="number" step="0.01" required value={formData.principalAmount} onChange={(e) => setFormData({...formData, principalAmount: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>Monthly Deduction ($)</Label>
                <Input type="number" step="0.01" required value={formData.monthlyRepaymentAmount} onChange={(e) => setFormData({...formData, monthlyRepaymentAmount: e.target.value})} />
                <p className="text-xs text-slate-500">Amount docked per payslip</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Input placeholder="Reason or reference..." value={formData.notes} onChange={(e) => setFormData({...formData, notes: e.target.value})} />
            </div>
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createLoanMutation.isPending} className="bg-blue-600 hover:bg-blue-700 text-white">
                {createLoanMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Issue {formData.type === "LOAN" ? "Loan" : "Advance"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
    </HRLayout>
  );
}
