import React, { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Briefcase,
  Users,
  UserMinus,
  Wallet,
  Plus,
  Pencil,
  RefreshCw,
  Loader2,
  Info,
} from "lucide-react";

import { useActiveCompany } from "@/hooks/use-active-company";
import { usePermissions } from "@/hooks/use-permissions";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

import { HRLayout } from "./layout";
import { LoadingRows } from "@/components/ui/page-skeleton";
import { SummaryStatCard } from "@/components/ui/summary-stat-card";
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
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

import {
  currencySign,
  displayCurrency,
  formatMoney,
  sumMoney,
} from "@shared/currency";

/**
 * One approved post and the gap on it. The server does the arithmetic:
 * `occupied` counts the staff actually holding the post, `vacancies` is what is
 * still open, and `vacancyCost` is the pay-grade midpoint times that gap, as a
 * decimal STRING so it prints exactly like every other payroll amount.
 */
type PositionRow = {
  id: number;
  title: string;
  grade: string | null;
  necCategory: string | null;
  payGradeId: number | null;
  approvedHeadcount: number;
  isActive: boolean;
  gradeCode: string | null;
  gradeName: string | null;
  gradeCurrency: string | null;
  gradeMinSalary: string | null;
  gradeMidpointSalary: string | null;
  occupied: number;
  vacancies: number;
  vacancyCost: string | null;
};

/** Only the fields the picker needs from the pay-grades endpoint. */
type PayGradeOption = {
  id: number;
  code: string;
  name: string;
  currency: string | null;
  midpointSalary: string | number | null;
};

const positionsQueryKey = (companyId: number | null) =>
  `/api/companies/${companyId}/payroll/positions`;

