import { useMemo, useState } from "react";
import { Layout } from "@/components/layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { addDays, addMonths, endOfMonth, format, startOfMonth } from "date-fns";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  Lock,
  Plus,
  ShieldAlert,
  Sparkles,
  Unlock,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { useActiveCompany } from "@/hooks/use-active-company";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";

type FinancialPeriod = {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  status: "OPEN" | "CLOSED" | string;
  apLocked: boolean;
  arLocked: boolean;
  inventoryLocked: boolean;
  glLocked: boolean;
};

const periodQueryKey = (companyId?: number | null) => [
  "/api/accounting/periods",
  { companyId },
];

const closeChecklist = [
  "Invoices, payments, and journals are reviewed",
  "Bank and cash accounts are reconciled",
  "Stock movements and adjustments are posted",
  "VAT/tax reports are reviewed",
];

const yearEndChecklist = [
  "All normal monthly periods for the year are closed",
  "Audit/year-end adjustment journals are posted",
  "Trial Balance, Profit & Loss, Balance Sheet, General Ledger, VAT, Debtors/Creditors, and Stock Valuation have been reviewed",
  "The next financial year has been created",
];

export default function FinancialPeriodsPage() {
  const [isPeriodOpen, setIsPeriodOpen] = useState(false);
  const [isYearOpen, setIsYearOpen] = useState(false);
  const [isSweepOpen, setIsSweepOpen] = useState(false);
  const [sweepDate, setSweepDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [yearStart, setYearStart] = useState(
    format(startOfMonth(new Date()), "yyyy-MM-dd"),
  );
  const [includeAdjustmentPeriod, setIncludeAdjustmentPeriod] = useState(false);
  const [yearChecks, setYearChecks] = useState<Record<number, boolean>>({});
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { activeCompanyId, isLoading: isCompanyLoading } = useActiveCompany();

  const [formData, setFormData] = useState({
    name: "",
    startDate: "",
    endDate: "",
  });

  const { data: periods, isLoading } = useQuery<FinancialPeriod[]>({
    queryKey: periodQueryKey(activeCompanyId),
    enabled: !!activeCompanyId,
  });

  const sortedPeriods = useMemo(
    () =>
      [...(periods || [])].sort(
        (a, b) =>
          new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
      ),
    [periods],
  );

  const generatedYear = useMemo(() => {
    const start = startOfMonth(new Date(`${yearStart}T00:00:00`));
    if (Number.isNaN(start.getTime())) return [];

    const months = Array.from({ length: 12 }, (_, index) => {
      const monthStart = addMonths(start, index);
      const monthEnd = endOfMonth(monthStart);
      return {
        name: format(monthStart, "MMMM yyyy"),
        startDate: format(monthStart, "yyyy-MM-dd"),
        endDate: format(monthEnd, "yyyy-MM-dd"),
        kind: "Monthly period",
      };
    });

    if (!includeAdjustmentPeriod) return months;

    const adjustmentDate = addDays(endOfMonth(addMonths(start, 11)), 1);
    return [
      ...months,
      {
        name: `Period 13 Adjustments ${format(adjustmentDate, "yyyy")}`,
        startDate: format(adjustmentDate, "yyyy-MM-dd"),
        endDate: format(adjustmentDate, "yyyy-MM-dd"),
        kind: "13th adjustment period",
      },
    ];
  }, [yearStart, includeAdjustmentPeriod]);

  const openPeriods = sortedPeriods.filter(
    (period) => period.status === "OPEN",
  ).length;
  const closedPeriods = sortedPeriods.filter(
    (period) => period.status === "CLOSED",
  ).length;
  const latestPeriod = sortedPeriods[sortedPeriods.length - 1];
  const nextYearStart = latestPeriod
    ? format(
        addMonths(startOfMonth(new Date(latestPeriod.startDate)), 1),
        "yyyy-MM-dd",
      )
    : yearStart;
  const yearEndReady = yearEndChecklist.every((_, index) => yearChecks[index]);

  const invalidatePeriods = () => {
    queryClient.invalidateQueries({
      queryKey: periodQueryKey(activeCompanyId),
    });
  };

  const createPeriod = async (data: {
    name: string;
    startDate: string;
    endDate: string;
  }) => {
    const res = await apiRequest("POST", "/api/accounting/periods", {
      ...data,
      startDate: new Date(`${data.startDate}T00:00:00`).toISOString(),
      endDate: new Date(`${data.endDate}T23:59:59`).toISOString(),
      status: "OPEN",
    });
    return res.json();
  };

  const createMutation = useMutation({
    mutationFn: createPeriod,
    onSuccess: () => {
      toast({
        title: "Period created",
        description: "The posting period is open and ready to use.",
      });
      setIsPeriodOpen(false);
      setFormData({ name: "", startDate: "", endDate: "" });
      invalidatePeriods();
    },
    onError: (err: any) => {
      toast({
        title: "Could not create period",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const createYearMutation = useMutation({
    mutationFn: async () => {
      for (const period of generatedYear) {
        await createPeriod(period);
      }
    },
    onSuccess: () => {
      toast({
        title: "Financial year created",
        description: `${generatedYear.length} posting periods were created automatically.`,
      });
      setIsYearOpen(false);
      invalidatePeriods();
    },
    onError: (err: any) => {
      toast({
        title: "Could not create financial year",
        description: err.message,
        variant: "destructive",
      });
      invalidatePeriods();
    },
  });

  // --- Mutations ---
  const toggleMutation = useMutation({
    mutationFn: async (payload: { id: number; status?: string; apLocked?: boolean; arLocked?: boolean; inventoryLocked?: boolean; glLocked?: boolean }) => {
      const { id, ...updates } = payload;
      const res = await apiRequest(
        "PATCH",
        `/api/accounting/periods/${id}/toggle`,
        updates,
      );
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Period updated",
        description: `${data.name} locks have been updated.`,
      });
      invalidatePeriods();
    },
    onError: (err: any) => {
      toast({
        title: "Could not update period",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const sweepMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        "/api/accounting/periods/year-end-close",
        { asOfDate: sweepDate },
      );
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Year-end close completed", description: data.message });
      setIsSweepOpen(false);
      setYearChecks({});
    },
    onError: (err: any) =>
      toast({
        title: "Year-end close failed",
        description: err.message,
        variant: "destructive",
      }),
  });

  return (
    <Layout hideHeaderTitle>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-800">
              <Calendar className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold font-display text-slate-800">
                Financial Periods
              </h1>
              <p className=" text-slate-500">
                Auto-create monthly periods, close months, and run year-end
                processing.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Dialog open={isSweepOpen} onOpenChange={setIsSweepOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  className="rounded-xl border-rose-200 text-rose-700 hover:bg-rose-50 font-bold gap-2"
                >
                  <AlertTriangle className="h-4 w-4" />
                  Year-End Close
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl rounded-2xl">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-rose-700">
                    <AlertTriangle className="h-5 w-5" /> Year-End Processing
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-3  font-medium text-rose-800">
                    This posts the closing sweep for revenue and expense
                    accounts into retained earnings. Review the checklist before
                    running it.
                  </div>
                  <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                    {yearEndChecklist.map((item, index) => (
                      <label
                        key={item}
                        className="flex cursor-pointer items-start gap-3  font-medium text-slate-700"
                      >
                        <Checkbox
                          checked={!!yearChecks[index]}
                          onCheckedChange={(checked) =>
                            setYearChecks((prev) => ({
                              ...prev,
                              [index]: checked === true,
                            }))
                          }
                        />
                        <span>{item}</span>
                      </label>
                    ))}
                  </div>
                  <div className="space-y-2">
                    <Label>Financial Year End Date</Label>
                    <Input
                      type="date"
                      value={sweepDate}
                      onChange={(e) => setSweepDate(e.target.value)}
                    />
                  </div>
                  <Button
                    variant="destructive"
                    className="w-full font-bold"
                    onClick={() => sweepMutation.mutate()}
                    disabled={sweepMutation.isPending || !yearEndReady}
                  >
                    Confirm & Run Closing Sweep
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={isYearOpen} onOpenChange={setIsYearOpen}>
              <DialogTrigger asChild>
                <Button
                  className="rounded-xl font-bold gap-2"
                  onClick={() => setYearStart(nextYearStart)}
                >
                  <Sparkles className="h-4 w-4" />
                  Create Financial Year
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl rounded-2xl">
                <DialogHeader>
                  <DialogTitle>Create Financial Year</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="rounded-xl border border-blue-100 bg-blue-50 p-3  font-medium text-blue-900">
                    Choose the first day of the financial year. The system will
                    create monthly periods automatically, with an optional 13th
                    period for audit and year-end journals.
                  </div>
                  <div className="space-y-2">
                    <Label>Financial Year Start</Label>
                    <Input
                      type="date"
                      value={yearStart}
                      onChange={(event) => setYearStart(event.target.value)}
                    />
                  </div>
                  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-3">
                    <Checkbox
                      checked={includeAdjustmentPeriod}
                      onCheckedChange={(checked) =>
                        setIncludeAdjustmentPeriod(checked === true)
                      }
                    />
                    <span>
                      <span className="block  font-bold text-slate-800">
                        Add 13th adjustment period
                      </span>
                      <span className="block text-xs text-slate-500">
                        Use this for audit/year-end journals after normal
                        monthly periods are closed. It is created as a separate
                        one-day period after the year end.
                      </span>
                    </span>
                  </label>
                  <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-200">
                    {generatedYear.map((period) => (
                      <div
                        key={period.name}
                        className="flex items-center justify-between border-b border-slate-100 px-4 py-2 last:border-b-0"
                      >
                        <div>
                          <span className="block  font-bold text-slate-800">
                            {period.name}
                          </span>
                          <span className="text-xs text-slate-400">
                            {period.kind}
                          </span>
                        </div>
                        <span className="text-xs font-mono text-slate-500">
                          {period.startDate} - {period.endDate}
                        </span>
                      </div>
                    ))}
                  </div>
                  <Button
                    className="w-full font-bold"
                    onClick={() => createYearMutation.mutate()}
                    disabled={
                      createYearMutation.isPending ||
                      isCompanyLoading ||
                      generatedYear.length < 12
                    }
                  >
                    Create {generatedYear.length} Periods
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={isPeriodOpen} onOpenChange={setIsPeriodOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  className="rounded-xl font-bold gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Manual Period
                </Button>
              </DialogTrigger>
              <DialogContent className="rounded-2xl">
                <DialogHeader>
                  <DialogTitle>Create Manual Period</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="bg-amber-50 text-amber-800 p-3 rounded-lg flex gap-3 items-start border border-amber-200">
                    <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5" />
                    <p className=" font-medium">
                      Use this for unusual periods only. Most companies should
                      use Create Financial Year.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Period Name</Label>
                    <Input
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      placeholder="January 2026"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Start Date</Label>
                      <Input
                        type="date"
                        value={formData.startDate}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            startDate: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>End Date</Label>
                      <Input
                        type="date"
                        value={formData.endDate}
                        onChange={(e) =>
                          setFormData({ ...formData, endDate: e.target.value })
                        }
                      />
                    </div>
                  </div>
                  <Button
                    className="w-full mt-2"
                    onClick={() => createMutation.mutate(formData)}
                    disabled={
                      createMutation.isPending ||
                      isCompanyLoading ||
                      !formData.name ||
                      !formData.startDate ||
                      !formData.endDate
                    }
                  >
                    Create Open Period
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="rounded-2xl border-slate-200">
            <CardContent className="p-5">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
                Total Periods
              </p>
              <p className="mt-2 text-3xl font-black text-slate-900">
                {sortedPeriods.length}
              </p>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border-emerald-100 bg-emerald-50/50">
            <CardContent className="p-5">
              <p className="text-xs font-bold uppercase tracking-widest text-emerald-600">
                Open
              </p>
              <p className="mt-2 text-3xl font-black text-emerald-700">
                {openPeriods}
              </p>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border-slate-200">
            <CardContent className="p-5">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
                Closed
              </p>
              <p className="mt-2 text-3xl font-black text-slate-900">
                {closedPeriods}
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-2xl border-slate-200">
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-slate-50/50">
                <TableRow>
                  <TableHead className="pl-6 font-bold text-slate-800">
                    Period
                  </TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead>Close Checklist</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right pr-6">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-32 text-center">
                      Loading periods...
                    </TableCell>
                  </TableRow>
                ) : sortedPeriods.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="h-32 text-center text-slate-500"
                    >
                      No financial periods created. Start with Create Financial
                      Year.
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedPeriods.map((period) => (
                    <TableRow key={period.id}>
                      <TableCell className="pl-6 font-bold text-slate-800">
                        {period.name}
                      </TableCell>
                      <TableCell className="text-slate-600 font-mono text-xs">
                        {format(new Date(period.startDate), "dd MMM yyyy")} -{" "}
                        {format(new Date(period.endDate), "dd MMM yyyy")}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                          <ClipboardCheck className="h-4 w-4 text-slate-400" />
                          Review invoices, payments, bank, stock, and tax before
                          closing.
                        </div>
                      </TableCell>
                      <TableCell>
                        {period.status === "OPEN" ? (
                          <Badge
                            variant="outline"
                            className="bg-emerald-50 text-emerald-700 border-emerald-200"
                          >
                            <Unlock className="h-3 w-3 mr-1" /> OPEN
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="bg-slate-100 text-slate-700 border-slate-200"
                          >
                            <Lock className="h-3 w-3 mr-1" /> CLOSED
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right pr-6">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 rounded-lg text-slate-600 hover:text-slate-700 hover:bg-slate-50 border-slate-200"
                            >
                              <Lock className="h-3.5 w-3.5 mr-1" /> Locks
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="rounded-2xl">
                            <DialogHeader>
                              <DialogTitle>Sub-Ledger Locks for {period.name}</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4 pt-3">
                              <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 font-medium text-blue-800 text-sm">
                                Manage granular module locks for this financial period.
                              </div>
                              <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                  <Label>Accounts Payable (AP)</Label>
                                  <Switch checked={period.apLocked} onCheckedChange={(checked) => toggleMutation.mutate({ id: period.id, apLocked: checked })} disabled={toggleMutation.isPending} />
                                </div>
                                <div className="flex items-center justify-between">
                                  <Label>Accounts Receivable (AR)</Label>
                                  <Switch checked={period.arLocked} onCheckedChange={(checked) => toggleMutation.mutate({ id: period.id, arLocked: checked })} disabled={toggleMutation.isPending} />
                                </div>
                                <div className="flex items-center justify-between">
                                  <Label>Inventory & Procurement</Label>
                                  <Switch checked={period.inventoryLocked} onCheckedChange={(checked) => toggleMutation.mutate({ id: period.id, inventoryLocked: checked })} disabled={toggleMutation.isPending} />
                                </div>
                                <div className="flex items-center justify-between">
                                  <Label>General Ledger (GL)</Label>
                                  <Switch checked={period.glLocked} onCheckedChange={(checked) => toggleMutation.mutate({ id: period.id, glLocked: checked })} disabled={toggleMutation.isPending} />
                                </div>
                              </div>
                              <div className="border-t pt-4">
                                {period.status === "OPEN" ? (
                                  <Button
                                    variant="destructive"
                                    className="w-full"
                                    onClick={() =>
                                      toggleMutation.mutate({
                                        id: period.id,
                                        status: "CLOSED",
                                        apLocked: true, arLocked: true, inventoryLocked: true, glLocked: true
                                      })
                                    }
                                    disabled={toggleMutation.isPending}
                                  >
                                    Close Entire Period
                                  </Button>
                                ) : (
                                  <Button
                                    variant="outline"
                                    className="w-full"
                                    onClick={() =>
                                      toggleMutation.mutate({
                                        id: period.id,
                                        status: "OPEN",
                                        apLocked: false, arLocked: false, inventoryLocked: false, glLocked: false
                                      })
                                    }
                                    disabled={toggleMutation.isPending}
                                  >
                                    Reopen Period
                                  </Button>
                                )}
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>
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
