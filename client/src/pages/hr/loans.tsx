import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useActiveCompany } from "@/hooks/use-active-company";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { HRLayout } from "./layout";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Loader2, BadgeDollarSign } from "lucide-react";

export default function LoansSetup() {
  const { user } = useAuth();
  const { activeCompanyId } = useActiveCompany(!!user, user?.id ?? null);
  const companyId = activeCompanyId ?? null;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    employeeId: "",
    principalAmount: "",
    repaymentTermMonths: "",
  });

  const { data: loans, isLoading } = useQuery<any[]>({
    queryKey: [`/api/companies/${companyId}/payroll/loans`],
    enabled: !!companyId,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await apiRequest(
        "POST",
        `/api/companies/${companyId}/payroll/loans`,
        {
          employeeId: Number(data.employeeId),
          principalAmount: data.principalAmount,
          repaymentTermMonths: Number(data.repaymentTermMonths),
          interestRate: "0.00",
        }
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/companies/${companyId}/payroll/loans`],
      });
      setIsOpen(false);
      setFormData({
        employeeId: "",
        principalAmount: "",
        repaymentTermMonths: "",
      });
      toast({ title: "Loan created successfully" });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not create loan",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  const money = (val: string | number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
      Number(val || 0)
    );

  return (
    <HRLayout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-3">
              <BadgeDollarSign className="w-8 h-8 text-indigo-500" />
              Loans & Advances
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage employee loans and advances
            </p>
          </div>

          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-md">
                <Plus className="w-4 h-4 mr-2" />
                New Loan
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Create New Loan</DialogTitle>
                <DialogDescription>
                  Enter the details for the new loan.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="employeeId">Employee ID</Label>
                  <Input
                    id="employeeId"
                    type="number"
                    required
                    value={formData.employeeId}
                    onChange={(e) =>
                      setFormData({ ...formData, employeeId: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="principalAmount">Principal Amount</Label>
                  <Input
                    id="principalAmount"
                    type="number"
                    step="0.01"
                    required
                    value={formData.principalAmount}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        principalAmount: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="repaymentTermMonths">
                    Repayment Term (Months)
                  </Label>
                  <Input
                    id="repaymentTermMonths"
                    type="number"
                    required
                    value={formData.repaymentTermMonths}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        repaymentTermMonths: e.target.value,
                      })
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
                    disabled={createMutation.isPending}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white"
                  >
                    {createMutation.isPending && (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    )}
                    Save
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <Table>
            <TableHeader className="bg-slate-50 dark:bg-slate-800/50">
              <TableRow>
                <TableHead>Employee ID</TableHead>
                <TableHead>Principal Amount</TableHead>
                <TableHead>Term (Months)</TableHead>
                <TableHead>Interest Rate</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                    Loading loans...
                  </TableCell>
                </TableRow>
              ) : !loans?.length ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    No loans found.
                  </TableCell>
                </TableRow>
              ) : (
                loans.map((loan: any) => (
                  <TableRow key={loan.id}>
                    <TableCell className="font-medium">
                      {loan.employeeId}
                    </TableCell>
                    <TableCell>{money(loan.principalAmount)}</TableCell>
                    <TableCell>{loan.repaymentTermMonths} months</TableCell>
                    <TableCell>{loan.interestRate}%</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">
                        {loan.status || "ACTIVE"}
                      </span>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </HRLayout>
  );
}