// Mirrors positionSchema on the server, so a form the client accepts is one the
// API accepts too. approvedHeadcount is 1..9999 there, not 0 — a post approved
// for nobody is a row that should be deleted, not a row.
const formSchema = z.object({
  title: z.string().trim().min(1, "Job title is required").max(120, "Keep the title under 120 characters"),
  payGradeId: z.string(),
  grade: z.string().trim().max(40, "Max 40 characters").optional(),
  necCategory: z.string().trim().max(80, "Max 80 characters").optional(),
  approvedHeadcount: z.coerce
    .number()
    .int("Enter a whole number of posts")
    .min(1, "At least 1 post must be approved")
    .max(9999, "A single job title cannot exceed 9999 posts"),
  isActive: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

const NO_GRADE = "none";

const emptyForm: FormValues = {
  title: "",
  payGradeId: NO_GRADE,
  grade: "",
  necCategory: "",
  approvedHeadcount: 1,
  isActive: true,
};

export default function HRPositions() {
  const { activeCompanyId, activeCompany } = useActiveCompany();
  const { toast } = useToast();
  const { can } = usePermissions();
  // Writes hit requirePayrollWrite on the server; hide the buttons entirely
  // rather than let a read-only user discover a 403.
  const canManage = can("payroll.write");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PositionRow | null>(null);

  const companyCurrency = String(activeCompany?.currency || "USD");
  // Amounts print with the sign of the currency they are actually held in.
  const money = (value: unknown, code?: string | null) =>
    formatMoney(value, displayCurrency(code || companyCurrency));

  const {
    data: rows = [],
    isLoading,
    isError,
    error: loadError,
    refetch,
  } = useQuery<PositionRow[]>({
    queryKey: [positionsQueryKey(activeCompanyId)],
    enabled: !!activeCompanyId,
  });

  const { data: payGrades = [] } = useQuery<PayGradeOption[]>({
    queryKey: [`/api/companies/${activeCompanyId}/payroll/pay-grades`],
    enabled: !!activeCompanyId,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: emptyForm,
  });

  const saveMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload = {
        title: values.title.trim(),
        grade: values.grade?.trim() || null,
        necCategory: values.necCategory?.trim() || null,
        payGradeId:
          values.payGradeId && values.payGradeId !== NO_GRADE
            ? Number(values.payGradeId)
            : null,
        // A PUT replaces the whole row on the server, so always send every field.
        approvedHeadcount: values.approvedHeadcount,
        isActive: values.isActive,
      };
      const res = editing
        ? await apiRequest(
            "PUT",
            `/api/companies/${activeCompanyId}/payroll/positions/${editing.id}`,
            payload,
          )
        : await apiRequest(
            "POST",
            `/api/companies/${activeCompanyId}/payroll/positions`,
            payload,
          );
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: editing ? "Position updated" : "Position created",
        description: "Approved headcount saved.",
      });
      queryClient.invalidateQueries({
        queryKey: [positionsQueryKey(activeCompanyId)],
      });
      closeDialog();
    },
    onError: (error: Error) => {
      // apiRequest already unwraps the API's { error, message } body.
      toast({
        title: "Could not save",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  function openCreate() {
    setEditing(null);
    form.reset(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(position: PositionRow) {
    setEditing(position);
    form.reset({
      title: position.title,
      payGradeId: position.payGradeId ? String(position.payGradeId) : NO_GRADE,
      grade: position.grade ?? "",
      necCategory: position.necCategory ?? "",
      approvedHeadcount: Number(position.approvedHeadcount ?? 1),
      isActive: position.isActive !== false,
    });
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditing(null);
    form.reset(emptyForm);
  }

  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => a.title.localeCompare(b.title)),
    [rows],
  );

  // Totals. Headcounts are integers, so a plain sum is exact; the vacancy cost
  // is money and is summed in integer cents by sumMoney, never as a float.
  const totals = useMemo(() => {
    let approved = 0;
    let occupied = 0;
    let vacant = 0;
    // Two pay grades can be priced in different currencies, and a total across
    // both would be a number that means nothing — so group by currency.
    const costsByCurrency = new Map<string, Array<number | string | null>>();

    for (const row of sortedRows) {
      const headcount = Number(row.approvedHeadcount ?? 0);
      approved += Number.isFinite(headcount) ? headcount : 0;
      occupied += Number(row.occupied ?? 0);
      vacant += Number(row.vacancies ?? 0);
      if (row.vacancyCost == null) continue;
      const code = displayCurrency(row.gradeCurrency || companyCurrency);
      const bucket = costsByCurrency.get(code) ?? [];
      bucket.push(row.vacancyCost);
      costsByCurrency.set(code, bucket);
    }

    return {
      approved,
      occupied,
      vacant,
      costs: [...costsByCurrency.entries()].map(([code, values]) => ({
        code,
        total: sumMoney(values),
      })),
    };
  }, [sortedRows, companyCurrency]);

  const gapCost = useMemo(() => {
    if (totals.costs.length === 0) {
      const base = displayCurrency(companyCurrency);
      return (
        <span title={`${base} ${currencySign(base)}`}>{formatMoney(0, base)}</span>
      );
    }
    if (totals.costs.length === 1) {
      const { code, total } = totals.costs[0];
      return <span title={`${code} ${currencySign(code)}`}>{formatMoney(total, code)}</span>;
    }
    return (
      <span className="flex flex-col gap-0.5 leading-tight">
        {totals.costs.map(({ code, total }) => (
          <span key={code} className="text-lg" title={`${code} ${currencySign(code)}`}>
            {formatMoney(total, code)}
          </span>
        ))}
      </span>
    );
  }, [totals.costs, companyCurrency]);

  if (!activeCompanyId) {
    return (
      <HRLayout>
        <div className="text-muted-foreground">
          Select a company to see its approved headcount.
        </div>
      </HRLayout>
    );
  }

  return (
    <HRLayout>
      <div className="flex flex-col space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent flex items-center gap-2">
              <Briefcase className="w-7 h-7 text-blue-600" />
              Positions &amp; Vacancies
            </h2>
            <p className="text-muted-foreground mt-1 max-w-2xl">
              The posts you have approved, how many are filled, and what the
              unfilled ones would cost. An approved-but-unfilled post costs
              nothing today and appears in no payroll run — this screen budgets
              the gap, it does not schedule it.
            </p>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            <Button
              variant="outline"
              size="icon"
              onClick={() => refetch()}
              aria-label="Reload positions"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            </Button>
            {canManage && (
              <Button
                className="bg-blue-600 hover:bg-blue-700 text-white shadow-md transition-all"
                onClick={openCreate}
              >
                <Plus className="mr-2 h-4 w-4" />
                Approve a Post
              </Button>
            )}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryStatCard
            label="Approved headcount"
            value={totals.approved}
            icon={Users}
            tone="blue"
          />
          <SummaryStatCard
            label="Occupied seats"
            value={totals.occupied}
            icon={Briefcase}
            tone="emerald"
          />
          <SummaryStatCard
            label="Vacant posts"
            value={totals.vacant}
            icon={UserMinus}
            tone={totals.vacant > 0 ? "amber" : "slate"}
          />
          <SummaryStatCard
            label="Budgeted cost of the gap"
            value={gapCost}
            icon={Wallet}
            tone="violet"
            valueClassName="text-xl"
          />
        </div>

        <div className="flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50/60 p-4 text-sm text-blue-900 dark:bg-blue-950/30 dark:border-blue-900/50 dark:text-blue-200">
          <Info className="h-4 w-4 mt-0.5 shrink-0" />
          <p>
            Each vacancy is costed at its pay grade&apos;s midpoint salary, so the
            figure is what filling the post would add to the wage bill. Link a pay
            grade to a position to price it; unlinked posts show no cost.
          </p>
        </div>

        <div className="rounded-xl border bg-card text-card-foreground shadow-sm overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="font-semibold text-foreground">Position</TableHead>
                <TableHead className="font-semibold text-foreground">Grade</TableHead>
                <TableHead className="font-semibold text-foreground text-right">Approved</TableHead>
                <TableHead className="font-semibold text-foreground text-right">Occupied</TableHead>
                <TableHead className="font-semibold text-foreground text-right">Vacancies</TableHead>
                <TableHead className="font-semibold text-foreground text-right">Vacancy cost</TableHead>
                <TableHead className="font-semibold text-foreground">Status</TableHead>
                <TableHead className="font-semibold text-foreground text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-32 text-center">
                    <LoadingRows rows={4} />
                  </TableCell>
                </TableRow>
              ) : isError ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                    Could not load positions.{" "}
                    {loadError instanceof Error ? loadError.message : ""}{" "}
                    <Button variant="outline" size="sm" onClick={() => refetch()}>
                      Try again
                    </Button>
                  </TableCell>
                </TableRow>
              ) : !sortedRows.length ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                    No approved posts yet.
                    {canManage
                      ? ' Click "Approve a Post" to add the headcount you have signed off.'
                      : ""}
                  </TableCell>
                </TableRow>
              ) : (
                sortedRows.map((row) => {
                  const overApproved = row.occupied > Number(row.approvedHeadcount ?? 0);
                  return (
                    <TableRow key={row.id} className="hover:bg-muted/50 transition-colors">
                      <TableCell className="font-medium">
                        {row.title}
                        {row.necCategory ? (
                          <span className="block text-xs font-normal text-muted-foreground">
                            {row.necCategory}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.gradeCode || row.grade ? (
                          <span className="flex flex-col">
                            <span className="font-medium text-foreground">
                              {row.gradeCode || row.grade}
                            </span>
                            {row.gradeName ? (
                              <span className="text-xs">{row.gradeName}</span>
                            ) : null}
                          </span>
                        ) : (
                          <span className="text-xs">No pay grade linked</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {Number(row.approvedHeadcount ?? 0)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.occupied}
                        {overApproved ? (
                          <span className="block text-xs text-amber-600">
                            above approval
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right">
                        {row.vacancies > 0 ? (
                          <Badge
                            variant="outline"
                            className="border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                          >
                            {row.vacancies} open
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground tabular-nums">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground tabular-nums">
                        {row.vacancyCost == null
                          ? "—"
                          : money(row.vacancyCost, row.gradeCurrency)}
                      </TableCell>
                      <TableCell>
                        {row.isActive ? (
                          <Badge variant="secondary" className="bg-emerald-50 text-emerald-700">
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            Closed
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {canManage ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEdit(row)}
                          >
                            <Pencil className="mr-1.5 h-3.5 w-3.5" />
                            Edit
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        <Dialog open={dialogOpen} onOpenChange={(val) => (val ? null : closeDialog())}>
          <DialogContent className="sm:max-w-[560px]">
            <DialogHeader>
              <DialogTitle>
                {editing ? "Edit approved post" : "Approve a post"}
              </DialogTitle>
              <DialogDescription>
                Approved headcount is what you have signed off, not who is sitting
                in the seat today. Unfilled posts are costed here only — they never
                enter a payroll run or a return to your fiscal authority.
              </DialogDescription>
            </DialogHeader>

            <Form {...form}>
              <form
                onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}
                className="space-y-4"
              >
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Job title</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Accounts Clerk" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="payGradeId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Pay grade</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value || NO_GRADE}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="No pay grade linked" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value={NO_GRADE}>
                              No pay grade — costs nothing
                            </SelectItem>
                            {payGrades.map((grade) => (
                              <SelectItem key={grade.id} value={String(grade.id)}>
                                {grade.code} — {grade.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Sets the midpoint used to price each vacancy on this post.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="approvedHeadcount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Approved headcount</FormLabel>
                        <FormControl>
                          <Input type="number" min={1} step={1} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="grade"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Grade label (optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. D1" {...field} />
                        </FormControl>
                        <FormDescription>
                          A short band shown on payslips; independent of the pay grade above.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="necCategory"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Employment council category (optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. Wholesale & Retail" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="isActive"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel>Accepting appointments</FormLabel>
                        <FormDescription>
                          Close a post to stop it being offered to new hires. Closing it
                          does not remove the headcount you have already approved.
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <div className="flex justify-end space-x-2 pt-2">
                  <Button variant="outline" onClick={closeDialog} type="button">
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={saveMutation.isPending}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    {saveMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      "Save position"
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
    </HRLayout>
  );
}
