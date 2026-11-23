import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CalendarDays, Loader2, Save } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useActiveCompany } from "@/hooks/use-active-company";
import { usePermissions } from "@/hooks/use-permissions";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { currentPayPeriod, PAY_FREQUENCIES } from "@shared/payroll-calendar";

type CalendarForm = {
  defaultPayFrequency: string;
  payDay: string;
  periodCutoffDay: string;
  reminderDaysBefore: string;
};

const BLANK: CalendarForm = {
  defaultPayFrequency: "MONTHLY",
  payDay: "25",
  periodCutoffDay: "20",
  reminderDaysBefore: "7",
};

export function PayrollCalendarTab() {
  const { activeCompanyId: companyId } = useActiveCompany();
  const { can } = usePermissions();
  const { toast } = useToast();
  const canEdit = can("payroll.approve");
  const [form, setForm] = useState<CalendarForm>(BLANK);

  const settingsKey = [`/api/companies/${companyId}/payroll/settings`];
  const { data, isLoading } = useQuery<any>({
    queryKey: settingsKey,
    enabled: !!companyId,
  });

  useEffect(() => {
    if (!data) return;
    setForm({
      defaultPayFrequency: data.defaultPayFrequency || "MONTHLY",
      payDay: String(data.payDay ?? 25),
      periodCutoffDay: String(data.periodCutoffDay ?? 20),
      reminderDaysBefore: String(data.reminderDaysBefore ?? 7),
    });
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async (values: CalendarForm) => {
      const res = await apiRequest("PATCH", `/api/companies/${companyId}/payroll/settings`, {
        defaultPayFrequency: values.defaultPayFrequency,
        payDay: Number(values.payDay),
        periodCutoffDay: Number(values.periodCutoffDay),
        reminderDaysBefore: Number(values.reminderDaysBefore),
      });
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: settingsKey });
      void queryClient.invalidateQueries({ queryKey: ["pending-payroll-runs", companyId] });
      toast({ title: "Payroll calendar saved" });
    },
    onError: (error: any) => {
      toast({ title: "Could not save calendar", description: error.message, variant: "destructive" });
    },
  });

  const period = currentPayPeriod({
    defaultPayFrequency: form.defaultPayFrequency,
    payDay: Number(form.payDay),
    periodCutoffDay: Number(form.periodCutoffDay),
    reminderDaysBefore: Number(form.reminderDaysBefore),
  });
  const invalid = Number(form.payDay) < 1 || Number(form.payDay) > 31
    || Number(form.periodCutoffDay) < 1 || Number(form.periodCutoffDay) > 31
    || Number(form.reminderDaysBefore) < 0 || Number(form.reminderDaysBefore) > 60;

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <CalendarDays className="h-6 w-6 text-blue-600" />
          Payroll Calendar
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          Sets the default frequency and pay dates for new runs, and how early pending runs show up as alerts.
        </p>
      </div>

      <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Pay cycle</CardTitle>
          <CardDescription>
            New payroll runs are prefilled with these values. Existing runs keep their own dates and frequency.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading calendar…
            </div>
          ) : (
            <form
              className="grid grid-cols-1 md:grid-cols-2 gap-5"
              onSubmit={(e) => {
                e.preventDefault();
                saveMutation.mutate(form);
              }}
            >
              <div className="space-y-2">
                <Label>Default pay frequency</Label>
                <Select
                  value={form.defaultPayFrequency}
                  onValueChange={(v) => setForm((f) => ({ ...f, defaultPayFrequency: v }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAY_FREQUENCIES.map((freq) => (
                      <SelectItem key={freq} value={freq}>
                        {freq.charAt(0) + freq.slice(1).toLowerCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Pay day (day of the following month)</Label>
                <Input
                  type="number"
                  min={1}
                  max={31}
                  value={form.payDay}
                  onChange={(e) => setForm((f) => ({ ...f, payDay: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Period cut-off day</Label>
                <Input
                  type="number"
                  min={1}
                  max={31}
                  value={form.periodCutoffDay}
                  onChange={(e) => setForm((f) => ({ ...f, periodCutoffDay: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Remind days before pay date</Label>
                <Input
                  type="number"
                  min={0}
                  max={60}
                  value={form.reminderDaysBefore}
                  onChange={(e) => setForm((f) => ({ ...f, reminderDaysBefore: e.target.value }))}
                />
              </div>

              <div className="md:col-span-2 rounded-lg border border-blue-100 bg-blue-50/60 dark:border-blue-900/50 dark:bg-blue-900/10 p-4 text-sm">
                <p className="font-medium text-blue-800 dark:text-blue-300">Next pay period from these settings</p>
                <p className="text-slate-700 dark:text-slate-300 mt-1">
                  {period.periodStart} – {period.periodEnd} · due {period.dueDate}
                  <span className="text-slate-500"> · alerts from {period.reminderDate}</span>
                </p>
              </div>

              <div className="md:col-span-2 flex justify-end">
                <Button type="submit" disabled={!canEdit || saveMutation.isPending || invalid} className="gap-2">
                  {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save calendar
                </Button>
              </div>
              {!canEdit && (
                <p className="md:col-span-2 text-xs text-slate-500">
                  Payroll approval permission is required to change the calendar.
                </p>
              )}
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
