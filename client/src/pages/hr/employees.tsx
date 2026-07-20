import { cn } from "@/lib/utils";
import { useState } from "react";
import { downloadExcel } from "@/lib/export-utils";
import { useQuery, useMutation } from "@tanstack/react-query";
import { 
  Plus, 
  Search, 
  MoreVertical,
  Mail,
  Phone,
  Briefcase,
  Loader2,
  Upload,
  Download,
  Trash2,
  ShieldAlert,
  Wallet
} from "lucide-react";
import Papa from "papaparse";
import { format } from "date-fns";
import { HRLayout } from "./layout";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

export default function HREmployees() {
  const { user } = useAuth();
  const { activeCompanyId } = useActiveCompany(!!user, user?.id ?? null);
  const companyId = activeCompanyId ?? null;
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isContractModalOpen, setIsContractModalOpen] = useState(false);
  const [isStatutoryModalOpen, setIsStatutoryModalOpen] = useState(false);
  const [isRecurringModalOpen, setIsRecurringModalOpen] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);
  
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    employeeNumber: "",
    nationalId: "",
    email: "",
    phone: "",
    bankName: "",
    bankBranch: "",
    bankAccountNumber: "",
    ecocashNumber: ""
  });

  const [contractData, setContractData] = useState({
    contractType: "PERMANENT",
    startDate: new Date().toISOString().slice(0, 10),
    endDate: "",
    baseSalary: "0",
    currency: "USD",
    usdPercentage: "100",
    zigPercentage: "0",
  });

  const [statutoryData, setStatutoryData] = useState({
    nationalId: "",
    nssaNumber: "",
    zimraTaxNumber: ""
  });

  const [newRecurringItem, setNewRecurringItem] = useState({
    type: "ALLOWANCE",
    name: "",
    amount: "",
    isTaxable: true,
    isTaxDeductible: false,
    startDate: new Date().toISOString().slice(0, 10),
  });

  const { data: employees = [] as any[], isLoading } = useQuery<any[]>({
    queryKey: [`/api/companies/${companyId}/payroll/employees`],
    enabled: !!companyId,
  });

  const createEmployeeMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", `/api/companies/${companyId}/payroll/employees`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${companyId}/payroll/employees`] });
      setIsAddModalOpen(false);
      setFormData({ firstName: "", lastName: "", employeeNumber: "", nationalId: "", email: "", phone: "", bankName: "", bankBranch: "", bankAccountNumber: "", ecocashNumber: "" });
      toast({ title: "Employee created successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to create employee", description: error.message, variant: "destructive" });
    }
  });

  const updateContractMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", `/api/companies/${companyId}/payroll/employees/${selectedEmployeeId}/contract`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${companyId}/payroll/employees`] });
      setIsContractModalOpen(false);
      toast({ title: "Contract updated successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to update contract", description: error.message, variant: "destructive" });
    }
  });

  const updateStatutoryMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("PUT", `/api/companies/${companyId}/payroll/employees/${selectedEmployeeId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${companyId}/payroll/employees`] });
      setIsStatutoryModalOpen(false);
      toast({ title: "Statutory profile updated" });
    },
    onError: (error: any) => {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    }
  });

  const { data: recurringItems = [], isLoading: isLoadingRecurring } = useQuery<any[]>({
    queryKey: [`/api/companies/${companyId}/payroll/employees/${selectedEmployeeId}/recurring-items`],
    enabled: !!companyId && !!selectedEmployeeId && isRecurringModalOpen,
  });

  const addRecurringItemMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", `/api/companies/${companyId}/payroll/employees/${selectedEmployeeId}/recurring-items`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${companyId}/payroll/employees/${selectedEmployeeId}/recurring-items`] });
      toast({ title: "Item added successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to add item", description: error.message, variant: "destructive" });
    }
  });

  const toggleRecurringItemMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number, isActive: boolean }) => {
      const res = await apiRequest("PUT", `/api/companies/${companyId}/payroll/recurring-items/${id}`, { isActive });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${companyId}/payroll/employees/${selectedEmployeeId}/recurring-items`] });
      toast({ title: "Status updated" });
    }
  });

  const importEmployeesMutation = useMutation({
    mutationFn: async (data: any[]) => {
      const res = await apiRequest("POST", `/api/companies/${companyId}/payroll/employees/import`, { employees: data });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${companyId}/payroll/employees`] });
      toast({ title: "Import Successful", description: `Imported ${data.count} employees.` });
    },
    onError: (error: any) => {
      toast({ title: "Import Failed", description: error.message, variant: "destructive" });
    }
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        // Map CSV headers to our schema expected by backend
        const mappedData = results.data.map((row: any) => ({
          employeeNumber: row['Employee Number'] || row.employeeNumber,
          firstName: row['First Name'] || row.firstName,
          lastName: row['Last Name'] || row.lastName,
          nationalId: row['National ID'] || row.nationalId,
          email: row['Email'] || row.email,
          phone: row['Phone'] || row.phone,
          baseSalary: row['Base Salary'] || row.baseSalary,
          currency: row['Currency'] || row.currency,
          usdPercentage: row['USD %'] || row.usdPercentage,
          zigPercentage: row['ZiG %'] || row.zigPercentage,
          bankName: row['Bank Name'] || row.bankName,
          bankAccountNumber: row['Account Number'] || row.bankAccountNumber,
          ecocashNumber: row['Ecocash Number'] || row.ecocashNumber,
        }));
        importEmployeesMutation.mutate(mappedData);
      },
      error: (error) => {
        toast({ title: "Failed to parse CSV", description: error.message, variant: "destructive" });
      }
    });
  };

  const handleExport = () => {
    downloadExcel(`/api/companies/${companyId}/payroll/employees/export`, `employees_export_${new Date().toISOString().split("T")[0]}.csv`);
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createEmployeeMutation.mutate({ ...formData, branchId: 1 }); // Default to branch 1 for now if needed, or null if allowed
  };

  const handleUpdateContract = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployeeId) return;
    updateContractMutation.mutate(contractData);
  };

  const handleUpdateStatutory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployeeId) return;
    updateStatutoryMutation.mutate(statutoryData);
  };

  const handleAddRecurringItem = (e: React.FormEvent) => {
    e.preventDefault();
    addRecurringItemMutation.mutate(newRecurringItem);
    setNewRecurringItem({
      type: "ALLOWANCE",
      name: "",
      amount: "",
      isTaxable: true,
      isTaxDeductible: false,
      startDate: new Date().toISOString().slice(0, 10),
    });
  };

  const openContractModal = (employee: any) => {
    setSelectedEmployeeId(employee.id);
    const contract = employee.contracts?.[0];
    if (contract) {
      setContractData({
        contractType: contract.contractType || "PERMANENT",
        startDate: contract.startDate ? new Date(contract.startDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
        endDate: contract.endDate ? new Date(contract.endDate).toISOString().slice(0, 10) : "",
        baseSalary: contract.baseSalary ? String(contract.baseSalary) : "0",
        currency: contract.currency || "USD",
        usdPercentage: contract.usdPercentage ? String(contract.usdPercentage) : "100",
        zigPercentage: contract.zigPercentage ? String(contract.zigPercentage) : "0",
      });
    } else {
      setContractData({
        contractType: "PERMANENT",
        startDate: new Date().toISOString().slice(0, 10),
        endDate: "",
        baseSalary: "0",
        currency: "USD",
        usdPercentage: "100",
        zigPercentage: "0",
      });
    }
    setIsContractModalOpen(true);
  };

  const openStatutoryModal = (employee: any) => {
    setSelectedEmployeeId(employee.id);
    setStatutoryData({
      nationalId: employee.nationalId || "",
      nssaNumber: employee.nssaNumber || "",
      zimraTaxNumber: employee.zimraTaxNumber || ""
    });
    setIsStatutoryModalOpen(true);
  };

  const openRecurringModal = (employee: any) => {
    setSelectedEmployeeId(employee.id);
    setIsRecurringModalOpen(true);
  };

  const filteredEmployees = employees.filter((emp: any) => {
    const term = search.toLowerCase();
    return (
      emp.firstName.toLowerCase().includes(term) ||
      emp.lastName.toLowerCase().includes(term) ||
      emp.employeeNumber.toLowerCase().includes(term)
    );
  });

  return (
    <HRLayout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">Employee Directory</h1>
            <p className="text-sm text-slate-500 mt-1">Manage personnel, contracts, and banking details</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="gap-2" onClick={handleExport}>
              <Download className="h-4 w-4" /> Export CSV
            </Button>
            <div>
              <input type="file" accept=".csv" id="csv-upload" className="hidden" onChange={handleFileUpload} />
              <Button variant="outline" className="gap-2" asChild disabled={importEmployeesMutation.isPending}>
                <label htmlFor="csv-upload" className="cursor-pointer">
                  {importEmployeesMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} 
                  Import CSV
                </label>
              </Button>
            </div>
            <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
              <DialogTrigger asChild>
                <Button className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white gap-2 shadow-md">
                  <Plus className="h-4 w-4" /> Add Employee
                </Button>
              </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Add New Employee</DialogTitle>
                <DialogDescription>
                  Enter the basic details for the new employee.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4 pt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>First Name</Label>
                    <Input required value={formData.firstName} onChange={(e) => setFormData({...formData, firstName: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <Label>Last Name</Label>
                    <Input required value={formData.lastName} onChange={(e) => setFormData({...formData, lastName: e.target.value})} />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Employee Number</Label>
                    <Input required value={formData.employeeNumber} onChange={(e) => setFormData({...formData, employeeNumber: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <Label>National ID</Label>
                    <Input required value={formData.nationalId} onChange={(e) => setFormData({...formData, nationalId: e.target.value})} />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input type="email" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <Label>Phone</Label>
                    <Input value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})} />
                  </div>
                </div>

                {/* Banking Section */}
                <div className="border-t pt-4 mt-4 space-y-4">
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 uppercase tracking-wide">Payment Details</h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Bank Name</Label>
                      <Input placeholder="e.g. CABS, FBC" value={formData.bankName} onChange={(e) => setFormData({...formData, bankName: e.target.value})} />
                    </div>
                    <div className="space-y-2">
                      <Label>Branch Code</Label>
                      <Input placeholder="e.g. 112233" value={formData.bankBranch} onChange={(e) => setFormData({...formData, bankBranch: e.target.value})} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Account Number</Label>
                      <Input value={formData.bankAccountNumber} onChange={(e) => setFormData({...formData, bankAccountNumber: e.target.value})} />
                    </div>
                    <div className="space-y-2">
                      <Label>Ecocash/Mobile Money</Label>
                      <Input placeholder="e.g. 077... / 071..." value={formData.ecocashNumber} onChange={(e) => setFormData({...formData, ecocashNumber: e.target.value})} />
                    </div>
                  </div>
                </div>

                <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 mt-4" disabled={createEmployeeMutation.isPending}>
                  {createEmployeeMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Save Employee"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Dialog open={isContractModalOpen} onOpenChange={setIsContractModalOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Manage Employee Contract</DialogTitle>
              <DialogDescription>
                Set base salary, currency splits, and contract type.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleUpdateContract} className="space-y-4 pt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Contract Type</Label>
                  <select 
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    value={contractData.contractType} onChange={(e) => setContractData({...contractData, contractType: e.target.value})}
                  >
                    <option value="PERMANENT">Permanent</option>
                    <option value="FIXED_TERM">Fixed Term</option>
                    <option value="CASUAL">Casual</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Base Currency</Label>
                  <select 
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    value={contractData.currency} onChange={(e) => setContractData({...contractData, currency: e.target.value})}
                  >
                    <option value="USD">USD</option>
                    <option value="ZiG">ZiG</option>
                    <option value="SPLIT">SPLIT (USD/ZiG)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Base Salary</Label>
                <Input type="number" step="0.01" required value={contractData.baseSalary} onChange={(e) => setContractData({...contractData, baseSalary: e.target.value})} />
              </div>

              {contractData.currency === "SPLIT" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-100 dark:border-slate-800">
                  <div className="space-y-2">
                    <Label className="text-xs">USD %</Label>
                    <Input type="number" step="0.1" value={contractData.usdPercentage} onChange={(e) => setContractData({...contractData, usdPercentage: e.target.value})} className="h-8" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">ZiG %</Label>
                    <Input type="number" step="0.1" value={contractData.zigPercentage} onChange={(e) => setContractData({...contractData, zigPercentage: e.target.value})} className="h-8" />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Start Date</Label>
                  <Input type="date" required value={contractData.startDate} onChange={(e) => setContractData({...contractData, startDate: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label>End Date</Label>
                  <Input type="date" value={contractData.endDate} onChange={(e) => setContractData({...contractData, endDate: e.target.value})} />
                </div>
              </div>

              <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 mt-4" disabled={updateContractMutation.isPending}>
                {updateContractMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Save Contract"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        <Card className="border-slate-200/60 shadow-sm bg-white/50 dark:bg-slate-950/50 backdrop-blur-sm">
          <CardContent className="p-0">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-4 bg-slate-50/50 dark:bg-slate-900/20 rounded-t-xl">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search employees..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 focus-visible:ring-blue-500"
                />
              </div>
            </div>

            <div className="relative w-full overflow-auto">
              <Table>
                <TableHeader className="bg-slate-50 dark:bg-slate-900/50">
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Employee</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Role & Branch</TableHead>
                    <TableHead>Contract</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-48 text-center">
                        <Loader2 className="h-6 w-6 animate-spin text-blue-500 mx-auto" />
                        <p className="text-sm text-slate-500 mt-2">Loading directory...</p>
                      </TableCell>
                    </TableRow>
                  ) : filteredEmployees.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-48 text-center text-slate-500">
                        No employees found matching your search.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredEmployees.map((employee: any) => (
                      <TableRow key={employee.id} className="group hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/40 dark:to-indigo-900/40 flex items-center justify-center text-blue-700 dark:text-blue-400 font-semibold shadow-inner">
                              {employee.firstName.charAt(0)}{employee.lastName.charAt(0)}
                            </div>
                            <div>
                              <div className="font-medium text-slate-900 dark:text-slate-100">
                                {employee.firstName} {employee.lastName}
                              </div>
                              <div className="text-xs text-slate-500">
                                {employee.employeeNumber}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-400">
                            {employee.email && (
                              <div className="flex items-center gap-1.5">
                                <Mail className="h-3 w-3" />
                                {employee.email}
                              </div>
                            )}
                            {employee.phone && (
                              <div className="flex items-center gap-1.5">
                                <Phone className="h-3 w-3" />
                                {employee.phone}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
                              <Briefcase className="h-3.5 w-3.5 text-indigo-500" />
                              {employee.position?.title || "No Position"}
                            </div>
                            <div className="text-xs text-slate-500">
                              {employee.department?.name || "No Department"}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            {employee.contracts?.[0] ? (
                              <>
                                <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                  {employee.contracts[0].currency} {Number(employee.contracts[0].baseSalary).toLocaleString(undefined, {minimumFractionDigits: 2})}
                                </div>
                                <div className="text-xs text-slate-500">
                                  {employee.contracts[0].contractType}
                                </div>
                              </>
                            ) : (
                              <span className="text-xs text-slate-400 italic">No Contract</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant="secondary"
                            className={
                              employee.status === "ACTIVE" 
                                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 hover:bg-emerald-200"
                                : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400"
                            }
                          >
                            {employee.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                <span className="sr-only">Open menu</span>
                                <MoreVertical className="h-4 w-4 text-slate-500" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-[160px]">
                              <DropdownMenuLabel>Actions</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="cursor-pointer text-blue-600 dark:text-blue-400" onSelect={() => openContractModal(employee)}>
                                <Briefcase className="mr-2 h-4 w-4" /> Manage Contract
                              </DropdownMenuItem>
                              <DropdownMenuItem className="cursor-pointer text-indigo-600 dark:text-indigo-400" onSelect={() => openStatutoryModal(employee)}>
                                <ShieldAlert className="mr-2 h-4 w-4" /> Statutory Settings
                              </DropdownMenuItem>
                              <DropdownMenuItem className="cursor-pointer text-emerald-600 dark:text-emerald-400" onSelect={() => openRecurringModal(employee)}>
                                <Wallet className="mr-2 h-4 w-4" /> Incomes & Deductions
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* STATUTORY MODAL */}
        <Dialog open={isStatutoryModalOpen} onOpenChange={setIsStatutoryModalOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Statutory Settings</DialogTitle>
              <DialogDescription>
                Configure ZIMRA and NSSA details for this employee.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleUpdateStatutory} className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>National ID</Label>
                <Input value={statutoryData.nationalId} onChange={(e) => setStatutoryData({...statutoryData, nationalId: e.target.value})} required />
              </div>
              <div className="space-y-2">
                <Label>ZIMRA Tax Number</Label>
                <Input value={statutoryData.zimraTaxNumber} onChange={(e) => setStatutoryData({...statutoryData, zimraTaxNumber: e.target.value})} placeholder="e.g. 020000000" />
              </div>
              <div className="space-y-2">
                <Label>NSSA Number</Label>
                <Input value={statutoryData.nssaNumber} onChange={(e) => setStatutoryData({...statutoryData, nssaNumber: e.target.value})} />
              </div>
              <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 mt-4" disabled={updateStatutoryMutation.isPending}>
                {updateStatutoryMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Save Statutory Settings"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        {/* RECURRING ITEMS MODAL */}
        <Dialog open={isRecurringModalOpen} onOpenChange={setIsRecurringModalOpen}>
          <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Employee Incomes & Deductions</DialogTitle>
              <DialogDescription>
                Manage individual recurring allowances and deductions assigned specifically to this employee.
              </DialogDescription>
            </DialogHeader>
            
            <div className="grid md:grid-cols-2 gap-6 mt-4">
              <div className="space-y-4">
                <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                  <h3 className="text-sm font-semibold mb-3 flex items-center"><Plus className="w-4 h-4 mr-2 text-emerald-500" /> Add New Item</h3>
                  <form onSubmit={handleAddRecurringItem} className="space-y-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Type</Label>
                      <select 
                        className="flex h-8 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        value={newRecurringItem.type} onChange={(e) => setNewRecurringItem({...newRecurringItem, type: e.target.value})}
                      >
                        <option value="ALLOWANCE">Allowance (Income)</option>
                        <option value="DEDUCTION">Deduction</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Name</Label>
                      <Input className="h-8" required value={newRecurringItem.name} onChange={(e) => setNewRecurringItem({...newRecurringItem, name: e.target.value})} placeholder="e.g. Transport Allowance" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Amount ($)</Label>
                      <Input className="h-8" type="number" step="0.01" required value={newRecurringItem.amount} onChange={(e) => setNewRecurringItem({...newRecurringItem, amount: e.target.value})} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Start Date</Label>
                      <Input className="h-8" type="date" required value={newRecurringItem.startDate} onChange={(e) => setNewRecurringItem({...newRecurringItem, startDate: e.target.value})} />
                    </div>
                    <div className="flex gap-4 pt-2">
                      <label className="flex items-center gap-2 text-xs cursor-pointer">
                        <input type="checkbox" checked={newRecurringItem.isTaxable} onChange={(e) => setNewRecurringItem({...newRecurringItem, isTaxable: e.target.checked})} className="rounded text-indigo-600 focus:ring-indigo-500" />
                        Taxable
                      </label>
                      <label className="flex items-center gap-2 text-xs cursor-pointer">
                        <input type="checkbox" checked={newRecurringItem.isTaxDeductible} onChange={(e) => setNewRecurringItem({...newRecurringItem, isTaxDeductible: e.target.checked})} className="rounded text-indigo-600 focus:ring-indigo-500" />
                        Tax Deductible
                      </label>
                    </div>
                    <Button type="submit" className="w-full h-8 text-xs bg-slate-900 dark:bg-slate-100 dark:text-slate-900 mt-2" disabled={addRecurringItemMutation.isPending}>
                      {addRecurringItemMutation.isPending ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : "Add Item"}
                    </Button>
                  </form>
                </div>
              </div>

              <div className="space-y-4">
                <div className="bg-white dark:bg-slate-950 p-0 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col h-full overflow-hidden">
                  <div className="p-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/30">
                    <h3 className="text-sm font-semibold">Current Assigned Items</h3>
                  </div>
                  <div className="flex-1 overflow-y-auto p-3 space-y-2 max-h-[300px]">
                    {isLoadingRecurring ? (
                      <div className="text-center py-4"><Loader2 className="h-5 w-5 animate-spin text-slate-400 mx-auto" /></div>
                    ) : recurringItems.length === 0 ? (
                      <p className="text-xs text-slate-500 text-center py-4">No custom items assigned to this employee.</p>
                    ) : (
                      recurringItems.map(item => (
                        <div key={item.id} className={cn("flex items-center justify-between p-2.5 rounded-lg border text-sm transition-colors", item.isActive ? "border-slate-200 bg-white" : "border-slate-100 bg-slate-50 opacity-60")}>
                          <div>
                            <div className="font-medium flex items-center gap-2">
                              {item.name} 
                              <Badge variant="outline" className={item.type === "ALLOWANCE" ? "text-emerald-600 border-emerald-200 bg-emerald-50" : "text-rose-600 border-rose-200 bg-rose-50"}>
                                {item.type === "ALLOWANCE" ? "+" : "-"}${Number(item.amount).toFixed(2)}
                              </Badge>
                            </div>
                            <div className="text-[10px] text-slate-500 mt-1 flex gap-2">
                              {item.isTaxable && <span>• Taxable</span>}
                              {item.isTaxDeductible && <span>• Tax Deductible</span>}
                              <span>• From {format(new Date(item.startDate), 'MMM yyyy')}</span>
                            </div>
                          </div>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className={item.isActive ? "text-rose-600 hover:text-rose-700 hover:bg-rose-50" : "text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"}
                            onClick={() => toggleRecurringItemMutation.mutate({ id: item.id, isActive: !item.isActive })}
                            disabled={toggleRecurringItemMutation.isPending}
                          >
                            {item.isActive ? "Disable" : "Enable"}
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </HRLayout>
  );
}
