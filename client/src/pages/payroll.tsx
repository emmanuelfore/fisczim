import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Banknote,
  BarChart3,
  Briefcase,
  CalendarCheck,
  CheckCircle2,
  Calculator,
  ClipboardCheck,
  Download,
  FileSpreadsheet,
  FileCheck2,
  HandCoins,
  LockKeyhole,
  PlayCircle,
  Plus,
  Upload,
  UserPlus,
  Users,
} from "lucide-react";
import { format } from "date-fns";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useAuth } from "@/hooks/use-auth";
import { useBranches } from "@/hooks/use-branches";
import { apiRequest } from "@/lib/queryClient";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
type PayrollRun = {
  id: number;
  periodStart: string;
  periodEnd: string;
  currency: string;
  status: string;
  totalBasic: string;
  totalGross: string;
  totalDeductions: string;
  totalNet: string;
};
type Employee = {
  id: number;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  status: string;
  branchId: number;
  email?: string | null;
  phone?: string | null;
  nationalId: string;
  nssaNumber?: string | null;
  zimraTaxNumber?: string | null;
  bankName?: string | null;
  bankAccountNumber?: string | null;
  ecocashNumber?: string | null;
  department?: { name: string } | null;
  position?: { title: string } | null;
  contracts?: {
    baseSalary: string;
    currency: string;
    usdPercentage: string;
    zigPercentage: string;
    payFrequency?: string;
    payGradeId?: number | null;
  }[];
};
type WorksheetLine = {
  id: number;
  employeeId: number;
  employee: Employee;
  basicSalary: string;
  grossSalary: string;
  totalDeductions: string;
  netSalary: string;
  paye: string;
  aidsLevy: string;
  nssaEmployee: string;
  netSalaryUsd: string;
  netSalaryZig: string;
  isPaid: boolean;
  allowances?: {
    id: number;
    name: string;
    amount: string;
    isTaxable: boolean;
    allowanceType: string;
  }[];
  deductions?: {
    id: number;
    name: string;
    amount: string;
    isTaxDeductible: boolean;
    deductionType: string;
  }[];
};
const money = (value: unknown, currency = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    Number(value || 0),
  );
