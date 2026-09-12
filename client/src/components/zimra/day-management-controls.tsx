import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  RefreshCw,
  FileText,
  Download,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { PDFDownloadLink, pdf } from "@react-pdf/renderer";
import { FiscalReportPDF } from "@/components/reports/fiscal-report-pdf";
import { saveAs } from "file-saver";
import dayjs from "dayjs";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { getZimraErrorMessage } from "@/lib/zimra-errors";

interface DayManagementControlsProps {
  company: any;
  variant?: "light" | "dark";
}

export function DayManagementControls({
  company,
  variant = "light",
}: DayManagementControlsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [errorRecovery, setErrorRecovery] = useState<any>(null);
  const [showErrorDialog, setShowErrorDialog] = useState(false);

  const zimraError = getZimraErrorMessage(errorRecovery?.zimraErrorCode);

  const isRegistered = !!company.fdmsDeviceId && !!company.zimraCertificate;
  // ... rest of the component state/logic

  // Live Status Query
  const zimraStatusQuery = useQuery({
    queryKey: ["zimraStatus", company.id],
    queryFn: async () => {
      if (!isRegistered) return null;
      const res = await apiFetch(`/api/companies/${company.id}/zimra/status`);
      if (!res.ok) return null;
      return await res.json();
    },
    enabled: isRegistered,
  });

  const zimraStatus = zimraStatusQuery.data?.fiscalDayStatus;
  const isClosurePending = zimraStatus === "FiscalDayCloseFailed";
  // Treat 'FiscalDayCloseFailed' as effectively OPEN so we can retry closing it.
  const isOpen =
    zimraStatus === "FiscalDayOpened" ||
    isClosurePending ||
    (!zimraStatusQuery.data && company.fiscalDayOpen);

  const fiscalDayNo =
    zimraStatusQuery.data?.lastFiscalDayNo ||
    company.currentFiscalDayNo ||
    "N/A";

  // Close Day Mutation
  const closeDayMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch(
        `/api/companies/${company.id}/zimra/day/close`,
        {
          method: "POST",
        },
      );
      if (!res.ok) {
        const errorData = await res.json();
        throw errorData;
      }
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      queryClient.invalidateQueries({ queryKey: ["zimraStatus", company.id] });
      queryClient.invalidateQueries({
        queryKey: ["stats", "summary", company.id],
      });
      queryClient.invalidateQueries({ queryKey: ["zReport", company.id] });
      toast({
        title: "Fiscal Day Closed",
        description: `Operation ID: ${data.operationID || "N/A"}`,
        className: "bg-green-100 text-green-900",
      });
    },
    onError: (err: any) => {
      if (err.recovery) {
        setErrorRecovery(err);
        setShowErrorDialog(true);
      } else {
        toast({
          title: "Closure Scheduled",
          description: "Your day closure is processing quietly in the background.",
        });
      }
    },
  });

  // Open Day Mutation (Mainly for dashboard use since settings might not have it prominent)
  const openDayMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch(
        `/api/companies/${company.id}/zimra/day/open`,
        { method: "POST" },
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to open fiscal day");
      }
      return await res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Fiscal Day Opened",
        description: `Successfully opened day ${data.fiscalDayNo}.`,
        className: "bg-emerald-600 text-white",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      queryClient.invalidateQueries({ queryKey: ["zimraStatus", company.id] });
      queryClient.invalidateQueries({ queryKey: ["zReport", company.id] });
    },
    onError: (err: Error) => {
      toast({
        title: "Opening Failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const isLight = variant === "light";
  const textColor = isLight ? "text-slate-900" : "text-white";
  const subTextColor = isLight ? "text-slate-500" : "text-slate-400";
  const boxBg = isLight
    ? "bg-slate-50 border-slate-200"
    : "bg-white/5 border-white/10";

  return (
    <div className="space-y-4">
      <div
        className={`${boxBg} p-4 rounded-xl border flex flex-col sm:flex-row items-center justify-between gap-4`}
      >
        <div className="text-center sm:text-left">
          <p
            className={`text-xs uppercase tracking-wider font-semibold ${subTextColor}`}
          >
            Fiscal Day {fiscalDayNo}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <p
              className={`text-xl font-bold ${isClosurePending ? "text-amber-500" : textColor}`}
            >
              {isClosurePending
                ? "Status: Closure Pending"
                : isOpen
                  ? "Status: OPEN"
                  : "Status: CLOSED"}
            </p>
            {zimraStatusQuery.isLoading && (
              <RefreshCw className="w-3 h-3 animate-spin text-slate-400" />
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 justify-center">
          {/* X-Report (Only when open or failed close) */}
          {isOpen && (
            <XReportButton
              companyId={company.id}
              variant={variant}
              company={company}
            />
          )}

          {/* Z-Report (For closed days or after successful closure) */}
          {!isOpen && (
            <ZReportButton
              companyId={company.id}
              variant={variant}
              closeDayData={closeDayMutation.data}
              company={company}
            />
          )}

          {isOpen ? (
            <Button
              variant="destructive"
              size="sm"
              className={
                !isLight ? "bg-red-600 hover:bg-red-700 h-9 font-bold px-4" : ""
              }
              onClick={() => {
                if (confirm("Are you sure you want to close the fiscal day?")) {
                  closeDayMutation.mutate();
                }
              }}
              disabled={closeDayMutation.isPending}
            >
              {closeDayMutation.isPending ? (
                <RefreshCw className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              {isClosurePending ? "Retry Closure" : "Close Fiscal Day"}
            </Button>
          ) : (
            <Button
              variant="default"
              size="sm"
              className={
                !isLight
                  ? "bg-emerald-600 hover:bg-emerald-700 h-9 font-bold px-4 text-white"
                  : "bg-emerald-600 hover:bg-emerald-700"
              }
              onClick={() => openDayMutation.mutate()}
              disabled={openDayMutation.isPending}
            >
              {openDayMutation.isPending ? (
                <RefreshCw className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              Open Fiscal Day
            </Button>
          )}
        </div>
      </div>

      {/* Error Recovery Dialog */}
      <Dialog open={showErrorDialog} onOpenChange={setShowErrorDialog}>
        <DialogContent className="sm:max-w-lg border-2 border-red-100">
          <DialogHeader>
            <div className="flex items-center gap-2 text-red-600 mb-2">
              <AlertTriangle className="w-6 h-6" />
              <DialogTitle>Fiscal Day Closure Failed</DialogTitle>
            </div>
            <DialogDescription className="font-medium text-slate-700">
              {errorRecovery?.message}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {errorRecovery?.zimraErrorCode && (
              <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg">
                <p className=" font-semibold text-amber-900 mb-1">
                  {zimraError.title}
                </p>
                <p className="text-xs text-amber-800">{zimraError.message}</p>
              </div>
            )}

            <div className="bg-slate-50 p-3 rounded text-xs font-mono border text-slate-600">
              {errorRecovery?.lastError && (
                <p className="mb-1">
                  <strong>Technical Message:</strong> {errorRecovery.lastError}
                </p>
              )}
              {errorRecovery?.zimraErrorCode && (
                <p>
                  <strong>ZIMRA Error Code:</strong>{" "}
                  {errorRecovery.zimraErrorCode}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <h4 className=" font-semibold text-slate-900">
                Suggested Recovery Actions:
              </h4>
              <ul className="space-y-2">
                {errorRecovery?.recovery?.options?.map(
                  (option: string, i: number) => (
                    <li
                      key={i}
                      className="flex items-start gap-2  text-slate-600"
                    >
                      <span className="mt-1 w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0" />
                      {option}
                    </li>
                  ),
                )}
              </ul>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowErrorDialog(false)}>
              Dismiss
            </Button>
            <Button
              variant="default"
              onClick={() => {
                setShowErrorDialog(false);
                closeDayMutation.mutate();
              }}
            >
              Retry Closure
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function XReportButton({
  companyId,
  variant,
  company,
}: {
  companyId: number;
  variant: "light" | "dark";
  company: any;
}) {
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);

  const handleDownloadX = async () => {
    setIsGenerating(true);
    toast({
      title: "Generating X-Report",
      description: "Fetching and preparing PDF...",
    });
    try {
      const today = new Date().toISOString().split("T")[0];
      const res = await apiFetch(
        `/api/companies/${companyId}/reports/fiscal-data?date=${today}`,
      );
      if (!res.ok) throw new Error("Failed to fetch report data");
      const data = await res.json();
      const blob = await pdf(
        <FiscalReportPDF type="X" data={data} company={company} />,
      ).toBlob();
      saveAs(blob, `Fiscal-X-Report-${dayjs().format("YYYY-MM-DD-HHmm")}.pdf`);
      toast({ title: "X-Report Downloaded" });
    } catch (err: any) {
      toast({
        title: "Failed to generate report",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const isLight = variant === "light";

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleDownloadX}
      disabled={isGenerating}
      className={
        !isLight
          ? "bg-white/10 text-white border-white/20 hover:bg-white/20"
          : ""
      }
    >
      {isGenerating ? (
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
      ) : (
        <FileText className="w-4 h-4 mr-2" />
      )}
      Download X-Report
    </Button>
  );
}

function ZReportButton({
  companyId,
  variant,
  closeDayData,
  company,
}: {
  companyId: number;
  variant: "light" | "dark";
  closeDayData?: any;
  company: any;
}) {
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);

  const handleDownloadZ = async () => {
    setIsGenerating(true);
    toast({
      title: "Generating Z-Report",
      description: "Preparing audit report...",
    });
    try {
      const today = new Date().toISOString().split("T")[0];
      const res = await apiFetch(
        `/api/companies/${companyId}/reports/fiscal-data?date=${today}`,
      );
      if (!res.ok) throw new Error("Failed to fetch report data");
      const data = await res.json();
      const blob = await pdf(
        <FiscalReportPDF type="Z" data={data} company={company} />,
      ).toBlob();
      saveAs(blob, `Fiscal-Z-Report-${dayjs().format("YYYY-MM-DD-HHmm")}.pdf`);
      toast({ title: "Z-Report Downloaded" });
    } catch (err: any) {
      toast({
        title: "Failed to generate report",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const isLight = variant === "light";

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleDownloadZ}
      disabled={isGenerating}
      className={
        !isLight
          ? "bg-white/10 text-white border-white/20 hover:bg-white/20"
          : "bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
      }
    >
      {isGenerating ? (
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
      ) : (
        <Download className="w-4 h-4 mr-2" />
      )}
      Download Z-Report
    </Button>
  );
}
