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
import { Plus, Loader2, Settings2 } from "lucide-react";
import { format } from "date-fns";
import { BankExportSettingsModal } from "@/components/hr/BankExportSettingsModal";

export function StatutoryTab() {
  const { user } = useAuth();
  const { activeCompanyId } = useActiveCompany(!!user, user?.id ?? null);
  const companyId = activeCompanyId ?? null;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    ruleCode: "",
    name: "",
    ruleType: "PERCENTAGE_GROSS",
    effectiveFrom: format(new Date(), "yyyy-MM-dd"),
    rate: "0.00",
  });

  const { data: rules, isLoading } = useQuery<any[]>({
    queryKey: [`/api/companies/${companyId}/payroll/statutory-rules`],
    enabled: !!companyId,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await apiRequest(
        "POST",
        `/api/companies/${companyId}/payroll/statutory-rules`,
        {
          ruleCode: data.ruleCode,
          name: data.name,
          ruleType: data.ruleType,
          effectiveFrom: data.effectiveFrom,
          rate: data.rate,
        }
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/companies/${companyId}/payroll/statutory-rules`],
      });
      setIsOpen(false);
      setFormData({
        ruleCode: "",
        name: "",
        ruleType: "PERCENTAGE_GROSS",
        effectiveFrom: format(new Date(), "yyyy-MM-dd"),
        rate: "0.00",
      });
      toast({ title: "Statutory rule saved successfully" });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not save statutory rule",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(formData);
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
                <Button className="bg-gradient-to-r from-rose-500 to-red-600 text-white shadow-md">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Rule
                </Button>
              </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Create Statutory Rule</DialogTitle>
                <DialogDescription>
                  Define a new statutory calculation rule for the payroll engine.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>Rule Code</Label>
                  <Input
                    required
                    placeholder="e.g. NSSA_POBS"
                    value={formData.ruleCode}
                    onChange={(e) =>
                      setFormData({ ...formData, ruleCode: e.target.value })
                    }
                  />
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
                      <SelectItem value="FIXED_AMOUNT">Fixed Amount</SelectItem>
                      <SelectItem value="PERCENTAGE_GROSS">Percentage of Gross</SelectItem>
                      <SelectItem value="PERCENTAGE_BASIC">Percentage of Basic</SelectItem>
                      <SelectItem value="TIERED_BRACKETS">Tiered Brackets</SelectItem>
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
                    disabled={createMutation.isPending}
                    className="bg-rose-600 hover:bg-rose-700 text-white"
                  >
                    {createMutation.isPending && (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    )}
                    Save Rule
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                    Loading rules...
                  </TableCell>
                </TableRow>
              ) : !rules?.length ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    No statutory rules found.
                  </TableCell>
                </TableRow>
              ) : (
                rules.map((rule: any) => (
                  <TableRow key={rule.id}>
                    <TableCell className="font-medium">
                      {rule.ruleCode}
                    </TableCell>
                    <TableCell>{rule.name}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300">
                        {rule.ruleType}
                      </span>
                    </TableCell>
                    <TableCell>{rule.rate}</TableCell>
                    <TableCell>
                      {rule.effectiveFrom ? format(new Date(rule.effectiveFrom), 'PP') : '-'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
  );
}
