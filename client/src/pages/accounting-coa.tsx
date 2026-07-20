import { Layout } from "@/components/layout";
import { useQuery } from "@tanstack/react-query";
import { type Account } from "@shared/schema";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Eye, Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useLocation } from "wouter";

const ACCOUNT_CATEGORIES = {
  ASSET: ["Current Assets", "Non-current Assets"],
  LIABILITY: ["Current Liabilities", "Non-current Liabilities"],
  EQUITY: ["Equity"],
  REVENUE: ["Revenue", "Other Income"],
  EXPENSE: [
    "Cost of Sales",
    "Operating Expenses",
    "Finance Costs",
    "Other Expenses",
  ],
} as const;

type AccountType = keyof typeof ACCOUNT_CATEGORIES;

function getAccountCodeRange(type: string, category: string) {
  if (type === "ASSET") {
    return category === "Non-current Assets"
      ? { start: 1500, end: 1999 }
      : { start: 1000, end: 1499 };
  }
  if (type === "LIABILITY") {
    return category === "Non-current Liabilities"
      ? { start: 2300, end: 2999 }
      : { start: 2000, end: 2299 };
  }
  if (type === "EQUITY") return { start: 3000, end: 3999 };
  if (type === "REVENUE")
    return category === "Other Income"
      ? { start: 4200, end: 4999 }
      : { start: 4000, end: 4199 };
  if (type === "EXPENSE") {
    if (category === "Cost of Sales") return { start: 5000, end: 5099 };
    if (category === "Finance Costs") return { start: 5150, end: 5899 };
    if (category === "Other Expenses") return { start: 5900, end: 5999 };
    return { start: 5100, end: 5899 };
  }
  return { start: 9000, end: 9999 };
}

function getNextAccountCode(
  accounts: Account[] | undefined,
  type: string,
  category: string,
) {
  const range = getAccountCodeRange(type, category);
  const usedCodes = new Set((accounts || []).map((account) => account.code));
  const codesInRange = (accounts || [])
    .map((account) => Number(account.code))
    .filter(
      (code) =>
        Number.isFinite(code) && code >= range.start && code <= range.end,
    );

  let nextCode =
    codesInRange.length > 0 ? Math.max(...codesInRange) + 10 : range.start;
  while (usedCodes.has(String(nextCode)) && nextCode <= range.end) {
    nextCode += 10;
  }
  return nextCode <= range.end ? String(nextCode) : "";
}