const today = new Date();
const monthStart = format(
  new Date(today.getFullYear(), today.getMonth(), 1),
  "yyyy-MM-dd",
);
const monthEnd = format(
  new Date(today.getFullYear(), today.getMonth() + 1, 0),
  "yyyy-MM-dd",
);
const importTypes = [
  { value: "employees", label: "Employees" },
  { value: "pay-grades", label: "Pay grades" },
  { value: "earning-types", label: "Earning types" },
  { value: "deduction-types", label: "Deduction types" },
  { value: "recurring-items", label: "Employee recurring items" },
  { value: "leave-balances", label: "Leave balances" },
  { value: "loans", label: "Loans and advances" },
];
function usePayrollQuery<T>(
  companyId: number | null,
  path: string,
  enabled = true,
) {
  return useQuery<T>({
    queryKey: [`/api/companies/${companyId}/payroll${path}`],
    enabled: !!companyId && enabled,
  });
}
export default function PayrollPage() {
  const { user } = useAuth();
  const { activeCompanyId } = useActiveCompany(!!user, user?.id ?? null);
  const companyId = activeCompanyId ?? null;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: branches = [] } = useBranches(companyId || 0);
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [employeeForm, setEmployeeForm] = useState({
    employeeNumber: "",
    firstName: "",
    lastName: "",
    nationalId: "",
    email: "",
    phone: "",
    branchId: "",
    departmentId: "",
    positionId: "",
    nssaNumber: "",
    zimraTaxNumber: "",
    bankName: "",
    bankBranch: "",
    bankAccountNumber: "",
    ecocashNumber: "",
    emergencyContactName: "",
    emergencyContactPhone: "",
    status: "ACTIVE",
    joiningDate: format(new Date(), "yyyy-MM-dd"),
    terminationDate: "",
    contractType: "PERMANENT",
    payFrequency: "MONTHLY",
    baseSalary: "",
    currency: "USD",
    usdPercentage: "100.00",
    zigPercentage: "0.00",
    payGradeId: "",
    necSectorId: "",
  });
  const [runForm, setRunForm] = useState({
    periodStart: monthStart,
    periodEnd: monthEnd,
    payFrequency: "MONTHLY",
    currency: "USD",
    exchangeRate: "1.000000",
    branchId: "all",
  });
  const [leaveForm, setLeaveForm] = useState({
    employeeId: "",
    leaveType: "ANNUAL",
    startDate: format(new Date(), "yyyy-MM-dd"),
    endDate: format(new Date(), "yyyy-MM-dd"),
    totalDays: "1",
    reason: "",
  });
  const [loanForm, setLoanForm] = useState({
    employeeId: "",
    principalAmount: "",
    repaymentTermMonths: "3",
    monthlyRepaymentAmount: "",
  });
  const [departmentForm, setDepartmentForm] = useState({ code: "", name: "" });
  const [positionForm, setPositionForm] = useState({
    title: "",
    grade: "",
    necCategory: "",
  });
  const [taxForm, setTaxForm] = useState({
    currency: "USD",
    effectiveFrom: monthStart,
    effectiveTo: "",
    nssaRateEmployee: "0.0450",
    nssaRateEmployer: "0.0450",
    nssaCeilingLimit: "",
    aidsLevyRate: "0.0300",
    bracketsJson: '[{"min":0,"max":null,"rate":0,"deduction":0}]',
  });
  const [payGradeForm, setPayGradeForm] = useState({
    code: "",
    name: "",
    currency: "USD",
    payFrequency: "MONTHLY",
    minSalary: "",
    midpointSalary: "",
    maxSalary: "",
    necSectorId: "",
    effectiveFrom: monthStart,
  });
  const [recurringForm, setRecurringForm] = useState({
    employeeId: "",
    type: "ALLOWANCE",
    name: "",
    amount: "",
    isTaxable: "true",
    isTaxDeductible: "false",
    startDate: monthStart,
    endDate: "",
  });
  const [earningTypeForm, setEarningTypeForm] = useState({
    code: "",
    name: "",
    category: "ALLOWANCE",
    taxTreatment: "TAXABLE",
    taxablePercentage: "100.00",
    isPensionable: "false",
    isNssaApplicable: "false",
    isRecurring: "true",
    calculationMethod: "FIXED",
    effectiveFrom: monthStart,
  });
  const [deductionTypeForm, setDeductionTypeForm] = useState({
    code: "",
    name: "",
    category: "COMPANY",
    timing: "POST_TAX",
    contributionSide: "EMPLOYEE",
    calculationMethod: "FIXED",
    employeeRate: "0.000000",
    employerRate: "0.000000",
    priorityOrder: "100",
    effectiveFrom: monthStart,
  });
  const [reportForm, setReportForm] = useState({
    reportType: "P2",
    periodStart: monthStart,
    periodEnd: monthEnd,
    currency: "USD",
  });
  const [submissionReference, setSubmissionReference] = useState("");
  const [importForm, setImportForm] = useState({
    importType: "employees",
    csv: "",
    sourceFileName: "",
  });
  const [importPreview, setImportPreview] = useState<any | null>(null);
  const employeesQuery = usePayrollQuery<Employee[]>(companyId, "/employees");
  const runsQuery = usePayrollQuery<PayrollRun[]>(companyId, "/runs");
  const departmentsQuery = usePayrollQuery<any[]>(companyId, "/departments");
  const positionsQuery = usePayrollQuery<any[]>(companyId, "/positions");
  const necQuery = usePayrollQuery<any[]>(companyId, "/nec-sectors");
  const payGradesQuery = usePayrollQuery<any[]>(companyId, "/pay-grades");
  const leaveQuery = usePayrollQuery<any[]>(companyId, "/leave/requests");
  const loansQuery = usePayrollQuery<any[]>(companyId, "/loans");
  const taxConfigQuery = usePayrollQuery<any[]>(companyId, "/tax-config");
  const earningTypesQuery = usePayrollQuery<any[]>(companyId, "/earning-types");
  const deductionTypesQuery = usePayrollQuery<any[]>(
    companyId,
    "/deduction-types",
  );
  const reportCatalogQuery = usePayrollQuery<any[]>(
    companyId,
    "/reports/catalog",
  );
  const generatedReportsQuery = usePayrollQuery<any[]>(
    companyId,
    "/reports/generated",
  );
  const importBatchesQuery = usePayrollQuery<any[]>(
    companyId,
    "/imports/batches",
  );
  const complianceDashboardQuery = usePayrollQuery<any>(
    companyId,
    `/reports/compliance-dashboard?from=${reportForm.periodStart}&to=${reportForm.periodEnd}&currency=${reportForm.currency}`,
  );
  const reportValidationQuery = usePayrollQuery<any>(
    companyId,
    `/reports/validate?type=${reportForm.reportType}&from=${reportForm.periodStart}&to=${reportForm.periodEnd}&currency=${reportForm.currency}`,
  );
  const reconciliationQuery = usePayrollQuery<any>(
    companyId,
    `/reports/reconciliation?from=${reportForm.periodStart}&to=${reportForm.periodEnd}&currency=${reportForm.currency}`,
  );
  const recurringItemsQuery = usePayrollQuery<any[]>(
    companyId,
    selectedEmployeeId
      ? `/employees/${selectedEmployeeId}/recurring-items`
      : "/employees/0/recurring-items",
    !!selectedEmployeeId,
  );
  const worksheetQuery = usePayrollQuery<{
    run: PayrollRun;
    lines: WorksheetLine[];
  }>(
    companyId,
    selectedRunId ? `/runs/${selectedRunId}/worksheet` : "/runs/0/worksheet",
    !!selectedRunId,
  );
  const employees = employeesQuery.data ?? [];
  const runs = runsQuery.data ?? [];
  const selectedRun =
    worksheetQuery.data?.run ??
    runs.find((run) => run.id === selectedRunId) ??
    runs[0];
  const worksheetLines = worksheetQuery.data?.lines ?? [];
  const invalidatePayroll = () => {
    queryClient.invalidateQueries({
      queryKey: [`/api/companies/${companyId}/payroll/employees`],
    });
    queryClient.invalidateQueries({
      queryKey: [`/api/companies/${companyId}/payroll/runs`],
    });
    queryClient.invalidateQueries({
      queryKey: [`/api/companies/${companyId}/payroll/leave/requests`],
    });
    queryClient.invalidateQueries({
      queryKey: [`/api/companies/${companyId}/payroll/loans`],
    });
    queryClient.invalidateQueries({
      queryKey: [`/api/companies/${companyId}/payroll/tax-config`],
    });
    queryClient.invalidateQueries({
      queryKey: [`/api/companies/${companyId}/payroll/pay-grades`],
    });
    queryClient.invalidateQueries({
      queryKey: [`/api/companies/${companyId}/payroll/earning-types`],
    });
    queryClient.invalidateQueries({
      queryKey: [`/api/companies/${companyId}/payroll/deduction-types`],
    });
    queryClient.invalidateQueries({
      queryKey: [`/api/companies/${companyId}/payroll/reports/generated`],
    });
    queryClient.invalidateQueries({
      queryKey: [`/api/companies/${companyId}/payroll/imports/batches`],
    });
    queryClient.invalidateQueries({
      queryKey: [
        `/api/companies/${companyId}/payroll/reports/compliance-dashboard?from=${reportForm.periodStart}&to=${reportForm.periodEnd}&currency=${reportForm.currency}`,
      ],
    });
    queryClient.invalidateQueries({
      queryKey: [
        `/api/companies/${companyId}/payroll/reports/validate?type=${reportForm.reportType}&from=${reportForm.periodStart}&to=${reportForm.periodEnd}&currency=${reportForm.currency}`,
      ],
    });
    if (selectedEmployeeId) {
      queryClient.invalidateQueries({
        queryKey: [
          `/api/companies/${companyId}/payroll/employees/${selectedEmployeeId}/recurring-items`,
        ],
      });
    }
    if (selectedRunId) {
      queryClient.invalidateQueries({
        queryKey: [
          `/api/companies/${companyId}/payroll/runs/${selectedRunId}/worksheet`,
        ],
      });
    }
  };
  const createEmployee = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Select a company first");
      const branchId = Number(employeeForm.branchId || branches[0]?.id);
      if (!branchId) throw new Error("Create a branch before adding employees");
      const payload = {
        employeeNumber: employeeForm.employeeNumber,
        firstName: employeeForm.firstName,
        lastName: employeeForm.lastName,
        nationalId: employeeForm.nationalId,
        email: employeeForm.email || null,
        phone: employeeForm.phone || null,
        branchId,
        departmentId: employeeForm.departmentId
          ? Number(employeeForm.departmentId)
          : null,
        positionId: employeeForm.positionId
          ? Number(employeeForm.positionId)
          : null,
        nssaNumber: employeeForm.nssaNumber || null,
        zimraTaxNumber: employeeForm.zimraTaxNumber || null,
        bankName: employeeForm.bankName || null,
        bankBranch: employeeForm.bankBranch || null,
        bankAccountNumber: employeeForm.bankAccountNumber || null,
        ecocashNumber: employeeForm.ecocashNumber || null,
        emergencyContactName: employeeForm.emergencyContactName || null,
        emergencyContactPhone: employeeForm.emergencyContactPhone || null,
        status: employeeForm.status,
        joiningDate: employeeForm.joiningDate,
        terminationDate: employeeForm.terminationDate || null,
        contract: employeeForm.baseSalary
          ? {
              contractType: employeeForm.contractType,
              baseSalary: employeeForm.baseSalary,
              currency: employeeForm.currency,
              usdPercentage: employeeForm.usdPercentage,
              zigPercentage: employeeForm.zigPercentage,
              payFrequency: employeeForm.payFrequency,
              payGradeId: employeeForm.payGradeId
                ? Number(employeeForm.payGradeId)
                : null,
              necSectorId: employeeForm.necSectorId
                ? Number(employeeForm.necSectorId)
                : null,
            }
          : undefined,
      };
      const res = await apiRequest(
        "POST",
        `/api/companies/${companyId}/payroll/employees`,
        payload,
      );
      return res.json();
    },
    onSuccess: () => {
      setEmployeeForm((current) => ({
        ...current,
        employeeNumber: "",
        firstName: "",
        lastName: "",
        nationalId: "",
        email: "",
        phone: "",
        nssaNumber: "",
        zimraTaxNumber: "",
        bankName: "",
        bankBranch: "",
        bankAccountNumber: "",
        ecocashNumber: "",
        emergencyContactName: "",
        emergencyContactPhone: "",
        baseSalary: "",
      }));
      invalidatePayroll();
      toast({
        title: "Employee created",
        description: "The employee profile and contract are ready for payroll.",
      });
    },
    onError: (error: Error) =>
      toast({
        title: "Could not create employee",
        description: error.message,
        variant: "destructive",
      }),
  });
  const createRun = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Select a company first");
      const payload = {
        ...runForm,
        branchId: runForm.branchId === "all" ? null : Number(runForm.branchId),
      };
      const res = await apiRequest(
        "POST",
        `/api/companies/${companyId}/payroll/runs`,
        payload,
      );
      return res.json();
    },
    onSuccess: (run: PayrollRun) => {
      setSelectedRunId(run.id);
      invalidatePayroll();
      toast({
        title: "Payroll run created",
        description: "The worksheet has been calculated from active employees.",
      });
    },
    onError: (error: Error) =>
      toast({
        title: "Could not create payroll run",
        description: error.message,
        variant: "destructive",
      }),
  });
  const lockRun = useMutation({
    mutationFn: async (runId: number) => {
      if (!companyId) throw new Error("Select a company first");
      const res = await apiRequest(
        "POST",
        `/api/companies/${companyId}/payroll/runs/${runId}/lock`,
      );
      return res.json();
    },
    onSuccess: () => {
      invalidatePayroll();
      toast({
        title: "Payroll locked",
        description: "Journal draft and statutory liabilities were generated.",
      });
    },
    onError: (error: Error) =>
      toast({
        title: "Could not lock run",
        description: error.message,
        variant: "destructive",
      }),
  });
  const approveRun = useMutation({
    mutationFn: async (runId: number) => {
      if (!companyId) throw new Error("Select a company first");
      const res = await apiRequest(
        "POST",
        `/api/companies/${companyId}/payroll/runs/${runId}/approve`,
      );
      return res.json();
    },
    onSuccess: () => {
      invalidatePayroll();
      toast({
        title: "Payroll approved",
        description: "The run is ready to lock and post to accounting.",
      });
    },
    onError: (error: Error) =>
      toast({
        title: "Could not approve run",
        description: error.message,
        variant: "destructive",
      }),
  });
  const createLeave = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Select a company first");
      const res = await apiRequest(
        "POST",
        `/api/companies/${companyId}/payroll/leave/requests`,
        {
          ...leaveForm,
          employeeId: Number(leaveForm.employeeId),
          totalDays: Number(leaveForm.totalDays),
        },
      );
      return res.json();
    },
    onSuccess: () => {
      setLeaveForm((current) => ({ ...current, employeeId: "", reason: "" }));
      invalidatePayroll();
      toast({ title: "Leave request recorded" });
    },
    onError: (error: Error) =>
      toast({
        title: "Could not save leave request",
        description: error.message,
        variant: "destructive",
      }),
  });
  const approveLeave = useMutation({
    mutationFn: async ({ id, approve }: { id: number; approve: boolean }) => {
      if (!companyId) throw new Error("Select a company first");
      const res = await apiRequest(
        "POST",
        `/api/companies/${companyId}/payroll/leave/requests/${id}/approve`,
        { approve },
      );
      return res.json();
    },
    onSuccess: () => {
      invalidatePayroll();
      toast({ title: "Leave status updated" });
    },
  });
  const createLoan = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Select a company first");
      const res = await apiRequest(
        "POST",
        `/api/companies/${companyId}/payroll/loans`,
        {
          ...loanForm,
          employeeId: Number(loanForm.employeeId),
          repaymentTermMonths: Number(loanForm.repaymentTermMonths),
          interestRate: "0.00",
        },
      );
      return res.json();
    },
    onSuccess: () => {
      setLoanForm((current) => ({
        ...current,
        employeeId: "",
        principalAmount: "",
        monthlyRepaymentAmount: "",
      }));
      invalidatePayroll();
      toast({ title: "Loan request recorded" });
    },
    onError: (error: Error) =>
      toast({
        title: "Could not save loan",
        description: error.message,
        variant: "destructive",
      }),
  });
  const approveLoan = useMutation({
    mutationFn: async (id: number) => {
      if (!companyId) throw new Error("Select a company first");
      const res = await apiRequest(
        "POST",
        `/api/companies/${companyId}/payroll/loans/${id}/approve`,
      );
      return res.json();
    },
    onSuccess: () => {
      invalidatePayroll();
      toast({ title: "Loan approved" });
    },
  });
  const createTaxConfig = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Select a company first");
      const brackets = JSON.parse(taxForm.bracketsJson);
      const res = await apiRequest(
        "POST",
        `/api/companies/${companyId}/payroll/tax-config`,
        {
          currency: taxForm.currency,
          effectiveFrom: taxForm.effectiveFrom,
          effectiveTo: taxForm.effectiveTo || null,
          brackets,
          nssaRateEmployee: taxForm.nssaRateEmployee,
          nssaRateEmployer: taxForm.nssaRateEmployer,
          nssaCeilingLimit: taxForm.nssaCeilingLimit,
          aidsLevyRate: taxForm.aidsLevyRate,
        },
      );
      return res.json();
    },
    onSuccess: () => {
      invalidatePayroll();
      toast({
        title: "Tax table saved",
        description: "PAYE, AIDS levy, and NSSA settings are effective-dated.",
      });
    },
    onError: (error: Error) =>
      toast({
        title: "Could not save tax table",
        description: error.message,
        variant: "destructive",
      }),
  });
  const createPayGrade = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Select a company first");
      const res = await apiRequest(
        "POST",
        `/api/companies/${companyId}/payroll/pay-grades`,
        {
          ...payGradeForm,
          necSectorId: payGradeForm.necSectorId
            ? Number(payGradeForm.necSectorId)
            : null,
        },
      );
      return res.json();
    },
    onSuccess: () => {
      setPayGradeForm((current) => ({
        ...current,
        code: "",
        name: "",
        minSalary: "",
        midpointSalary: "",
        maxSalary: "",
      }));
      invalidatePayroll();
      toast({ title: "Pay grade saved" });
    },
    onError: (error: Error) =>
      toast({
        title: "Could not save pay grade",
        description: error.message,
        variant: "destructive",
      }),
  });
  const createRecurringItem = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Select a company first");
      const employeeId = recurringForm.employeeId || selectedEmployeeId;
      if (!employeeId) throw new Error("Select an employee first");
      const res = await apiRequest(
        "POST",
        `/api/companies/${companyId}/payroll/employees/${employeeId}/recurring-items`,
        {
          type: recurringForm.type,
          name: recurringForm.name,
          amount: recurringForm.amount,
          isTaxable: recurringForm.isTaxable === "true",
          isTaxDeductible: recurringForm.isTaxDeductible === "true",
          startDate: recurringForm.startDate,
          endDate: recurringForm.endDate || null,
        },
      );
      return res.json();
    },
    onSuccess: () => {
      setRecurringForm((current) => ({ ...current, name: "", amount: "" }));
      invalidatePayroll();
      toast({ title: "Pay item saved" });
    },
    onError: (error: Error) =>
      toast({
        title: "Could not save pay item",
        description: error.message,
        variant: "destructive",
      }),
  });
  const createEarningType = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Select a company first");
      const res = await apiRequest(
        "POST",
        `/api/companies/${companyId}/payroll/earning-types`,
        {
          ...earningTypeForm,
          isPensionable: earningTypeForm.isPensionable === "true",
          isNssaApplicable: earningTypeForm.isNssaApplicable === "true",
          isRecurring: earningTypeForm.isRecurring === "true",
        },
      );
      return res.json();
    },
    onSuccess: () => {
      setEarningTypeForm((current) => ({ ...current, code: "", name: "" }));
      invalidatePayroll();
      toast({ title: "Earning type saved" });
    },
    onError: (error: Error) =>
      toast({
        title: "Could not save earning type",
        description: error.message,
        variant: "destructive",
      }),
  });
  const createDeductionType = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Select a company first");
      const res = await apiRequest(
        "POST",
        `/api/companies/${companyId}/payroll/deduction-types`,
        deductionTypeForm,
      );
      return res.json();
    },
    onSuccess: () => {
      setDeductionTypeForm((current) => ({ ...current, code: "", name: "" }));
      invalidatePayroll();
      toast({ title: "Deduction type saved" });
    },
    onError: (error: Error) =>
      toast({
        title: "Could not save deduction type",
        description: error.message,
        variant: "destructive",
      }),
  });
  const createDepartment = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Select a company first");
      const res = await apiRequest(
        "POST",
        `/api/companies/${companyId}/payroll/departments`,
        departmentForm,
      );
      return res.json();
    },
    onSuccess: () => {
      setDepartmentForm({ code: "", name: "" });
      queryClient.invalidateQueries({
        queryKey: [`/api/companies/${companyId}/payroll/departments`],
      });
      toast({ title: "Department saved" });
    },
    onError: (error: Error) =>
      toast({
        title: "Could not save department",
        description: error.message,
        variant: "destructive",
      }),
  });
  const createPosition = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Select a company first");
      const res = await apiRequest(
        "POST",
        `/api/companies/${companyId}/payroll/positions`,
        positionForm,
      );
      return res.json();
    },
    onSuccess: () => {
      setPositionForm({ title: "", grade: "", necCategory: "" });
      queryClient.invalidateQueries({
        queryKey: [`/api/companies/${companyId}/payroll/positions`],
      });
      toast({ title: "Position saved" });
    },
    onError: (error: Error) =>
      toast({
        title: "Could not save position",
        description: error.message,
        variant: "destructive",
      }),
  });
  const generateReport = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Select a company first");
      const res = await apiRequest(
        "POST",
        `/api/companies/${companyId}/payroll/reports/generate`,
        reportForm,
      );
      return res.json();
    },
    onSuccess: () => {
      invalidatePayroll();
      toast({
        title: "Report generated",
        description:
          "The statutory snapshot and validation history were saved.",
      });
    },
    onError: (error: Error) =>
      toast({
        title: "Could not generate report",
        description: error.message,
        variant: "destructive",
      }),
  });
  const exportReport = async (reportId: number, format = "CSV") => {
    if (!companyId) return;
    const res = await apiFetch(
      `/api/companies/${companyId}/payroll/reports/${reportId}/export?format=${format}`,
    );
    if (!res.ok) throw new Error("Failed to export report");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `PAYROLL_REPORT_${reportId}.${format === "EXCEL" ? "xlsx" : format === "CSV" ? "csv" : "json"}`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const submitReport = useMutation({
    mutationFn: async (reportId: number) => {
      if (!companyId) throw new Error("Select a company first");
      if (!submissionReference.trim())
        throw new Error("Enter the portal/payment reference first");
      const res = await apiRequest(
        "POST",
        `/api/companies/${companyId}/payroll/reports/${reportId}/submit`,
        { submissionReference, submissionStatus: "SUBMITTED" },
      );
      return res.json();
    },
    onSuccess: () => {
      setSubmissionReference("");
      invalidatePayroll();
      toast({
        title: "Report marked submitted",
        description: "Submission reference was stored for audit.",
      });
    },
    onError: (error: Error) =>
      toast({
        title: "Could not submit report",
        description: error.message,
        variant: "destructive",
      }),
  });
  const approveReport = useMutation({
    mutationFn: async (reportId: number) => {
      if (!companyId) throw new Error("Select a company first");
      const res = await apiRequest(
        "POST",
        `/api/companies/${companyId}/payroll/reports/${reportId}/approve`,
        { approvalStatus: "APPROVED" },
      );
      return res.json();
    },
    onSuccess: () => {
      invalidatePayroll();
      toast({
        title: "Report approved",
        description:
          "The statutory report is ready for export and submission tracking.",
      });
    },
    onError: (error: Error) =>
      toast({
        title: "Could not approve report",
        description: error.message,
        variant: "destructive",
      }),
  });
  const previewImport = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Select a company first");
      if (!importForm.csv.trim())
        throw new Error("Paste or upload CSV data first");
      const res = await apiRequest(
        "POST",
        `/api/companies/${companyId}/payroll/imports/${importForm.importType}/preview`,
        {
          csv: importForm.csv,
          sourceFileName: importForm.sourceFileName || null,
        },
      );
      return res.json();
    },
    onSuccess: (data) => {
      setImportPreview(data);
      toast({
        title: "Import preview ready",
        description: `${data.readyCount} ready, ${data.errorCount} with errors.`,
      });
    },
    onError: (error: Error) =>
      toast({
        title: "Could not preview import",
        description: error.message,
        variant: "destructive",
      }),
  });
  const commitImport = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Select a company first");
      if (!importForm.csv.trim())
        throw new Error("Paste or upload CSV data first");
      const res = await apiRequest(
        "POST",
        `/api/companies/${companyId}/payroll/imports/${importForm.importType}/commit`,
        {
          csv: importForm.csv,
          sourceFileName: importForm.sourceFileName || null,
        },
      );
      return res.json();
    },
    onSuccess: (data) => {
      setImportPreview({
        rowCount: data.batch.rowCount,
        readyCount: data.batch.successCount,
        errorCount: data.batch.errorCount,
        rows: data.rows,
      });
      invalidatePayroll();
      toast({
        title: "Import committed",
        description: `${data.batch.successCount} rows imported, ${data.batch.errorCount} errors.`,
      });
    },
    onError: (error: Error) =>
      toast({
        title: "Could not commit import",
        description: error.message,
        variant: "destructive",
      }),
  });
  const downloadImportTemplate = async () => {
    if (!companyId) return;
    const res = await apiFetch(
      `/api/companies/${companyId}/payroll/imports/templates/${importForm.importType}`,
    );
    if (!res.ok) throw new Error("Failed to download template");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `payroll_${importForm.importType}_template.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const readImportFile = (file?: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setImportForm((current) => ({
        ...current,
        csv: String(reader.result || ""),
        sourceFileName: file.name,
      }));
      setImportPreview(null);
    };
    reader.readAsText(file);
  };
  const exportBank = async (runId: number) => {
    if (!companyId) return;
    const res = await apiFetch(
      `/api/companies/${companyId}/payroll/runs/${runId}/export/bank`,
    );
    if (!res.ok) throw new Error("Failed to export bank file");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `CBZ_SALARY_EXPORT_${runId}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const stats = useMemo(() => {
    const activeEmployees = employees.filter(
      (employee) => employee.status === "ACTIVE",
    ).length;
    const draftRuns = runs.filter((run) => run.status !== "LOCKED").length;
    const lockedRuns = runs.filter((run) => run.status === "LOCKED").length;
    const monthlyNet = runs[0] ? Number(runs[0].totalNet || 0) : 0;
    return { activeEmployees, draftRuns, lockedRuns, monthlyNet };
  }, [employees, runs]);
  return (
    <Layout>
      {" "}
      <div className="space-y-5">
        {" "}
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-end">
          {" "}
          <div className="flex flex-col gap-2 sm:flex-row">
            {" "}
            <Button
              variant="outline"
              className="h-10 rounded-lg"
              disabled={!selectedRun?.id}
              onClick={() =>
                selectedRun?.id &&
                exportBank(selectedRun.id).catch((error) =>
                  toast({
                    title: "Export failed",
                    description: error.message,
                    variant: "destructive",
                  }),
                )
              }
            >
              {" "}
              <Download className="mr-2 h-4 w-4" /> Bank CSV{" "}
            </Button>{" "}
            <Button
              variant="outline"
              className="h-10 rounded-lg"
              disabled={
                !selectedRun?.id ||
                selectedRun?.status === "LOCKED" ||
                selectedRun?.status === "APPROVED" ||
                approveRun.isPending
              }
              onClick={() =>
                selectedRun?.id && approveRun.mutate(selectedRun.id)
              }
            >
              {" "}
              <CheckCircle2 className="mr-2 h-4 w-4" /> Approve{" "}
            </Button>{" "}
            <Button
              className="h-10 rounded-lg bg-slate-900 hover:bg-slate-800"
              disabled={
                !selectedRun?.id ||
                selectedRun?.status !== "APPROVED" ||
                lockRun.isPending
              }
              onClick={() => selectedRun?.id && lockRun.mutate(selectedRun.id)}
            >
              {" "}
              <LockKeyhole className="mr-2 h-4 w-4" /> Lock Run{" "}
            </Button>{" "}
          </div>{" "}
        </div>{" "}
        <div className="grid gap-4 md:grid-cols-4">
          {" "}
          <StatCard
            icon={Users}
            label="Active Employees"
            value={stats.activeEmployees.toString()}
            tone="blue"
          />{" "}
          <StatCard
            icon={FileSpreadsheet}
            label="Draft Runs"
            value={stats.draftRuns.toString()}
            tone="amber"
          />{" "}
          <StatCard
            icon={CheckCircle2}
            label="Locked Runs"
            value={stats.lockedRuns.toString()}
            tone="emerald"
          />{" "}
          <StatCard
            icon={Banknote}
            label="Latest Net Payroll"
            value={money(stats.monthlyNet)}
            tone="slate"
          />{" "}
        </div>{" "}
        <Tabs defaultValue="runs" className="space-y-4">
          {" "}
          <TabsList className="h-auto flex-wrap justify-start rounded-lg border border-slate-200 bg-white p-1">
            {" "}
            <TabsTrigger value="runs" className="rounded-md">
              Process
            </TabsTrigger>{" "}
            <TabsTrigger value="run-history" className="rounded-md">
              Run History
            </TabsTrigger>{" "}
            <TabsTrigger value="employees" className="rounded-md">
              Employees
            </TabsTrigger>{" "}
            <TabsTrigger value="pay-grades" className="rounded-md">
              Pay Grades
            </TabsTrigger>{" "}
            <TabsTrigger value="pay-items" className="rounded-md">
              Pay Items
            </TabsTrigger>{" "}
            <TabsTrigger value="leave" className="rounded-md">
              Leave
            </TabsTrigger>{" "}
            <TabsTrigger value="loans" className="rounded-md">
              Loans
            </TabsTrigger>{" "}
            <TabsTrigger value="statutory" className="rounded-md">
              Statutory
            </TabsTrigger>{" "}
            <TabsTrigger value="reports" className="rounded-md">
              Reports
            </TabsTrigger>{" "}
            <TabsTrigger value="imports" className="rounded-md">
              Imports
            </TabsTrigger>{" "}
          </TabsList>{" "}
          <TabsContent value="runs" className="space-y-4">
            {" "}
            <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
              {" "}
              <Card className="rounded-lg border-slate-200">
                {" "}
                <CardHeader className="pb-3">
                  {" "}
                  <CardTitle className="flex items-center gap-2 text-base">
                    {" "}
                    <PlayCircle className="h-4 w-4" /> Create Run{" "}
                  </CardTitle>{" "}
                </CardHeader>{" "}
                <CardContent className="space-y-3">
                  {" "}
                  <div className="grid grid-cols-2 gap-3">
                    {" "}
                    <Field label="Start">
                      {" "}
                      <Input
                        type="date"
                        value={runForm.periodStart}
                        onChange={(e) =>
                          setRunForm({
                            ...runForm,
                            periodStart: e.target.value,
                          })
                        }
                      />{" "}
                    </Field>{" "}
                    <Field label="End">
                      {" "}
                      <Input
                        type="date"
                        value={runForm.periodEnd}
                        onChange={(e) =>
                          setRunForm({ ...runForm, periodEnd: e.target.value })
                        }
                      />{" "}
                    </Field>{" "}
                  </div>{" "}
                  <div className="grid grid-cols-2 gap-3">
                    {" "}
                    <Field label="Currency">
                      {" "}
                      <Select
                        value={runForm.currency}
                        onValueChange={(currency) =>
                          setRunForm({ ...runForm, currency })
                        }
                      >
                        {" "}
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>{" "}
                        <SelectContent>
                          {" "}
                          <SelectItem value="USD">USD</SelectItem>{" "}
                          <SelectItem value="ZIG">ZiG</SelectItem>{" "}
                        </SelectContent>{" "}
                      </Select>{" "}
                    </Field>{" "}
                    <Field label="USD to ZiG">
                      {" "}
                      <Input
                        value={runForm.exchangeRate}
                        onChange={(e) =>
                          setRunForm({
                            ...runForm,
                            exchangeRate: e.target.value,
                          })
                        }
                      />{" "}
                    </Field>{" "}
                  </div>{" "}
                  <Field label="Branch">
                    {" "}
                    <Select
                      value={runForm.branchId}
                      onValueChange={(branchId) =>
                        setRunForm({ ...runForm, branchId })
                      }
                    >
                      {" "}
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>{" "}
                      <SelectContent>
                        {" "}
                        <SelectItem value="all">All branches</SelectItem>{" "}
                        {branches.map((branch: any) => (
                          <SelectItem key={branch.id} value={String(branch.id)}>
                            {branch.name}
                          </SelectItem>
                        ))}{" "}
                      </SelectContent>{" "}
                    </Select>{" "}
                  </Field>{" "}
                  <Button
                    className="w-full rounded-lg bg-slate-900 hover:bg-slate-800"
                    onClick={() => createRun.mutate()}
                    disabled={createRun.isPending}
                  >
                    {" "}
                    <Plus className="mr-2 h-4 w-4" /> Calculate Payroll{" "}
                  </Button>{" "}
                </CardContent>{" "}
              </Card>{" "}
              <Card className="rounded-lg border-slate-200">
                {" "}
                <CardHeader className="flex flex-col gap-3 pb-3 md:flex-row md:items-center md:justify-between">
                  {" "}
                  <CardTitle className="text-base">
                    Payroll Worksheet
                  </CardTitle>{" "}
                  <Select
                    value={
                      selectedRunId
                        ? String(selectedRunId)
                        : runs[0]?.id
                          ? String(runs[0].id)
                          : ""
                    }
                    onValueChange={(value) => setSelectedRunId(Number(value))}
                  >
                    {" "}
                    <SelectTrigger className="w-full md:w-[280px]">
                      <SelectValue placeholder="Select payroll run" />
                    </SelectTrigger>{" "}
                    <SelectContent>
                      {" "}
                      {runs.map((run) => (
                        <SelectItem key={run.id} value={String(run.id)}>
                          {" "}
                          #{run.id} {run.periodStart} to {run.periodEnd}{" "}
                        </SelectItem>
                      ))}{" "}
                    </SelectContent>{" "}
                  </Select>{" "}
                </CardHeader>{" "}
                <CardContent className="p-0">
                  {" "}
                  <Table>
                    {" "}
                    <TableHeader>
                      {" "}
                      <TableRow>
                        {" "}
                        <TableHead className="pl-6">Employee</TableHead>{" "}
                        <TableHead className="text-right">Basic</TableHead>{" "}
                        <TableHead className="text-right">PAYE</TableHead>{" "}
                        <TableHead className="text-right">NSSA</TableHead>{" "}
                        <TableHead className="text-right">Deductions</TableHead>{" "}
                        <TableHead className="text-right pr-6">
                          Net
                        </TableHead>{" "}
                      </TableRow>{" "}
                    </TableHeader>{" "}
                    <TableBody>
                      {" "}
                      {!selectedRunId && runs.length > 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={6}
                            className="h-24 text-center text-slate-500"
                          >
                            Select a run to load the worksheet.
                          </TableCell>
                        </TableRow>
                      ) : worksheetLines.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={6}
                            className="h-24 text-center text-slate-500"
                          >
                            No worksheet lines yet.
                          </TableCell>
                        </TableRow>
                      ) : (
                        worksheetLines.map((line) => (
                          <TableRow key={line.id}>
                            {" "}
                            <TableCell className="pl-6">
                              {" "}
                              <p className="font-bold text-slate-900">
                                {line.employee.firstName}{" "}
                                {line.employee.lastName}
                              </p>{" "}
                              <p className="text-xs text-slate-500">
                                {line.employee.employeeNumber}
                              </p>{" "}
                            </TableCell>{" "}
                            <TableCell className="text-right">
                              {money(
                                line.basicSalary,
                                selectedRun?.currency || "USD",
                              )}
                            </TableCell>{" "}
                            <TableCell className="text-right">
                              {money(
                                Number(line.paye) + Number(line.aidsLevy),
                                selectedRun?.currency || "USD",
                              )}
                            </TableCell>{" "}
                            <TableCell className="text-right">
                              {money(
                                line.nssaEmployee,
                                selectedRun?.currency || "USD",
                              )}
                            </TableCell>{" "}
                            <TableCell className="text-right">
                              {money(
                                line.totalDeductions,
                                selectedRun?.currency || "USD",
                              )}
                            </TableCell>{" "}
                            <TableCell className="text-right pr-6 font-black text-slate-900">
                              {money(
                                line.netSalary,
                                selectedRun?.currency || "USD",
                              )}
                            </TableCell>{" "}
                          </TableRow>
                        ))
                      )}{" "}
                    </TableBody>{" "}
                  </Table>{" "}
                </CardContent>{" "}
              </Card>{" "}
            </div>{" "}
          </TabsContent>{" "}
          <TabsContent value="run-history" className="space-y-4">
            {" "}
            <Card className="rounded-lg border-slate-200">
              {" "}
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Run History</CardTitle>
              </CardHeader>{" "}
              <CardContent className="p-0">
                {" "}
                <Table>
                  {" "}
                  <TableHeader>
                    {" "}
                    <TableRow>
                      {" "}
                      <TableHead className="pl-6">Period</TableHead>{" "}
                      <TableHead>Status</TableHead>{" "}
                      <TableHead className="text-right">Gross</TableHead>{" "}
                      <TableHead className="text-right">Deductions</TableHead>{" "}
                      <TableHead className="text-right pr-6">
                        Net
                      </TableHead>{" "}
                    </TableRow>{" "}
                  </TableHeader>{" "}
                  <TableBody>
                    {" "}
                    {runs.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="h-24 text-center text-slate-500"
                        >
                          No payroll runs yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      runs.map((run) => (
                        <TableRow
                          key={run.id}
                          className="cursor-pointer hover:bg-slate-50"
                          onClick={() => setSelectedRunId(run.id)}
                        >
                          {" "}
                          <TableCell className="pl-6 font-semibold">
                            #{run.id} {run.periodStart} to {run.periodEnd}
                          </TableCell>{" "}
                          <TableCell>
                            <StatusBadge status={run.status} />
                          </TableCell>{" "}
                          <TableCell className="text-right">
                            {money(run.totalGross, run.currency)}
                          </TableCell>{" "}
                          <TableCell className="text-right">
                            {money(run.totalDeductions, run.currency)}
                          </TableCell>{" "}
                          <TableCell className="text-right pr-6 font-black">
                            {money(run.totalNet, run.currency)}
                          </TableCell>{" "}
                        </TableRow>
                      ))
                    )}{" "}
                  </TableBody>{" "}
                </Table>{" "}
              </CardContent>{" "}
            </Card>{" "}
          </TabsContent>{" "}
          <TabsContent value="employees" className="space-y-4">
            {" "}
            <div className="grid gap-4 xl:grid-cols-[minmax(420px,520px)_minmax(0,1fr)]">
              {" "}
              <div className="space-y-4">
                {" "}
                <Card className="rounded-lg border-slate-200">
                  {" "}
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <UserPlus className="h-4 w-4" />
                      Employee Profile
                    </CardTitle>
                  </CardHeader>{" "}
                  <CardContent className="space-y-4">
                    {" "}
                    <div className="space-y-3">
                      {" "}
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                        Identity
                      </p>{" "}
                      <div className="grid grid-cols-2 gap-3">
                        {" "}
                        <Field label="Emp No">
                          <Input
                            value={employeeForm.employeeNumber}
                            onChange={(e) =>
                              setEmployeeForm({
                                ...employeeForm,
                                employeeNumber: e.target.value,
                              })
                            }
                          />
                        </Field>{" "}
                        <Field label="National ID">
                          <Input
                            value={employeeForm.nationalId}
                            onChange={(e) =>
                              setEmployeeForm({
                                ...employeeForm,
                                nationalId: e.target.value,
                              })
                            }
                          />
                        </Field>{" "}
                      </div>{" "}
                      <div className="grid grid-cols-2 gap-3">
                        {" "}
                        <Field label="First Name">
                          <Input
                            value={employeeForm.firstName}
                            onChange={(e) =>
                              setEmployeeForm({
                                ...employeeForm,
                                firstName: e.target.value,
                              })
                            }
                          />
                        </Field>{" "}
                        <Field label="Last Name">
                          <Input
                            value={employeeForm.lastName}
                            onChange={(e) =>
                              setEmployeeForm({
                                ...employeeForm,
                                lastName: e.target.value,
                              })
                            }
                          />
                        </Field>{" "}
                      </div>{" "}
                      <div className="grid grid-cols-2 gap-3">
                        {" "}
                        <Field label="Email">
                          <Input
                            value={employeeForm.email}
                            onChange={(e) =>
                              setEmployeeForm({
                                ...employeeForm,
                                email: e.target.value,
                              })
                            }
                          />
                        </Field>{" "}
                        <Field label="Phone">
                          <Input
                            value={employeeForm.phone}
                            onChange={(e) =>
                              setEmployeeForm({
                                ...employeeForm,
                                phone: e.target.value,
                              })
                            }
                          />
                        </Field>{" "}
                      </div>{" "}
                    </div>{" "}
                    <div className="space-y-3">
                      {" "}
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                        Organization
                      </p>{" "}
                      <Field label="Branch">
                        {" "}
                        <Select
                          value={
                            employeeForm.branchId ||
                            String(branches[0]?.id || "")
                          }
                          onValueChange={(branchId) =>
                            setEmployeeForm({ ...employeeForm, branchId })
                          }
                        >
                          {" "}
                          <SelectTrigger>
                            <SelectValue placeholder="Select branch" />
                          </SelectTrigger>{" "}
                          <SelectContent>
                            {branches.map((branch: any) => (
                              <SelectItem
                                key={branch.id}
                                value={String(branch.id)}
                              >
                                {branch.name}
                              </SelectItem>
                            ))}
                          </SelectContent>{" "}
                        </Select>{" "}
                      </Field>{" "}
                      <div className="grid grid-cols-2 gap-3">
                        {" "}
                        <Field label="Department">
                          {" "}
                          <Select
                            value={employeeForm.departmentId || "none"}
                            onValueChange={(departmentId) =>
                              setEmployeeForm({
                                ...employeeForm,
                                departmentId:
                                  departmentId === "none" ? "" : departmentId,
                              })
                            }
                          >
                            {" "}
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>{" "}
                            <SelectContent>
                              <SelectItem value="none">None</SelectItem>
                              {(departmentsQuery.data ?? []).map(
                                (department: any) => (
                                  <SelectItem
                                    key={department.id}
                                    value={String(department.id)}
                                  >
                                    {department.code
                                      ? `${department.code} - `
                                      : ""}
                                    {department.name}
                                  </SelectItem>
                                ),
                              )}
                            </SelectContent>{" "}
                          </Select>{" "}
                        </Field>{" "}
                        <Field label="Position">
                          {" "}
                          <Select
                            value={employeeForm.positionId || "none"}
                            onValueChange={(positionId) =>
                              setEmployeeForm({
                                ...employeeForm,
                                positionId:
                                  positionId === "none" ? "" : positionId,
                              })
                            }
                          >
                            {" "}
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>{" "}
                            <SelectContent>
                              <SelectItem value="none">None</SelectItem>
                              {(positionsQuery.data ?? []).map(
                                (position: any) => (
                                  <SelectItem
                                    key={position.id}
                                    value={String(position.id)}
                                  >
                                    {position.title}
                                  </SelectItem>
                                ),
                              )}
                            </SelectContent>{" "}
                          </Select>{" "}
                        </Field>{" "}
                      </div>{" "}
                      <div className="grid grid-cols-3 gap-3">
                        {" "}
                        <Field label="Status">
                          <Select
                            value={employeeForm.status}
                            onValueChange={(status) =>
                              setEmployeeForm({ ...employeeForm, status })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="ACTIVE">Active</SelectItem>
                              <SelectItem value="SUSPENDED">
                                Suspended
                              </SelectItem>
                              <SelectItem value="TERMINATED">
                                Terminated
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </Field>{" "}
                        <Field label="Joined">
                          <Input
                            type="date"
                            value={employeeForm.joiningDate}
                            onChange={(e) =>
                              setEmployeeForm({
                                ...employeeForm,
                                joiningDate: e.target.value,
                              })
                            }
                          />
                        </Field>{" "}
                        <Field label="Terminated">
                          <Input
                            type="date"
                            value={employeeForm.terminationDate}
                            onChange={(e) =>
                              setEmployeeForm({
                                ...employeeForm,
                                terminationDate: e.target.value,
                              })
                            }
                          />
                        </Field>{" "}
                      </div>{" "}
                    </div>{" "}
                    <div className="space-y-3">
                      {" "}
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                        Statutory & Payment
                      </p>{" "}
                      <div className="grid grid-cols-2 gap-3">
                        {" "}
                        <Field label="NSSA No">
                          <Input
                            value={employeeForm.nssaNumber}
                            onChange={(e) =>
                              setEmployeeForm({
                                ...employeeForm,
                                nssaNumber: e.target.value,
                              })
                            }
                          />
                        </Field>{" "}
                        <Field label="ZIMRA Tax No">
                          <Input
                            value={employeeForm.zimraTaxNumber}
                            onChange={(e) =>
                              setEmployeeForm({
                                ...employeeForm,
                                zimraTaxNumber: e.target.value,
                              })
                            }
                          />
                        </Field>{" "}
                      </div>{" "}
                      <div className="grid grid-cols-2 gap-3">
                        {" "}
                        <Field label="Bank">
                          <Input
                            value={employeeForm.bankName}
                            onChange={(e) =>
                              setEmployeeForm({
                                ...employeeForm,
                                bankName: e.target.value,
                              })
                            }
                          />
                        </Field>{" "}
                        <Field label="Branch Code">
                          <Input
                            value={employeeForm.bankBranch}
                            onChange={(e) =>
                              setEmployeeForm({
                                ...employeeForm,
                                bankBranch: e.target.value,
                              })
                            }
                          />
                        </Field>{" "}
                      </div>{" "}
                      <div className="grid grid-cols-2 gap-3">
                        {" "}
                        <Field label="Account No">
                          <Input
                            value={employeeForm.bankAccountNumber}
                            onChange={(e) =>
                              setEmployeeForm({
                                ...employeeForm,
                                bankAccountNumber: e.target.value,
                              })
                            }
                          />
                        </Field>{" "}
                        <Field label="EcoCash">
                          <Input
                            value={employeeForm.ecocashNumber}
                            onChange={(e) =>
                              setEmployeeForm({
                                ...employeeForm,
                                ecocashNumber: e.target.value,
                              })
                            }
                          />
                        </Field>{" "}
                      </div>{" "}
                    </div>{" "}
                    <div className="space-y-3">
                      {" "}
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                        Contract
                      </p>{" "}
                      <div className="grid grid-cols-2 gap-3">
                        {" "}
                        <Field label="Type">
                          <Select
                            value={employeeForm.contractType}
                            onValueChange={(contractType) =>
                              setEmployeeForm({ ...employeeForm, contractType })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="PERMANENT">
                                Permanent
                              </SelectItem>
                              <SelectItem value="FIXED_TERM">
                                Fixed term
                              </SelectItem>
                              <SelectItem value="CASUAL">Casual</SelectItem>
                            </SelectContent>
                          </Select>
                        </Field>{" "}
                        <Field label="Pay Frequency">
                          <Select
                            value={employeeForm.payFrequency}
                            onValueChange={(payFrequency) =>
                              setEmployeeForm({ ...employeeForm, payFrequency })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="MONTHLY">Monthly</SelectItem>
                              <SelectItem value="FORTNIGHTLY">
                                Fortnightly
                              </SelectItem>
                              <SelectItem value="WEEKLY">Weekly</SelectItem>
                              <SelectItem value="DAILY">Daily</SelectItem>
                            </SelectContent>
                          </Select>
                        </Field>{" "}
                      </div>{" "}
                      <div className="grid grid-cols-2 gap-3">
                        {" "}
                        <Field label="Base Salary">
                          <Input
                            value={employeeForm.baseSalary}
                            onChange={(e) =>
                              setEmployeeForm({
                                ...employeeForm,
                                baseSalary: e.target.value,
                              })
                            }
                          />
                        </Field>{" "}
                        <Field label="Currency">
                          <Select
                            value={employeeForm.currency}
                            onValueChange={(currency) =>
                              setEmployeeForm({ ...employeeForm, currency })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="USD">USD</SelectItem>
                              <SelectItem value="ZIG">ZiG</SelectItem>
                              <SelectItem value="SPLIT">Split</SelectItem>
                            </SelectContent>
                          </Select>
                        </Field>{" "}
                      </div>{" "}
                      <div className="grid grid-cols-2 gap-3">
                        {" "}
                        <Field label="USD %">
                          <Input
                            value={employeeForm.usdPercentage}
                            onChange={(e) =>
                              setEmployeeForm({
                                ...employeeForm,
                                usdPercentage: e.target.value,
                              })
                            }
                          />
                        </Field>{" "}
                        <Field label="ZiG %">
                          <Input
                            value={employeeForm.zigPercentage}
                            onChange={(e) =>
                              setEmployeeForm({
                                ...employeeForm,
                                zigPercentage: e.target.value,
                              })
                            }
                          />
                        </Field>{" "}
                      </div>{" "}
                      <div className="grid grid-cols-2 gap-3">
                        {" "}
                        <Field label="Pay Grade">
                          <Select
                            value={employeeForm.payGradeId || "none"}
                            onValueChange={(payGradeId) =>
                              setEmployeeForm({
                                ...employeeForm,
                                payGradeId:
                                  payGradeId === "none" ? "" : payGradeId,
                              })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">None</SelectItem>
                              {(payGradesQuery.data ?? []).map((grade: any) => (
                                <SelectItem
                                  key={grade.id}
                                  value={String(grade.id)}
                                >
                                  {grade.code} - {grade.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </Field>{" "}
                        <Field label="NEC Sector">
                          <Select
                            value={employeeForm.necSectorId || "none"}
                            onValueChange={(necSectorId) =>
                              setEmployeeForm({
                                ...employeeForm,
                                necSectorId:
                                  necSectorId === "none" ? "" : necSectorId,
                              })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">None</SelectItem>
                              {(necQuery.data ?? []).map((sector: any) => (
                                <SelectItem
                                  key={sector.id}
                                  value={String(sector.id)}
                                >
                                  {sector.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </Field>{" "}
                      </div>{" "}
                    </div>{" "}
                    <div className="space-y-3">
                      {" "}
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                        Emergency Contact
                      </p>{" "}
                      <div className="grid grid-cols-2 gap-3">
                        {" "}
                        <Field label="Name">
                          <Input
                            value={employeeForm.emergencyContactName}
                            onChange={(e) =>
                              setEmployeeForm({
                                ...employeeForm,
                                emergencyContactName: e.target.value,
                              })
                            }
                          />
                        </Field>{" "}
                        <Field label="Phone">
                          <Input
                            value={employeeForm.emergencyContactPhone}
                            onChange={(e) =>
                              setEmployeeForm({
                                ...employeeForm,
                                emergencyContactPhone: e.target.value,
                              })
                            }
                          />
                        </Field>{" "}
                      </div>{" "}
                    </div>{" "}
                    <Button
                      className="w-full rounded-lg bg-slate-900 hover:bg-slate-800"
                      onClick={() => createEmployee.mutate()}
                      disabled={createEmployee.isPending}
                    >
                      {" "}
                      <UserPlus className="mr-2 h-4 w-4" />
                      Save Employee{" "}
                    </Button>{" "}
                  </CardContent>{" "}
                </Card>{" "}
                <Card className="rounded-lg border-slate-200">
                  {" "}
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">
                      Departments & Positions
                    </CardTitle>
                  </CardHeader>{" "}
                  <CardContent className="space-y-4">
                    {" "}
                    <div className="space-y-3">
                      {" "}
                      <div className="grid grid-cols-2 gap-3">
                        {" "}
                        <Field label="Dept Code">
                          <Input
                            value={departmentForm.code}
                            onChange={(e) =>
                              setDepartmentForm({
                                ...departmentForm,
                                code: e.target.value,
                              })
                            }
                          />
                        </Field>{" "}
                        <Field label="Dept Name">
                          <Input
                            value={departmentForm.name}
                            onChange={(e) =>
                              setDepartmentForm({
                                ...departmentForm,
                                name: e.target.value,
                              })
                            }
                          />
                        </Field>{" "}
                      </div>{" "}
                      <Button
                        variant="outline"
                        className="w-full rounded-lg"
                        onClick={() => createDepartment.mutate()}
                        disabled={createDepartment.isPending}
                      >
                        Save Department
                      </Button>{" "}
                    </div>{" "}
                    <div className="space-y-3">
                      {" "}
                      <Field label="Position Title">
                        <Input
                          value={positionForm.title}
                          onChange={(e) =>
                            setPositionForm({
                              ...positionForm,
                              title: e.target.value,
                            })
                          }
                        />
                      </Field>{" "}
                      <div className="grid grid-cols-2 gap-3">
                        {" "}
                        <Field label="Grade">
                          <Input
                            value={positionForm.grade}
                            onChange={(e) =>
                              setPositionForm({
                                ...positionForm,
                                grade: e.target.value,
                              })
                            }
                          />
                        </Field>{" "}
                        <Field label="NEC Category">
                          <Input
                            value={positionForm.necCategory}
                            onChange={(e) =>
                              setPositionForm({
                                ...positionForm,
                                necCategory: e.target.value,
                              })
                            }
                          />
                        </Field>{" "}
                      </div>{" "}
                      <Button
                        variant="outline"
                        className="w-full rounded-lg"
                        onClick={() => createPosition.mutate()}
                        disabled={createPosition.isPending}
                      >
                        Save Position
                      </Button>{" "}
                    </div>{" "}
                  </CardContent>{" "}
                </Card>{" "}
              </div>{" "}
              <Card className="rounded-lg border-slate-200">
                {" "}
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">
                    Employee Directory
                  </CardTitle>
                </CardHeader>{" "}
                <CardContent className="p-0">
                  {" "}
                  <Table>
                    {" "}
                    <TableHeader>
                      {" "}
                      <TableRow>
                        {" "}
                        <TableHead className="pl-6">Employee</TableHead>{" "}
                        <TableHead>Organization</TableHead>{" "}
                        <TableHead>Statutory</TableHead>{" "}
                        <TableHead>Payment</TableHead>{" "}
                        <TableHead>Status</TableHead>{" "}
                        <TableHead className="text-right pr-6">
                          Salary
                        </TableHead>{" "}
                      </TableRow>{" "}
                    </TableHeader>{" "}
                    <TableBody>
                      {" "}
                      {employees.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={6}
                            className="h-24 text-center text-slate-500"
                          >
                            No employees yet.
                          </TableCell>
                        </TableRow>
                      ) : (
                        employees.map((employee) => {
                          const contract = employee.contracts?.[0];
                          return (
                            <TableRow key={employee.id}>
                              {" "}
                              <TableCell className="pl-6">
                                {" "}
                                <p className="font-bold text-slate-900">
                                  {employee.firstName} {employee.lastName}
                                </p>{" "}
                                <p className="text-xs text-slate-500">
                                  {employee.employeeNumber} ·{" "}
                                  {employee.nationalId}
                                </p>{" "}
                              </TableCell>{" "}
                              <TableCell>
                                {" "}
                                <p className=" font-medium text-slate-800">
                                  {employee.department?.name || "-"}
                                </p>{" "}
                                <p className="text-xs text-slate-500">
                                  {employee.position?.title || "-"}
                                </p>{" "}
                              </TableCell>{" "}
                              <TableCell>
                                {" "}
                                <p className="text-xs text-slate-600">
                                  ZIMRA: {employee.zimraTaxNumber || "Missing"}
                                </p>{" "}
                                <p className="text-xs text-slate-600">
                                  NSSA: {employee.nssaNumber || "Missing"}
                                </p>{" "}
                              </TableCell>{" "}
                              <TableCell>
                                {" "}
                                <p className="text-xs text-slate-600">
                                  {employee.bankName || "No bank"}
                                </p>{" "}
                                <p className="text-xs text-slate-600">
                                  {employee.bankAccountNumber ||
                                    employee.ecocashNumber ||
                                    "No payout detail"}
                                </p>{" "}
                              </TableCell>{" "}
                              <TableCell>
                                <StatusBadge status={employee.status} />
                              </TableCell>{" "}
                              <TableCell className="text-right pr-6">
                                {" "}
                                <p className="font-semibold">
                                  {contract
                                    ? money(
                                        contract.baseSalary,
                                        contract.currency === "ZIG"
                                          ? "ZIG"
                                          : "USD",
                                      )
                                    : "-"}
                                </p>{" "}
                                <p className="text-xs text-slate-500">
                                  {contract
                                    ? `${contract.payFrequency || "MONTHLY"} - ${contract.usdPercentage}%/${contract.zigPercentage}%`
                                    : ""}
                                </p>{" "}
                              </TableCell>{" "}
                            </TableRow>
                          );
                        })
                      )}{" "}
                    </TableBody>{" "}
                  </Table>{" "}
                </CardContent>{" "}
              </Card>{" "}
            </div>{" "}
          </TabsContent>{" "}
          <TabsContent value="pay-grades" className="space-y-4">
            {" "}
            <div className="grid gap-4 md:grid-cols-3">
              {" "}
              <CompactMetric
                label="Active Grades"
                value={(payGradesQuery.data ?? []).length}
              />{" "}
              <CompactMetric
                label="NEC Sectors"
                value={(necQuery.data ?? []).length}
              />{" "}
              <CompactMetric
                label="Employees Graded"
                value={
                  employees.filter(
                    (employee) => employee.contracts?.[0]?.payGradeId,
                  ).length
                }
              />{" "}
            </div>{" "}
            <div className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
              {" "}
              <RequestPanel
                title="Pay Grade"
                icon={Briefcase}
                onSubmit={() => createPayGrade.mutate()}
                pending={createPayGrade.isPending}
              >
                {" "}
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Code">
                    <Input
                      value={payGradeForm.code}
                      onChange={(e) =>
                        setPayGradeForm({
                          ...payGradeForm,
                          code: e.target.value,
                        })
                      }
                    />
                  </Field>
                  <Field label="Name">
                    <Input
                      value={payGradeForm.name}
                      onChange={(e) =>
                        setPayGradeForm({
                          ...payGradeForm,
                          name: e.target.value,
                        })
                      }
                    />
                  </Field>
                </div>{" "}
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Min">
                    <Input
                      value={payGradeForm.minSalary}
                      onChange={(e) =>
                        setPayGradeForm({
                          ...payGradeForm,
                          minSalary: e.target.value,
                        })
                      }
                    />
                  </Field>
                  <Field label="Mid">
                    <Input
                      value={payGradeForm.midpointSalary}
                      onChange={(e) =>
                        setPayGradeForm({
                          ...payGradeForm,
                          midpointSalary: e.target.value,
                        })
                      }
                    />
                  </Field>
                  <Field label="Max">
                    <Input
                      value={payGradeForm.maxSalary}
                      onChange={(e) =>
                        setPayGradeForm({
                          ...payGradeForm,
                          maxSalary: e.target.value,
                        })
                      }
                    />
                  </Field>
                </div>{" "}
                <Field label="Effective From">
                  <Input
                    type="date"
                    value={payGradeForm.effectiveFrom}
                    onChange={(e) =>
                      setPayGradeForm({
                        ...payGradeForm,
                        effectiveFrom: e.target.value,
                      })
                    }
                  />
                </Field>{" "}
              </RequestPanel>{" "}
              <ConfigCard
                title="Pay Grades"
                items={(payGradesQuery.data ?? []).map((grade: any) => ({
                  label: `${grade.code} - ${grade.name}`,
                  detail: `${grade.currency} ${grade.payFrequency} - ${money(grade.minSalary, grade.currency === "ZIG" ? "ZIG" : "USD")} / ${money(grade.midpointSalary, grade.currency === "ZIG" ? "ZIG" : "USD")} / ${money(grade.maxSalary, grade.currency === "ZIG" ? "ZIG" : "USD")}`,
                }))}
              />{" "}
            </div>{" "}
          </TabsContent>{" "}
          <TabsContent value="pay-items" className="space-y-4">
            {" "}
            <div className="grid gap-4 md:grid-cols-3">
              {" "}
              <CompactMetric
                label="Earning Types"
                value={(earningTypesQuery.data ?? []).length}
              />{" "}
              <CompactMetric
                label="Deduction Types"
                value={(deductionTypesQuery.data ?? []).length}
              />{" "}
              <CompactMetric
                label="Selected Items"
                value={(recurringItemsQuery.data ?? []).length}
              />{" "}
            </div>{" "}
            <div className="grid gap-4 xl:grid-cols-3">
              {" "}
              <RequestPanel
                title="Earning Type"
                icon={Banknote}
                onSubmit={() => createEarningType.mutate()}
                pending={createEarningType.isPending}
              >
                {" "}
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Code">
                    <Input
                      value={earningTypeForm.code}
                      onChange={(e) =>
                        setEarningTypeForm({
                          ...earningTypeForm,
                          code: e.target.value,
                        })
                      }
                    />
                  </Field>
                  <Field label="Name">
                    <Input
                      value={earningTypeForm.name}
                      onChange={(e) =>
                        setEarningTypeForm({
                          ...earningTypeForm,
                          name: e.target.value,
                        })
                      }
                    />
                  </Field>
                </div>{" "}
                <Field label="Tax Treatment">
                  <Select
                    value={earningTypeForm.taxTreatment}
                    onValueChange={(taxTreatment) =>
                      setEarningTypeForm({ ...earningTypeForm, taxTreatment })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TAXABLE">Taxable</SelectItem>
                      <SelectItem value="NON_TAXABLE">Non-taxable</SelectItem>
                      <SelectItem value="PARTIAL">Partially taxable</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>{" "}
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Pensionable">
                    <Select
                      value={earningTypeForm.isPensionable}
                      onValueChange={(isPensionable) =>
                        setEarningTypeForm({
                          ...earningTypeForm,
                          isPensionable,
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="false">No</SelectItem>
                        <SelectItem value="true">Yes</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="NSSA Applies">
                    <Select
                      value={earningTypeForm.isNssaApplicable}
                      onValueChange={(isNssaApplicable) =>
                        setEarningTypeForm({
                          ...earningTypeForm,
                          isNssaApplicable,
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="false">No</SelectItem>
                        <SelectItem value="true">Yes</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>{" "}
              </RequestPanel>{" "}
              <RequestPanel
                title="Deduction Type"
                icon={HandCoins}
                onSubmit={() => createDeductionType.mutate()}
                pending={createDeductionType.isPending}
              >
                {" "}
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Code">
                    <Input
                      value={deductionTypeForm.code}
                      onChange={(e) =>
                        setDeductionTypeForm({
                          ...deductionTypeForm,
                          code: e.target.value,
                        })
                      }
                    />
                  </Field>
                  <Field label="Name">
                    <Input
                      value={deductionTypeForm.name}
                      onChange={(e) =>
                        setDeductionTypeForm({
                          ...deductionTypeForm,
                          name: e.target.value,
                        })
                      }
                    />
                  </Field>
                </div>{" "}
                <Field label="Timing">
                  <Select
                    value={deductionTypeForm.timing}
                    onValueChange={(timing) =>
                      setDeductionTypeForm({ ...deductionTypeForm, timing })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PRE_TAX">Pre-tax</SelectItem>
                      <SelectItem value="POST_TAX">Post-tax</SelectItem>
                      <SelectItem value="STATUTORY">Statutory</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>{" "}
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Employee Rate">
                    <Input
                      value={deductionTypeForm.employeeRate}
                      onChange={(e) =>
                        setDeductionTypeForm({
                          ...deductionTypeForm,
                          employeeRate: e.target.value,
                        })
                      }
                    />
                  </Field>
                  <Field label="Employer Rate">
                    <Input
                      value={deductionTypeForm.employerRate}
                      onChange={(e) =>
                        setDeductionTypeForm({
                          ...deductionTypeForm,
                          employerRate: e.target.value,
                        })
                      }
                    />
                  </Field>
                </div>{" "}
              </RequestPanel>{" "}
              <RequestPanel
                title="Employee Pay Item"
                icon={Plus}
                onSubmit={() => createRecurringItem.mutate()}
                pending={createRecurringItem.isPending}
              >
                {" "}
                <EmployeeSelect
                  employees={employees}
                  value={recurringForm.employeeId || selectedEmployeeId}
                  onChange={(employeeId) => {
                    setSelectedEmployeeId(employeeId);
                    setRecurringForm({ ...recurringForm, employeeId });
                  }}
                />{" "}
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Type">
                    <Select
                      value={recurringForm.type}
                      onValueChange={(type) =>
                        setRecurringForm({ ...recurringForm, type })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALLOWANCE">Allowance</SelectItem>
                        <SelectItem value="DEDUCTION">Deduction</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Amount">
                    <Input
                      value={recurringForm.amount}
                      onChange={(e) =>
                        setRecurringForm({
                          ...recurringForm,
                          amount: e.target.value,
                        })
                      }
                    />
                  </Field>
                </div>{" "}
                <Field label="Name">
                  <Input
                    value={recurringForm.name}
                    onChange={(e) =>
                      setRecurringForm({
                        ...recurringForm,
                        name: e.target.value,
                      })
                    }
                  />
                </Field>{" "}
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Taxable">
                    <Select
                      value={recurringForm.isTaxable}
                      onValueChange={(isTaxable) =>
                        setRecurringForm({ ...recurringForm, isTaxable })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">Yes</SelectItem>
                        <SelectItem value="false">No</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Pre-tax">
                    <Select
                      value={recurringForm.isTaxDeductible}
                      onValueChange={(isTaxDeductible) =>
                        setRecurringForm({ ...recurringForm, isTaxDeductible })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="false">No</SelectItem>
                        <SelectItem value="true">Yes</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>{" "}
              </RequestPanel>{" "}
            </div>{" "}
            <div className="grid gap-4 lg:grid-cols-3">
              {" "}
              <ConfigCard
                title="Earning Types"
                items={(earningTypesQuery.data ?? []).map((item: any) => ({
                  label: `${item.code} - ${item.name}`,
                  detail: `${item.category} - ${item.taxTreatment} - NSSA ${item.isNssaApplicable ? "Yes" : "No"}`,
                }))}
              />{" "}
              <ConfigCard
                title="Deduction Types"
                items={(deductionTypesQuery.data ?? []).map((item: any) => ({
                  label: `${item.code} - ${item.name}`,
                  detail: `${item.timing} - ${item.contributionSide} - Priority ${item.priorityOrder}`,
                }))}
              />{" "}
              <ConfigCard
                title="Employee Pay Items"
                items={(recurringItemsQuery.data ?? []).map((item: any) => ({
                  label: `${item.name} - ${money(item.amount)}`,
                  detail: `${item.type} - ${item.type === "ALLOWANCE" ? (item.isTaxable ? "Taxable" : "Non-taxable") : item.isTaxDeductible ? "Pre-tax" : "Post-tax"}`,
                }))}
              />{" "}
            </div>{" "}
          </TabsContent>{" "}
          <TabsContent
            value="leave"
            className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]"
          >
            {" "}
            <RequestPanel
              title="Leave Request"
              icon={CalendarCheck}
              onSubmit={() => createLeave.mutate()}
              pending={createLeave.isPending}
            >
              {" "}
              <EmployeeSelect
                employees={employees}
                value={leaveForm.employeeId}
                onChange={(employeeId) =>
                  setLeaveForm({ ...leaveForm, employeeId })
                }
              />{" "}
              <Field label="Leave Type">
                {" "}
                <Select
                  value={leaveForm.leaveType}
                  onValueChange={(leaveType) =>
                    setLeaveForm({ ...leaveForm, leaveType })
                  }
                >
                  {" "}
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>{" "}
                  <SelectContent>
                    {[
                      "ANNUAL",
                      "SICK",
                      "MATERNITY",
                      "COMPASSIONATE",
                      "UNPAID",
                    ].map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>{" "}
                </Select>{" "}
              </Field>{" "}
              <div className="grid grid-cols-2 gap-3">
                {" "}
                <Field label="Start">
                  <Input
                    type="date"
                    value={leaveForm.startDate}
                    onChange={(e) =>
                      setLeaveForm({ ...leaveForm, startDate: e.target.value })
                    }
                  />
                </Field>{" "}
                <Field label="End">
                  <Input
                    type="date"
                    value={leaveForm.endDate}
                    onChange={(e) =>
                      setLeaveForm({ ...leaveForm, endDate: e.target.value })
                    }
                  />
                </Field>{" "}
              </div>{" "}
              <Field label="Days">
                <Input
                  value={leaveForm.totalDays}
                  onChange={(e) =>
                    setLeaveForm({ ...leaveForm, totalDays: e.target.value })
                  }
                />
              </Field>{" "}
            </RequestPanel>{" "}
            <SimpleList
              title="Leave Requests"
              empty="No leave requests."
              rows={(leaveQuery.data ?? []).map((request: any) => ({
                id: request.id,
                primary: `${request.employee?.firstName || ""} ${request.employee?.lastName || ""}`,
                secondary: `${request.leaveType} · ${request.startDate} to ${request.endDate} · ${request.totalDays} day(s)`,
                status: request.status,
                action:
                  request.status === "PENDING" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-lg"
                      onClick={() =>
                        approveLeave.mutate({ id: request.id, approve: true })
                      }
                    >
                      Approve
                    </Button>
                  ) : null,
              }))}
            />{" "}
          </TabsContent>{" "}
          <TabsContent
            value="loans"
            className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]"
          >
            {" "}
            <RequestPanel
              title="Loan / Advance"
              icon={HandCoins}
              onSubmit={() => createLoan.mutate()}
              pending={createLoan.isPending}
            >
              {" "}
              <EmployeeSelect
                employees={employees}
                value={loanForm.employeeId}
                onChange={(employeeId) =>
                  setLoanForm({ ...loanForm, employeeId })
                }
              />{" "}
              <Field label="Principal">
                <Input
                  value={loanForm.principalAmount}
                  onChange={(e) =>
                    setLoanForm({
                      ...loanForm,
                      principalAmount: e.target.value,
                    })
                  }
                />
              </Field>{" "}
              <div className="grid grid-cols-2 gap-3">
                {" "}
                <Field label="Months">
                  <Input
                    value={loanForm.repaymentTermMonths}
                    onChange={(e) =>
                      setLoanForm({
                        ...loanForm,
                        repaymentTermMonths: e.target.value,
                      })
                    }
                  />
                </Field>{" "}
                <Field label="Monthly">
                  <Input
                    value={loanForm.monthlyRepaymentAmount}
                    onChange={(e) =>
                      setLoanForm({
                        ...loanForm,
                        monthlyRepaymentAmount: e.target.value,
                      })
                    }
                  />
                </Field>{" "}
              </div>{" "}
            </RequestPanel>{" "}
            <SimpleList
              title="Loans & Advances"
              empty="No loans recorded."
              rows={(loansQuery.data ?? []).map((loan: any) => ({
                id: loan.id,
                primary: `${loan.employee?.firstName || ""} ${loan.employee?.lastName || ""}`,
                secondary: `${money(loan.remainingBalance)} remaining · ${money(loan.monthlyRepaymentAmount)} monthly`,
                status: loan.status,
                action:
                  loan.status === "PENDING" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-lg"
                      onClick={() => approveLoan.mutate(loan.id)}
                    >
                      Approve
                    </Button>
                  ) : null,
              }))}
            />{" "}
          </TabsContent>{" "}
          <TabsContent value="statutory" className="space-y-4">
            {" "}
            <Tabs defaultValue="paye" className="space-y-4">
              {" "}
              <TabsList className="h-auto flex-wrap justify-start rounded-lg border border-slate-200 bg-white p-1">
                {" "}
                <TabsTrigger value="paye" className="rounded-md">
                  PAYE
                </TabsTrigger>{" "}
                <TabsTrigger value="nssa" className="rounded-md">
                  NSSA
                </TabsTrigger>{" "}
                <TabsTrigger value="aids-levy" className="rounded-md">
                  AIDS Levy
                </TabsTrigger>{" "}
                <TabsTrigger value="nec" className="rounded-md">
                  NEC
                </TabsTrigger>{" "}
              </TabsList>{" "}
              <TabsContent value="paye" className="space-y-4">
                {" "}
                <div className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
                  {" "}
                  <Card className="rounded-lg border-slate-200">
                    {" "}
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Calculator className="h-4 w-4" />
                        PAYE Tax Table
                      </CardTitle>
                    </CardHeader>{" "}
                    <CardContent className="space-y-3">
                      {" "}
                      <div className="grid grid-cols-2 gap-3">
                        {" "}
                        <Field label="Currency">
                          <Select
                            value={taxForm.currency}
                            onValueChange={(currency) =>
                              setTaxForm({ ...taxForm, currency })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="USD">USD</SelectItem>
                              <SelectItem value="ZIG">ZiG</SelectItem>
                            </SelectContent>
                          </Select>
                        </Field>{" "}
                        <Field label="Effective From">
                          <Input
                            type="date"
                            value={taxForm.effectiveFrom}
                            onChange={(e) =>
                              setTaxForm({
                                ...taxForm,
                                effectiveFrom: e.target.value,
                              })
                            }
                          />
                        </Field>{" "}
                      </div>{" "}
                      <Field label="PAYE Brackets JSON">
                        <Input
                          value={taxForm.bracketsJson}
                          onChange={(e) =>
                            setTaxForm({
                              ...taxForm,
                              bracketsJson: e.target.value,
                            })
                          }
                        />
                      </Field>{" "}
                      <Button
                        className="w-full rounded-lg bg-slate-900 hover:bg-slate-800"
                        onClick={() => createTaxConfig.mutate()}
                        disabled={createTaxConfig.isPending}
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Save PAYE Table
                      </Button>{" "}
                    </CardContent>{" "}
                  </Card>{" "}
                  <ConfigCard
                    title="PAYE Tables"
                    items={(taxConfigQuery.data ?? []).map((config: any) => ({
                      label: `${config.currency} from ${config.effectiveFrom}`,
                      detail: `${config.brackets?.length || 0} bands - AIDS ${Number(config.aidsLevyRate) * 100}%`,
                    }))}
                  />{" "}
                </div>{" "}
              </TabsContent>{" "}
              <TabsContent value="nssa" className="space-y-4">
                {" "}
                <div className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
                  {" "}
                  <Card className="rounded-lg border-slate-200">
                    {" "}
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Calculator className="h-4 w-4" />
                        NSSA Rates
                      </CardTitle>
                    </CardHeader>{" "}
                    <CardContent className="space-y-3">
                      {" "}
                      <div className="grid grid-cols-2 gap-3">
                        {" "}
                        <Field label="Currency">
                          <Select
                            value={taxForm.currency}
                            onValueChange={(currency) =>
                              setTaxForm({ ...taxForm, currency })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="USD">USD</SelectItem>
                              <SelectItem value="ZIG">ZiG</SelectItem>
                            </SelectContent>
                          </Select>
                        </Field>{" "}
                        <Field label="Effective From">
                          <Input
                            type="date"
                            value={taxForm.effectiveFrom}
                            onChange={(e) =>
                              setTaxForm({
                                ...taxForm,
                                effectiveFrom: e.target.value,
                              })
                            }
                          />
                        </Field>{" "}
                      </div>{" "}
                      <div className="grid grid-cols-2 gap-3">
                        {" "}
                        <Field label="Employee Rate">
                          <Input
                            value={taxForm.nssaRateEmployee}
                            onChange={(e) =>
                              setTaxForm({
                                ...taxForm,
                                nssaRateEmployee: e.target.value,
                              })
                            }
                          />
                        </Field>{" "}
                        <Field label="Employer Rate">
                          <Input
                            value={taxForm.nssaRateEmployer}
                            onChange={(e) =>
                              setTaxForm({
                                ...taxForm,
                                nssaRateEmployer: e.target.value,
                              })
                            }
                          />
                        </Field>{" "}
                      </div>{" "}
                      <Field label="Ceiling">
                        <Input
                          value={taxForm.nssaCeilingLimit}
                          onChange={(e) =>
                            setTaxForm({
                              ...taxForm,
                              nssaCeilingLimit: e.target.value,
                            })
                          }
                        />
                      </Field>{" "}
                      <Button
                        className="w-full rounded-lg bg-slate-900 hover:bg-slate-800"
                        onClick={() => createTaxConfig.mutate()}
                        disabled={createTaxConfig.isPending}
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Save NSSA Rates
                      </Button>{" "}
                    </CardContent>{" "}
                  </Card>{" "}
                  <ConfigCard
                    title="NSSA Configurations"
                    items={(taxConfigQuery.data ?? []).map((config: any) => ({
                      label: `${config.currency} from ${config.effectiveFrom}`,
                      detail: `${Number(config.nssaRateEmployee) * 100}% employee - ${Number(config.nssaRateEmployer) * 100}% employer - ceiling ${money(config.nssaCeilingLimit, config.currency === "ZIG" ? "ZIG" : "USD")}`,
                    }))}
                  />{" "}
                </div>{" "}
              </TabsContent>{" "}
              <TabsContent value="aids-levy" className="space-y-4">
                {" "}
                <div className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
                  {" "}
                  <Card className="rounded-lg border-slate-200">
                    {" "}
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Calculator className="h-4 w-4" />
                        AIDS Levy
                      </CardTitle>
                    </CardHeader>{" "}
                    <CardContent className="space-y-3">
                      {" "}
                      <div className="grid grid-cols-2 gap-3">
                        {" "}
                        <Field label="Currency">
                          <Select
                            value={taxForm.currency}
                            onValueChange={(currency) =>
                              setTaxForm({ ...taxForm, currency })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="USD">USD</SelectItem>
                              <SelectItem value="ZIG">ZiG</SelectItem>
                            </SelectContent>
                          </Select>
                        </Field>{" "}
                        <Field label="Effective From">
                          <Input
                            type="date"
                            value={taxForm.effectiveFrom}
                            onChange={(e) =>
                              setTaxForm({
                                ...taxForm,
                                effectiveFrom: e.target.value,
                              })
                            }
                          />
                        </Field>{" "}
                      </div>{" "}
                      <Field label="Levy Rate">
                        <Input
                          value={taxForm.aidsLevyRate}
                          onChange={(e) =>
                            setTaxForm({
                              ...taxForm,
                              aidsLevyRate: e.target.value,
                            })
                          }
                        />
                      </Field>{" "}
                      <Button
                        className="w-full rounded-lg bg-slate-900 hover:bg-slate-800"
                        onClick={() => createTaxConfig.mutate()}
                        disabled={createTaxConfig.isPending}
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Save AIDS Levy
                      </Button>{" "}
                    </CardContent>{" "}
                  </Card>{" "}
                  <ConfigCard
                    title="AIDS Levy Rates"
                    items={(taxConfigQuery.data ?? []).map((config: any) => ({
                      label: `${config.currency} from ${config.effectiveFrom}`,
                      detail: `${Number(config.aidsLevyRate) * 100}% of PAYE`,
                    }))}
                  />{" "}
                </div>{" "}
              </TabsContent>{" "}
              <TabsContent value="nec" className="space-y-4">
                {" "}
                <ConfigCard
                  title="NEC Sectors"
                  items={(necQuery.data ?? []).map((sector: any) => ({
                    label: sector.name,
                    detail: `${Number(sector.employeeRate) * 100}% employee - ${Number(sector.employerRate) * 100}% employer`,
                  }))}
                />{" "}
              </TabsContent>{" "}
            </Tabs>{" "}
          </TabsContent>{" "}
          <TabsContent value="reports" className="space-y-4">
            {" "}
            <div className="grid gap-4 md:grid-cols-4">
              {" "}
              <CompactMetric
                label="P2 Status"
                value={
                  complianceDashboardQuery.data?.currentMonthP2Status ===
                  "SUBMITTED"
                    ? 1
                    : 0
                }
              />{" "}
              <CompactMetric
                label="PAYE Payable"
                value={Math.round(
                  Number(
                    complianceDashboardQuery.data?.totals?.payePayable || 0,
                  ),
                )}
              />{" "}
              <CompactMetric
                label="NSSA Payable"
                value={Math.round(
                  Number(
                    complianceDashboardQuery.data?.totals?.nssaPayable || 0,
                  ),
                )}
              />{" "}
              <CompactMetric
                label="Missing Tax Data"
                value={Number(
                  complianceDashboardQuery.data?.missingEmployeeTaxData || 0,
                )}
              />{" "}
            </div>{" "}
            <Card className="rounded-lg border-slate-200">
              {" "}
              <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                {" "}
                <div>
                  {" "}
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                    Reconciliation
                  </p>{" "}
                  <p className="mt-1 text-slate-700">
                    {" "}
                    {reconciliationQuery.data?.status || "PENDING"} ·{" "}
                    {
                      (reconciliationQuery.data?.checks || []).filter(
                        (check: any) => check.status === "FAIL",
                      ).length
                    }{" "}
                    exception(s){" "}
                  </p>{" "}
                </div>{" "}
                <div className="flex flex-wrap gap-2">
                  {" "}
                  {(reconciliationQuery.data?.checks || [])
                    .slice(0, 5)
                    .map((check: any) => (
                      <Badge
                        key={check.name}
                        variant="outline"
                        className={cn(
                          "rounded-md",
                          check.status === "PASS"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-amber-200 bg-amber-50 text-amber-700",
                        )}
                      >
                        {" "}
                        {check.name}: {check.status}{" "}
                      </Badge>
                    ))}{" "}
                </div>{" "}
              </CardContent>{" "}
            </Card>{" "}
            <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
              {" "}
              <Card className="rounded-lg border-slate-200">
                {" "}
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <FileCheck2 className="h-4 w-4" />
                    Generate Report
                  </CardTitle>
                </CardHeader>{" "}
                <CardContent className="space-y-3">
                  {" "}
                  <Field label="Report">
                    {" "}
                    <Select
                      value={reportForm.reportType}
                      onValueChange={(reportType) =>
                        setReportForm({ ...reportForm, reportType })
                      }
                    >
                      {" "}
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>{" "}
                      <SelectContent>
                        {(reportCatalogQuery.data ?? []).map((report: any) => (
                          <SelectItem key={report.type} value={report.type}>
                            {report.type} - {report.name}
                          </SelectItem>
                        ))}
                      </SelectContent>{" "}
                    </Select>{" "}
                  </Field>{" "}
                  <div className="grid grid-cols-2 gap-3">
                    {" "}
                    <Field label="From">
                      <Input
                        type="date"
                        value={reportForm.periodStart}
                        onChange={(e) =>
                          setReportForm({
                            ...reportForm,
                            periodStart: e.target.value,
                          })
                        }
                      />
                    </Field>{" "}
                    <Field label="To">
                      <Input
                        type="date"
                        value={reportForm.periodEnd}
                        onChange={(e) =>
                          setReportForm({
                            ...reportForm,
                            periodEnd: e.target.value,
                          })
                        }
                      />
                    </Field>{" "}
                  </div>{" "}
                  <Field label="Currency">
                    {" "}
                    <Select
                      value={reportForm.currency}
                      onValueChange={(currency) =>
                        setReportForm({ ...reportForm, currency })
                      }
                    >
                      {" "}
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>{" "}
                      <SelectContent>
                        <SelectItem value="USD">USD</SelectItem>
                        <SelectItem value="ZIG">ZiG</SelectItem>
                      </SelectContent>{" "}
                    </Select>{" "}
                  </Field>{" "}
                  <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                    {" "}
                    <p className="text-xs font-bold uppercase text-slate-500">
                      Validation
                    </p>{" "}
                    <p className="mt-1 text-slate-700">
                      {" "}
                      {reportValidationQuery.data?.validationSummary?.errors ||
                        0}{" "}
                      errors ·{" "}
                      {reportValidationQuery.data?.validationSummary
                        ?.warnings || 0}{" "}
                      warnings{" "}
                    </p>{" "}
                  </div>{" "}
                  <Field label="Submission Ref">
                    <Input
                      value={submissionReference}
                      onChange={(event) =>
                        setSubmissionReference(event.target.value)
                      }
                      placeholder="ZIMRA/NSSA reference after portal filing"
                    />
                  </Field>{" "}
                  <Button
                    className="w-full rounded-lg bg-slate-900 hover:bg-slate-800"
                    onClick={() => generateReport.mutate()}
                    disabled={
                      generateReport.isPending ||
                      (reportValidationQuery.data?.validationSummary?.errors ||
                        0) > 0
                    }
                  >
                    {" "}
                    <BarChart3 className="mr-2 h-4 w-4" />
                    Generate Snapshot{" "}
                  </Button>{" "}
                </CardContent>{" "}
              </Card>{" "}
              <Card className="rounded-lg border-slate-200">
                {" "}
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Generated Reports</CardTitle>
                </CardHeader>{" "}
                <CardContent className="p-0">
                  {" "}
                  <Table>
                    {" "}
                    <TableHeader>
                      {" "}
                      <TableRow>
                        {" "}
                        <TableHead className="pl-6">Report</TableHead>{" "}
                        <TableHead>Period</TableHead>{" "}
                        <TableHead>Status</TableHead>{" "}
                        <TableHead>Approval</TableHead>{" "}
                        <TableHead>Validation</TableHead>{" "}
                        <TableHead className="text-right pr-6">
                          Export
                        </TableHead>{" "}
                      </TableRow>{" "}
                    </TableHeader>{" "}
                    <TableBody>
                      {" "}
                      {(generatedReportsQuery.data ?? []).length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={6}
                            className="h-24 text-center text-slate-500"
                          >
                            No statutory reports generated yet.
                          </TableCell>
                        </TableRow>
                      ) : (
                        (generatedReportsQuery.data ?? []).map(
                          (report: any) => (
                            <TableRow key={report.id}>
                              {" "}
                              <TableCell className="pl-6 font-bold">
                                {report.reportType} v{report.version}
                              </TableCell>{" "}
                              <TableCell>
                                {report.periodStart} to {report.periodEnd}
                              </TableCell>{" "}
                              <TableCell>
                                <StatusBadge
                                  status={
                                    report.submissionStatus || report.status
                                  }
                                />
                              </TableCell>{" "}
                              <TableCell>
                                <StatusBadge
                                  status={report.approvalStatus || "PENDING"}
                                />
                              </TableCell>{" "}
                              <TableCell>
                                {report.validationSummary?.errors || 0} errors ·{" "}
                                {report.validationSummary?.warnings || 0}{" "}
                                warnings
                              </TableCell>{" "}
                              <TableCell className="text-right pr-6">
                                {" "}
                                <div className="flex justify-end gap-2">
                                  {" "}
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="rounded-lg"
                                    onClick={() =>
                                      approveReport.mutate(report.id)
                                    }
                                    disabled={
                                      approveReport.isPending ||
                                      report.approvalStatus === "APPROVED" ||
                                      report.status === "REVERSED"
                                    }
                                  >
                                    {" "}
                                    Approve{" "}
                                  </Button>{" "}
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="rounded-lg"
                                    onClick={() =>
                                      exportReport(report.id, "CSV").catch(
                                        (error) =>
                                          toast({
                                            title: "Export failed",
                                            description: error.message,
                                            variant: "destructive",
                                          }),
                                      )
                                    }
                                  >
                                    {" "}
                                    <Download className="mr-2 h-4 w-4" />
                                    CSV{" "}
                                  </Button>{" "}
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="rounded-lg"
                                    onClick={() =>
                                      exportReport(report.id, "EXCEL").catch(
                                        (error) =>
                                          toast({
                                            title: "Export failed",
                                            description: error.message,
                                            variant: "destructive",
                                          }),
                                      )
                                    }
                                  >
                                    {" "}
                                    XLSX{" "}
                                  </Button>{" "}
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="rounded-lg"
                                    onClick={() =>
                                      exportReport(
                                        report.id,
                                        "ZIMRA_EFILE",
                                      ).catch((error) =>
                                        toast({
                                          title: "Export failed",
                                          description: error.message,
                                          variant: "destructive",
                                        }),
                                      )
                                    }
                                  >
                                    {" "}
                                    E-file{" "}
                                  </Button>{" "}
                                  <Button
                                    size="sm"
                                    className="rounded-lg bg-slate-900 hover:bg-slate-800"
                                    onClick={() =>
                                      submitReport.mutate(report.id)
                                    }
                                    disabled={
                                      submitReport.isPending ||
                                      report.approvalStatus !== "APPROVED" ||
                                      report.submissionStatus === "SUBMITTED"
                                    }
                                  >
                                    {" "}
                                    Submit{" "}
                                  </Button>{" "}
                                </div>{" "}
                              </TableCell>{" "}
                            </TableRow>
                          ),
                        )
                      )}{" "}
                    </TableBody>{" "}
                  </Table>{" "}
                </CardContent>{" "}
              </Card>{" "}
            </div>{" "}
          </TabsContent>{" "}
          <TabsContent value="imports" className="space-y-4">
            {" "}
            <div className="grid gap-4 md:grid-cols-4">
              {" "}
              <CompactMetric
                label="Import Batches"
                value={(importBatchesQuery.data ?? []).length}
              />{" "}
              <CompactMetric
                label="Imported Rows"
                value={(importBatchesQuery.data ?? []).reduce(
                  (sum: number, batch: any) =>
                    sum + Number(batch.successCount || 0),
                  0,
                )}
              />{" "}
              <CompactMetric
                label="Import Errors"
                value={(importBatchesQuery.data ?? []).reduce(
                  (sum: number, batch: any) =>
                    sum + Number(batch.errorCount || 0),
                  0,
                )}
              />{" "}
              <CompactMetric
                label="Templates"
                value={importTypes.length}
              />{" "}
            </div>{" "}
            <div className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
              {" "}
              <Card className="rounded-lg border-slate-200">
                {" "}
                <CardHeader className="pb-3">
                  {" "}
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Upload className="h-4 w-4" />
                    Data Import
                  </CardTitle>{" "}
                </CardHeader>{" "}
                <CardContent className="space-y-3">
                  {" "}
                  <Field label="Import Type">
                    {" "}
                    <Select
                      value={importForm.importType}
                      onValueChange={(importType) => {
                        setImportForm({ ...importForm, importType });
                        setImportPreview(null);
                      }}
                    >
                      {" "}
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>{" "}
                      <SelectContent>
                        {importTypes.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>{" "}
                    </Select>{" "}
                  </Field>{" "}
                  <div className="grid grid-cols-2 gap-3">
                    {" "}
                    <Button
                      variant="outline"
                      className="rounded-lg"
                      onClick={() =>
                        downloadImportTemplate().catch((error) =>
                          toast({
                            title: "Template failed",
                            description: error.message,
                            variant: "destructive",
                          }),
                        )
                      }
                    >
                      {" "}
                      <Download className="mr-2 h-4 w-4" />
                      Template{" "}
                    </Button>{" "}
                    <Button variant="outline" className="relative rounded-lg">
                      {" "}
                      <Upload className="mr-2 h-4 w-4" />
                      Upload CSV{" "}
                      <input
                        type="file"
                        accept=".csv,text/csv"
                        className="absolute inset-0 cursor-pointer opacity-0"
                        onChange={(event) =>
                          readImportFile(event.target.files?.[0])
                        }
                      />{" "}
                    </Button>{" "}
                  </div>{" "}
                  <Field label="CSV Data">
                    {" "}
                    <textarea
                      className="min-h-52 w-full rounded-md border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-800 outline-none focus:border-slate-400"
                      value={importForm.csv}
                      onChange={(event) => {
                        setImportForm({
                          ...importForm,
                          csv: event.target.value,
                        });
                        setImportPreview(null);
                      }}
                      placeholder="Paste CSV data here after downloading the template."
                    />{" "}
                  </Field>{" "}
                  <div className="grid grid-cols-2 gap-3">
                    {" "}
                    <Button
                      variant="outline"
                      className="rounded-lg"
                      onClick={() => previewImport.mutate()}
                      disabled={previewImport.isPending}
                    >
                      {" "}
                      <ClipboardCheck className="mr-2 h-4 w-4" />
                      Preview{" "}
                    </Button>{" "}
                    <Button
                      className="rounded-lg bg-slate-900 hover:bg-slate-800"
                      onClick={() => commitImport.mutate()}
                      disabled={
                        commitImport.isPending ||
                        !importPreview ||
                        (importPreview.errorCount || 0) > 0
                      }
                    >
                      {" "}
                      Commit Import{" "}
                    </Button>{" "}
                  </div>{" "}
                  {importPreview && (
                    <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-slate-700">
                      {" "}
                      {importPreview.readyCount ??
                        importPreview.rowCount - importPreview.errorCount}{" "}
                      ready - {importPreview.errorCount || 0} error(s){" "}
                    </div>
                  )}{" "}
                </CardContent>{" "}
              </Card>{" "}
              <div className="grid gap-4">
                {" "}
                <Card className="rounded-lg border-slate-200">
                  {" "}
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Preview Results</CardTitle>
                  </CardHeader>{" "}
                  <CardContent className="p-0">
                    {" "}
                    <Table>
                      {" "}
                      <TableHeader>
                        {" "}
                        <TableRow>
                          {" "}
                          <TableHead className="pl-6">Row</TableHead>{" "}
                          <TableHead>Status</TableHead>{" "}
                          <TableHead>Issues</TableHead>{" "}
                        </TableRow>{" "}
                      </TableHeader>{" "}
                      <TableBody>
                        {" "}
                        {!importPreview?.rows ||
                        importPreview.rows.length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={3}
                              className="h-24 text-center text-slate-500"
                            >
                              Preview an import file to see validation results.
                            </TableCell>
                          </TableRow>
                        ) : (
                          importPreview.rows.slice(0, 25).map((row: any) => (
                            <TableRow key={`${row.rowNumber}-${row.status}`}>
                              {" "}
                              <TableCell className="pl-6 font-medium">
                                {row.rowNumber}
                              </TableCell>{" "}
                              <TableCell>
                                <StatusBadge status={row.status} />
                              </TableCell>{" "}
                              <TableCell className=" text-slate-600">
                                {(row.errors || []).join("; ") || "Ready"}
                              </TableCell>{" "}
                            </TableRow>
                          ))
                        )}{" "}
                      </TableBody>{" "}
                    </Table>{" "}
                  </CardContent>{" "}
                </Card>{" "}
                <Card className="rounded-lg border-slate-200">
                  {" "}
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">
                      Recent Import Batches
                    </CardTitle>
                  </CardHeader>{" "}
                  <CardContent className="p-0">
                    {" "}
                    <Table>
                      {" "}
                      <TableHeader>
                        {" "}
                        <TableRow>
                          {" "}
                          <TableHead className="pl-6">Type</TableHead>{" "}
                          <TableHead>Status</TableHead>{" "}
                          <TableHead>Rows</TableHead>{" "}
                          <TableHead className="pr-6">File</TableHead>{" "}
                        </TableRow>{" "}
                      </TableHeader>{" "}
                      <TableBody>
                        {" "}
                        {(importBatchesQuery.data ?? []).length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={4}
                              className="h-24 text-center text-slate-500"
                            >
                              No payroll imports yet.
                            </TableCell>
                          </TableRow>
                        ) : (
                          (importBatchesQuery.data ?? [])
                            .slice(0, 8)
                            .map((batch: any) => (
                              <TableRow key={batch.id}>
                                {" "}
                                <TableCell className="pl-6 font-medium">
                                  {batch.importType}
                                </TableCell>{" "}
                                <TableCell>
                                  <StatusBadge status={batch.status} />
                                </TableCell>{" "}
                                <TableCell>
                                  {batch.successCount}/{batch.rowCount} imported
                                </TableCell>{" "}
                                <TableCell className="pr-6 text-slate-500">
                                  {batch.sourceFileName || "CSV paste"}
                                </TableCell>{" "}
                              </TableRow>
                            ))
                        )}{" "}
                      </TableBody>{" "}
                    </Table>{" "}
                  </CardContent>{" "}
                </Card>{" "}
              </div>{" "}
            </div>{" "}
          </TabsContent>{" "}
        </Tabs>{" "}
      </div>{" "}
    </Layout>
  );
}
function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: any;
  label: string;
  value: string;
  tone: "blue" | "amber" | "emerald" | "slate";
}) {
  const tones = {
    blue: "bg-blue-50 text-blue-600",
    amber: "bg-amber-50 text-amber-600",
    emerald: "bg-emerald-50 text-emerald-600",
    slate: "bg-slate-900 text-white",
  };
  return (
    <Card className="rounded-lg border-slate-200">
      {" "}
      <CardContent className="flex items-center gap-4 p-5">
        {" "}
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-lg",
            tones[tone],
          )}
        >
          {" "}
          <Icon className="h-5 w-5" />{" "}
        </div>{" "}
        <div>
          {" "}
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
            {label}
          </p>{" "}
          <p className="mt-1 text-2xl font-black text-slate-900">
            {value}
          </p>{" "}
        </div>{" "}
      </CardContent>{" "}
    </Card>
  );
}
function CompactMetric({ label, value }: { label: string; value: number }) {
  return (
    <Card className="rounded-lg border-slate-200">
      {" "}
      <CardContent className="p-4">
        {" "}
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
          {label}
        </p>{" "}
        <p className="mt-1 text-2xl font-black text-slate-900">{value}</p>{" "}
      </CardContent>{" "}
    </Card>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      {" "}
      <Label className="text-xs font-bold text-slate-600">{label}</Label>{" "}
      {children}{" "}
    </div>
  );
}
function StatusBadge({ status }: { status: string }) {
  const value = status || "DRAFT";
  const className =
    value === "LOCKED"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : value === "PENDING"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : value === "REJECTED" || value === "REVERSED"
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : "border-slate-200 bg-slate-50 text-slate-700";
  return (
    <Badge variant="outline" className={cn("rounded-md font-bold", className)}>
      {value}
    </Badge>
  );
}
function EmployeeSelect({
  employees,
  value,
  onChange,
}: {
  employees: Employee[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label="Employee">
      {" "}
      <Select value={value} onValueChange={onChange}>
        {" "}
        <SelectTrigger>
          <SelectValue placeholder="Select employee" />
        </SelectTrigger>{" "}
        <SelectContent>
          {" "}
          {employees.map((employee) => (
            <SelectItem key={employee.id} value={String(employee.id)}>
              {employee.firstName} {employee.lastName}
            </SelectItem>
          ))}{" "}
        </SelectContent>{" "}
      </Select>{" "}
    </Field>
  );
}
function RequestPanel({
  title,
  icon: Icon,
  children,
  onSubmit,
  pending,
}: {
  title: string;
  icon: any;
  children: React.ReactNode;
  onSubmit: () => void;
  pending: boolean;
}) {
  return (
    <Card className="rounded-lg border-slate-200">
      {" "}
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-4 w-4" />
          {title}
        </CardTitle>
      </CardHeader>{" "}
      <CardContent className="space-y-3">
        {" "}
        {children}{" "}
        <Button
          className="w-full rounded-lg bg-slate-900 hover:bg-slate-800"
          onClick={onSubmit}
          disabled={pending}
        >
          {" "}
          <Plus className="mr-2 h-4 w-4" /> Submit{" "}
        </Button>{" "}
      </CardContent>{" "}
    </Card>
  );
}
function SimpleList({
  title,
  empty,
  rows,
}: {
  title: string;
  empty: string;
  rows: {
    id: number;
    primary: string;
    secondary: string;
    status: string;
    action?: React.ReactNode;
  }[];
}) {
  return (
    <Card className="rounded-lg border-slate-200">
      {" "}
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>{" "}
      <CardContent className="divide-y divide-slate-100 p-0">
        {" "}
        {rows.length === 0 ? (
          <div className="p-8 text-center text-slate-500">{empty}</div>
        ) : (
          rows.map((row) => (
            <div
              key={row.id}
              className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              {" "}
              <div>
                {" "}
                <p className="font-bold text-slate-900">{row.primary}</p>{" "}
                <p className=" text-slate-500">{row.secondary}</p>{" "}
              </div>{" "}
              <div className="flex items-center gap-2">
                {" "}
                <StatusBadge status={row.status} /> {row.action}{" "}
              </div>{" "}
            </div>
          ))
        )}{" "}
      </CardContent>{" "}
    </Card>
  );
}
function ConfigCard({
  title,
  items,
}: {
  title: string;
  items: { label: string; detail: string }[];
}) {
  return (
    <Card className="rounded-lg border-slate-200">
      {" "}
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>{" "}
      <CardContent className="space-y-3">
        {" "}
        {items.length === 0 ? (
          <p className=" text-slate-500">No records configured.</p>
        ) : (
          items.slice(0, 8).map((item) => (
            <div
              key={`${item.label}-${item.detail}`}
              className="rounded-lg border border-slate-100 bg-slate-50/50 p-3"
            >
              {" "}
              <p className="font-bold text-slate-900">{item.label}</p>{" "}
              <p className="mt-1 text-slate-500">{item.detail}</p>{" "}
            </div>
          ))
        )}{" "}
      </CardContent>{" "}
    </Card>
  );
}
