import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LoadingRows } from "@/components/ui/page-skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { documentTypeLabel, nextStaffNumber } from "@shared/staff-file";

interface SettingsForm {
  staffNumberPrefix: string;
  staffNumberDigits: string;
  staffNumberNext: string;
  expiryWarningDays: string;
  requiredDocumentTypes: string[];
}

/**
 * The company's file-and-numbering policy: how staff numbers are shaped and which
 * documents every active employee's file must contain. Opening this is already gated
 * on the payroll-approval permission, because the PATCH route answers 403 without it
 * - changing how people are numbered is a policy decision, not data entry.
 */
export function PayrollSettingsDialog({
  companyId,
  open,
  onOpenChange,
}: {
  companyId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const settingsKey = `/api/companies/${companyId}/payroll/settings`;
  const summaryKey = `/api/companies/${companyId}/payroll/staff-file/summary`;
  const employeesKey = `/api/companies/${companyId}/payroll/employees`;

  const { data: settings, isLoading } = useQuery<any>({
    queryKey: [settingsKey],
    enabled: !!companyId && open,
  });

  const [form, setForm] = useState<SettingsForm | null>(null);

  // Seed once per open (and when fresh data lands): the form edits a copy, so a
  // background refetch never overwrites what the user is typing.
  useEffect(() => {
    if (!open) return;
    if (!settings) {
      setForm(null);
      return;
    }
    setForm({
      staffNumberPrefix: String(settings.staffNumberPrefix ?? ""),
      staffNumberDigits: String(settings.staffNumberDigits ?? ""),
      staffNumberNext: String(settings.staffNumberNext ?? ""),
      expiryWarningDays: String(settings.expiryWarningDays ?? ""),
      requiredDocumentTypes: Array.isArray(settings.requiredDocumentTypes)
        ? settings.requiredDocumentTypes.map((t: unknown) => String(t).toUpperCase())
        : [],
    });
  }, [open, settings]);

  const saveMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await apiRequest("PATCH", settingsKey, payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [settingsKey] });
      queryClient.invalidateQueries({ queryKey: [summaryKey] });
      queryClient.invalidateQueries({ queryKey: [employeesKey] });
      toast({ title: "Settings saved", description: "New hires now follow the updated numbering and file rules." });
      onOpenChange(false);
    },
    onError: (error: any) => {
      // The server answers bad document types with a VALIDATION_ERROR message;
      // surface it verbatim rather than a generic "save failed".
      toast({ title: "Could not save settings", description: String(error?.message ?? "Could not save settings."), variant: "destructive" });
    },
  });

  const digits = Number(form?.staffNumberDigits);
  const next = Number(form?.staffNumberNext);

  // Shown on the dialog and on the hire form, so the employer reads the exact
  // number out loud before the person walks to the payroll book.
  const preview = form && Number.isInteger(digits) && digits >= 1 && Number.isInteger(next) && next >= 1
    ? nextStaffNumber(form.staffNumberPrefix, digits, next)
    : null;

  // Never hard-coded: this is the list the GET /settings answer carries.
  const documentTypes: string[] = Array.isArray(settings?.documentTypes) ? settings.documentTypes : [];

  const toggleType = (type: string) => {
    setForm((prev) => prev && {
      ...prev,
      requiredDocumentTypes: prev.requiredDocumentTypes.includes(type)
        ? prev.requiredDocumentTypes.filter((t) => t !== type)
        : [...prev.requiredDocumentTypes, type],
    });
  };

  const handleSave = () => {
    if (!form || !companyId) return;
    const d = Number(form.staffNumberDigits);
    const n = Number(form.staffNumberNext);
    const w = Number(form.expiryWarningDays);
    if (!Number.isInteger(d) || d < 1 || d > 12) {
      toast({ title: "Check the numbering", description: "Digit count must be a whole number from 1 to 12.", variant: "destructive" });
      return;
    }
    if (!Number.isInteger(n) || n < 1 || n > 999_999_999) {
      toast({ title: "Check the counter", description: "The next number must be a whole number of at least 1.", variant: "destructive" });
      return;
    }
    if (!Number.isInteger(w) || w < 0 || w > 365) {
      toast({ title: "Check the warning window", description: "Expiry warnings must be between 0 and 365 days. Use 0 to keep expiry flags but silence the early radar.", variant: "destructive" });
      return;
    }
    saveMutation.mutate({
      staffNumberPrefix: form.staffNumberPrefix.trim(),
      staffNumberDigits: d,
      staffNumberNext: n,
      expiryWarningDays: w,
      requiredDocumentTypes: form.requiredDocumentTypes,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>File & numbering settings</DialogTitle>
          <DialogDescription>
            How staff numbers are handed out, and which documents every active employee's
            file must hold for your fiscal authority or a labour inspection.
          </DialogDescription>
        </DialogHeader>

        {isLoading || !form ? (
          <div className="py-4">
            <LoadingRows rows={4} />
          </div>
        ) : (
          <div className="space-y-5 pt-1">
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Staff numbers</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Prefix</Label>
                  <Input
                    maxLength={8}
                    placeholder="e.g. FS"
                    value={form.staffNumberPrefix}
                    onChange={(e) => setForm({ ...form, staffNumberPrefix: e.target.value.toUpperCase() })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Digits</Label>
                  <Input
                    type="number"
                    min={1}
                    max={12}
                    value={form.staffNumberDigits}
                    onChange={(e) => setForm({ ...form, staffNumberDigits: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Next counter</Label>
                  <Input
                    type="number"
                    min={1}
                    value={form.staffNumberNext}
                    onChange={(e) => setForm({ ...form, staffNumberNext: e.target.value })}
                  />
                </div>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                The next hire with a blank staff number gets{" "}
                <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">{preview ?? "—"}</span>.
                If a number in that shape is already in use, the hire takes the next free one — but read the
                preview back before saving so the scheme matches your payslips.
              </p>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Required on every file</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {documentTypes.map((type) => (
                  <label key={type} className="flex items-center gap-2 rounded-md border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                      checked={form.requiredDocumentTypes.includes(String(type).toUpperCase())}
                      onChange={() => toggleType(String(type).toUpperCase())}
                    />
                    <span className="text-slate-700 dark:text-slate-300">{documentTypeLabel(type)}</span>
                  </label>
                ))}
                {documentTypes.length === 0 && (
                  <p className="text-xs text-slate-400">No document types returned by the server yet.</p>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Files missing one of these are flagged on the directory. Choose only what you genuinely
                hold for every employee — your fiscal authority asks for these on request.
              </p>
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Expiry radar</h3>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  min={0}
                  max={365}
                  className="w-28"
                  value={form.expiryWarningDays}
                  onChange={(e) => setForm({ ...form, expiryWarningDays: e.target.value })}
                />
                <span className="text-sm text-slate-600 dark:text-slate-400">days before a document expires</span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Documents already past their date always show as expired; this window only controls how
                early they start warning.
              </p>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button
                type="button"
                className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2"
                onClick={handleSave}
                disabled={saveMutation.isPending}
              >
                {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Save settings
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