export default function AccountingCOAPage() {
  const [searchTerm, setSearchState] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    code: "",
    name: "",
    description: "",
    type: "ASSET",
    category: "Current Assets",
    subType: "Current",
    normalBalance: "DEBIT",
    ifrsMappingTag: "",
    defaultSegmentId: undefined as number | undefined,
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { activeCompanyId: companyId, isLoading: isCompanyLoading } =
    useActiveCompany();
  const [, setLocation] = useLocation();

  const { data: accounts, isLoading } = useQuery<Account[]>({
    queryKey: ["/api/accounting/accounts", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const res = await apiFetch(
        `/api/companies/${companyId}/accounting/accounts`,
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(err.message || "Failed to load chart of accounts");
      }
      return res.json();
    },
  });

  const { data: segments } = useQuery<any[]>({
    queryKey: ["/api/accounting/segments", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const res = await apiFetch(`/api/companies/${companyId}/accounting/segments`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      if (!companyId) throw new Error("No company selected");
      const res = await apiFetch(
        `/api/companies/${companyId}/accounting/accounts`,
        {
          method: "POST",
          body: JSON.stringify(data),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(err.message || "Failed to create account");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/accounting/accounts", companyId],
      });
      toast({ title: "Success", description: "Account created successfully" });
      setIsDialogOpen(false);
      setFormData({
        code: "",
        name: "",
        description: "",
        type: "ASSET",
        category: "Current Assets",
        subType: "Current",
        normalBalance: "DEBIT",
        ifrsMappingTag: "",
        defaultSegmentId: undefined,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create account",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  const categoryOptions =
    ACCOUNT_CATEGORIES[formData.type as AccountType] ||
    ACCOUNT_CATEGORIES.ASSET;
  const suggestedCode = getNextAccountCode(
    accounts,
    formData.type,
    formData.category,
  );

  useEffect(() => {
    if (!isDialogOpen) return;
    setFormData((current) => ({
      ...current,
      code: getNextAccountCode(accounts, current.type, current.category),
    }));
  }, [accounts, isDialogOpen]);

  const filteredAccounts = accounts?.filter(
    (acc) =>
      acc.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      acc.code.includes(searchTerm) ||
      acc.type.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const getTypeBadgeColor = (type: string) => {
    switch (type) {
      case "ASSET":
        return "bg-blue-100 text-blue-800 border-blue-200";
      case "LIABILITY":
        return "bg-amber-100 text-amber-800 border-amber-200";
      case "EQUITY":
        return "bg-purple-100 text-purple-800 border-purple-200";
      case "REVENUE":
        return "bg-emerald-100 text-emerald-800 border-emerald-200";
      case "EXPENSE":
        return "bg-rose-100 text-rose-800 border-rose-200";
      default:
        return "bg-slate-100 text-slate-800 border-slate-200";
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="h-10 w-10 shrink-0 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <Search className="h-5 w-5" />
            </div>
            <div className="relative group w-full sm:w-[320px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-primary transition-colors" />
              <Input
                placeholder="Search accounts by name, code or type..."
                className="pl-9 h-11 bg-white border-slate-200 rounded-xl shadow-sm focus:ring-primary/20"
                value={searchTerm}
                onChange={(e) => setSearchState(e.target.value)}
              />
            </div>
          </div>
          <Dialog
            open={isDialogOpen}
            onOpenChange={(open) => {
              setIsDialogOpen(open);
              if (open) {
                setFormData((current) => ({
                  ...current,
                  code: getNextAccountCode(
                    accounts,
                    current.type,
                    current.category,
                  ),
                }));
              }
            }}
          >
            <DialogTrigger asChild>
              <Button className="w-full sm:w-auto h-11 px-6 rounded-xl font-bold bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20 transition-all active:scale-95 flex items-center justify-center gap-2">
                <Plus className="h-4 w-4" />
                <span>Create Account</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[625px]">
              <DialogHeader>
                <DialogTitle>Create New Account</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 pt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Account Code</Label>
                    <Input
                      disabled
                      value={formData.code}
                      placeholder={suggestedCode || "Auto-generated"}
                      className="bg-slate-50 cursor-not-allowed text-slate-500 font-medium"
                    />
                    <p className="text-[11px] text-slate-400">
                      Automatically generated based on type/category.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Account Name</Label>
                    <Input
                      required
                      value={formData.name}
                      onChange={(e) =>
                        setFormData((p) => ({ ...p, name: e.target.value }))
                      }
                      placeholder="e.g. Cash in Bank"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Account Type</Label>
                    <Select
                      value={formData.type}
                      onValueChange={(v) => {
                        const type = v as AccountType;
                        setFormData((p) => ({
                          ...p,
                          type,
                          category: ACCOUNT_CATEGORIES[type][0],
                          code: getNextAccountCode(
                            accounts,
                            type,
                            ACCOUNT_CATEGORIES[type][0],
                          ),
                        }));
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ASSET">Asset</SelectItem>
                        <SelectItem value="LIABILITY">Liability</SelectItem>
                        <SelectItem value="EQUITY">Equity</SelectItem>
                        <SelectItem value="REVENUE">Revenue</SelectItem>
                        <SelectItem value="EXPENSE">Expense</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select
                      value={formData.category}
                      onValueChange={(v) =>
                        setFormData((p) => ({
                          ...p,
                          category: v,
                          code: getNextAccountCode(accounts, p.type, v),
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {categoryOptions.map((category) => (
                          <SelectItem key={category} value={category}>
                            {category}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Subtype</Label>
                    <Select
                      value={formData.subType}
                      onValueChange={(v) =>
                        setFormData((p) => ({ ...p, subType: v }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Current">Current</SelectItem>
                        <SelectItem value="Non-current">Non-current</SelectItem>
                        <SelectItem value="Operating">Operating</SelectItem>
                        <SelectItem value="Finance">Finance</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Normal Balance</Label>
                    <Select
                      value={formData.normalBalance}
                      onValueChange={(v) =>
                        setFormData((p) => ({ ...p, normalBalance: v }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="DEBIT">DEBIT</SelectItem>
                        <SelectItem value="CREDIT">CREDIT</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 col-span-2">
                    <Label>IFRS Mapping Tag (Optional)</Label>
                    <Input
                      value={formData.ifrsMappingTag}
                      onChange={(e) =>
                        setFormData((p) => ({
                          ...p,
                          ifrsMappingTag: e.target.value,
                        }))
                      }
                      placeholder="e.g. IAS-1, IFRS-9, IAS-16"
                    />
                  </div>
                  <div className="space-y-2 col-span-2">
                    <Label>Default Segment (Optional)</Label>
                    <Select
                      value={formData.defaultSegmentId?.toString() || "none"}
                      onValueChange={(v) =>
                        setFormData((p) => ({
                          ...p,
                          defaultSegmentId: v === "none" ? undefined : Number(v),
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a default segment" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {segments?.map((seg) => (
                          <SelectItem key={seg.id} value={String(seg.id)}>
                            {seg.name} ({seg.type})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 col-span-2">
                    <Label>Description (Optional)</Label>
                    <Input
                      value={formData.description}
                      onChange={(e) =>
                        setFormData((p) => ({
                          ...p,
                          description: e.target.value,
                        }))
                      }
                      placeholder="Brief description of the account purpose"
                    />
                  </div>
                </div>
                <div className="pt-4 flex justify-end gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="bg-primary text-white"
                    disabled={createMutation.isPending}
                  >
                    {createMutation.isPending
                      ? "Creating..."
                      : "Create Account"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Card className="border-slate-200/60 shadow-sm overflow-hidden rounded-2xl">
          <CardHeader className="bg-white border-b border-slate-100 px-4 sm:px-6 py-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <CardTitle className="text-lg font-bold text-slate-800 font-display">
                Financial Chart of Accounts
              </CardTitle>
              <Badge
                variant="outline"
                className="bg-slate-50 w-fit text-slate-500 font-bold border-slate-200 px-3 py-1 rounded-lg"
              >
                {filteredAccounts?.length || 0} Accounts Total
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-slate-50/50">
                <TableRow className="hover:bg-transparent border-slate-100">
                  <TableHead className="w-[120px] font-bold text-slate-500 uppercase text-[11px] tracking-wider pl-6">
                    Code
                  </TableHead>
                  <TableHead className="font-bold text-slate-500 uppercase text-[11px] tracking-wider">
                    Account Name
                  </TableHead>
                  <TableHead className="font-bold text-slate-500 uppercase text-[11px] tracking-wider">
                    Type / Category
                  </TableHead>
                  <TableHead className="font-bold text-slate-500 uppercase text-[11px] tracking-wider">
                    IFRS Subtype
                  </TableHead>
                  <TableHead className="font-bold text-slate-500 uppercase text-[11px] tracking-wider">
                    Bal.
                  </TableHead>
                  <TableHead className="font-bold text-slate-500 uppercase text-[11px] tracking-wider">
                    Status
                  </TableHead>
                  <TableHead className="font-bold text-slate-500 uppercase text-[11px] tracking-wider">
                    System
                  </TableHead>
                  <TableHead className="text-right pr-6 font-bold text-slate-500 uppercase text-[11px] tracking-wider">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading || isCompanyLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i} className="animate-pulse border-slate-50">
                      <TableCell colSpan={8} className="h-16 bg-slate-50/20" />
                    </TableRow>
                  ))
                ) : filteredAccounts?.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="h-32 text-center text-slate-400 font-medium"
                    >
                      No accounts found matching your search.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAccounts?.map((account) => (
                    <TableRow
                      key={account.id}
                      className="hover:bg-slate-50/50 border-slate-50 transition-colors group"
                    >
                      <TableCell className="font-bold text-slate-900 pl-6 group-hover:text-primary transition-colors">
                        {account.code}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-700">
                            {account.name}
                          </span>
                          <span className="text-[11px] text-slate-400 font-medium">
                            {account.description || "No description"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1.5">
                          <Badge
                            className={cn(
                              "w-fit px-2 py-0 h-5 text-[10px] font-black border uppercase tracking-wider shadow-none",
                              getTypeBadgeColor(account.type),
                            )}
                          >
                            {account.type}
                          </Badge>
                          <span className="text-[11px] text-slate-400 font-bold ml-1">
                            {account.category}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <span className="text-[11px] font-bold text-slate-700">
                            {account.subType}
                          </span>
                          {account.ifrsMappingTag && (
                            <Badge variant="outline" className="w-fit text-[9px] px-1 py-0 border-slate-200 text-slate-500">
                              {account.ifrsMappingTag}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={cn(
                          "text-[10px] font-black px-1.5 py-0.5 rounded-sm uppercase",
                          account.normalBalance === "DEBIT" ? "bg-blue-50 text-blue-700" : "bg-purple-50 text-purple-700"
                        )}>
                          {account.normalBalance === "DEBIT" ? "DR" : "CR"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            "px-2 py-0 h-5 text-[10px] font-black border uppercase tracking-wider",
                            account.isActive
                              ? "bg-emerald-50 text-emerald-600 border-emerald-100"
                              : "bg-slate-100 text-slate-400 border-slate-200",
                          )}
                        >
                          {account.isActive ? "Active" : "Archived"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {account.isSystem ? (
                          <Badge className="bg-amber-50 text-amber-600 border-amber-100 font-black text-[9px] uppercase px-2 py-0">
                            Lock
                          </Badge>
                        ) : (
                          <span className="text-[10px] text-slate-300 font-bold uppercase tracking-widest">
                            Custom
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right pr-6">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 rounded-lg px-2 text-slate-500 hover:bg-blue-50 hover:text-blue-600"
                          onClick={() =>
                            setLocation(`/accounting/ledger/${account.id}`)
                          }
                        >
                          <Eye className="mr-1.5 h-4 w-4" />
                          Ledger
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
