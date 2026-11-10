import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { Check, FileText, Loader2, Trash2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LoadingRows } from "@/components/ui/page-skeleton";
import { usePermissions } from "@/hooks/use-permissions";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { apiFetch } from "@/lib/api";
import { EXPIRY_TRACKED_TYPES, documentExpiryState, documentTypeLabel } from "@shared/staff-file";

interface DocDraft {
  expiryDate: string;
  hardCopyOnFile: boolean;
  notes: string;
}

// Same amber/emerald/rose language the HR pages already use for warnings.
const WARNING_CHIP = "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
const OK_CHIP = "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";

function formatDate(dateStr: string): string {
  return format(new Date(`${dateStr}T00:00:00`), "d MMM yyyy");
}

// apiFetch is exactly what apiRequest uses under the hood (auth header, company
// header, API base, token refresh); apiRequest itself JSON-stringifies its body,
// so a multipart upload goes through apiFetch directly.
async function uploadErrorMessage(res: Response): Promise<string> {
  const raw = (await res.text()) || res.statusText;
  try {
    const body = JSON.parse(raw);
    return String(body?.message ?? body?.error ?? raw);
  } catch {
    return raw;
  }
}

/**
 * One employee's staff file: every held scan, its expiry state, whether the signed
 * original is in the cabinet, and the verdict against the company's required list.
 * All expiry maths comes from shared/staff-file.ts so this view, the directory
 * badges and the server can never disagree.
 */
export function StaffFileDialog({
  companyId,
  employee,
  open,
  onOpenChange,
}: {
  companyId: number | null;
  employee: { id: number; firstName?: string; lastName?: string; employeeNumber?: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  // The document routes answer 403 without payroll write; hide the editing
  // controls rather than park viewers on an error they cannot act on.
  const { can } = usePermissions();
  const canManage = can("payroll.write");

  const docsKey = employee?.id && companyId
    ? `/api/companies/${companyId}/payroll/employees/${employee.id}/documents`
    : "/payroll/staff-file/inactive";
  const summaryKey = `/api/companies/${companyId}/payroll/staff-file/summary`;
  const settingsKey = `/api/companies/${companyId}/payroll/settings`;

  const { data: fileData, isLoading } = useQuery<any>({
    queryKey: [docsKey],
    enabled: open && !!companyId && !!employee?.id,
  });
  // warningDays + the document-type list both come from /settings, already cached
  // by the directory page - no extra fetch when the settings dialog has run.
  const { data: settings } = useQuery<any>({
    queryKey: [settingsKey],
    enabled: open && !!companyId,
  });

  const documents: any[] = Array.isArray(fileData?.documents) ? fileData.documents : [];
  const status = fileData?.status;
  const warningDays = Number(settings?.expiryWarningDays ?? 30) || 0;
  const documentTypes: string[] = Array.isArray(settings?.documentTypes) ? settings.documentTypes : [];

  const [drafts, setDrafts] = useState<Record<number, DocDraft>>({});
  useEffect(() => {
    if (!open) return;
    const seeded: Record<number, DocDraft> = {};
    for (const doc of documents) {
      seeded[doc.id] = {
        expiryDate: String(doc.expiryDate ?? ""),
        hardCopyOnFile: !!doc.hardCopyOnFile,
        notes: String(doc.notes ?? ""),
      };
    }
    setDrafts(seeded);
    // Re-seed only when the server answer changes (refetch after a mutation).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fileData]);

  const [newDoc, setNewDoc] = useState({ documentType: "", expiryDate: "", hardCopyOnFile: false, notes: "" });
  const [scanFile, setScanFile] = useState<File | null>(null);
  const scanInputRef = useRef<HTMLInputElement>(null);

  const invalidateFile = () => {
    queryClient.invalidateQueries({ queryKey: [docsKey] });
    queryClient.invalidateQueries({ queryKey: [summaryKey] });
  };

  const patchFor = (doc: any): Record<string, unknown> | null => {
    const draft = drafts[doc.id];
    if (!draft) return null;
    const patch: Record<string, unknown> = {};
    if (draft.expiryDate !== String(doc.expiryDate ?? "")) {
      patch.expiryDate = draft.expiryDate === "" ? null : draft.expiryDate;
    }
    if (draft.hardCopyOnFile !== !!doc.hardCopyOnFile) patch.hardCopyOnFile = draft.hardCopyOnFile;
    const notes = draft.notes.trim();
    if (notes !== String(doc.notes ?? "")) patch.notes = notes === "" ? null : notes;
    return Object.keys(patch).length > 0 ? patch : null;
  };

  const updateDocMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: number; patch: Record<string, unknown> }) => {
      const res = await apiRequest("PATCH", `/api/companies/${companyId}/payroll/staff-file/documents/${id}`, patch);
      return res.json();
    },
    onSuccess: () => {
      invalidateFile();
      toast({ title: "Document updated" });
    },
    onError: (error: any) => {
      toast({ title: "Update failed", description: String(error?.message ?? "Could not update the document."), variant: "destructive" });
    },
  });

  const deleteDocMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/companies/${companyId}/payroll/staff-file/documents/${id}`);
      return res.json();
    },
    onSuccess: () => {
      invalidateFile();
      toast({ title: "Document removed", description: "The scan record was deleted from the file." });
    },
    onError: (error: any) => {
      toast({ title: "Delete failed", description: String(error?.message ?? "Could not delete the document."), variant: "destructive" });
    },
  });

  const addDocMutation = useMutation({
    mutationFn: async () => {
      if (!employee || !scanFile || !newDoc.documentType) {
        throw new Error("Pick a document type and attach a scan first.");
      }
      const fd = new FormData();
      fd.append("file", scanFile);
      fd.append("employeeId", String(employee.id));
      const uploadRes = await apiFetch(`/api/companies/${companyId}/payroll/staff-file/upload`, { method: "POST", body: fd });
      if (!uploadRes.ok) {
        // Upload failed: stop here, never create a record for a scan the server rejected.
        throw new Error(await uploadErrorMessage(uploadRes));
      }
      const uploaded = await uploadRes.json();
      const res = await apiRequest("POST", `/api/companies/${companyId}/payroll/employees/${employee.id}/documents`, {
        documentType: newDoc.documentType,
        fileName: uploaded.fileName,
        fileUrl: uploaded.url,
        mimeType: uploaded.mimeType,
        fileHash: uploaded.fileHash,
        expiryDate: newDoc.expiryDate === "" ? null : newDoc.expiryDate,
        hardCopyOnFile: newDoc.hardCopyOnFile,
        notes: newDoc.notes.trim() === "" ? null : newDoc.notes.trim(),
      });
      return res.json();
    },
    onSuccess: () => {
      invalidateFile();
      setNewDoc({ documentType: "", expiryDate: "", hardCopyOnFile: false, notes: "" });
      setScanFile(null);
      if (scanInputRef.current) scanInputRef.current.value = "";
      toast({ title: "Document added to file" });
    },
    onError: (error: any) => {
      toast({ title: "Could not add document", description: String(error?.message ?? "The upload failed, nothing was recorded."), variant: "destructive" });
    },
  });

  const heldRequired = status?.required ? status.required.length - (status.missing?.length ?? 0) : 0;
  const selectedTypeTracked = (EXPIRY_TRACKED_TYPES as readonly string[]).includes(newDoc.documentType);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[720px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-indigo-500" />
            Staff file — {employee?.firstName} {employee?.lastName}
          </DialogTitle>
          <DialogDescription>
            {employee?.employeeNumber ? `${employee.employeeNumber} · ` : ""}
            {status
              ? status.required.length > 0
                ? `${heldRequired} of ${status.required.length} required documents held`
                : "This company has not marked any document type as required."
              : "Loading the file verdict..."}
          </DialogDescription>
        </DialogHeader>

        {status && (
          <div className="flex flex-wrap gap-1.5 -mt-1">
            {status.complete && (
              <Badge variant="secondary" className={OK_CHIP}>
                <Check className="mr-1 h-3 w-3" /> File complete
              </Badge>
            )}
            {(status.expired ?? []).map((type: string, i: number) => (
              <Badge key={`expired-${type}-${i}`} variant="destructive">Expired: {documentTypeLabel(type)}</Badge>
            ))}
            {(status.missing ?? []).map((type: string, i: number) => (
              <Badge key={`missing-${type}-${i}`} variant="outline" className="border-amber-300 text-amber-700 dark:border-amber-900/60 dark:text-amber-400">
                Missing: {documentTypeLabel(type)}
              </Badge>
            ))}
            {(status.expiring ?? []).map((type: string, i: number) => (
              <Badge key={`expiring-${type}-${i}`} variant="secondary" className={WARNING_CHIP}>
                Expiring soon: {documentTypeLabel(type)}
              </Badge>
            ))}
          </div>
        )}

        {isLoading ? (
          <LoadingRows rows={4} />
        ) : documents.length === 0 ? (
          <p className="text-sm text-slate-500 py-4 text-center">No documents on this file yet.</p>
        ) : (
          <div className="space-y-2">
            {documents.map((doc: any) => {
              const draft = drafts[doc.id] ?? { expiryDate: String(doc.expiryDate ?? ""), hardCopyOnFile: !!doc.hardCopyOnFile, notes: String(doc.notes ?? "") };
              const state = documentExpiryState({ expiryDate: doc.expiryDate }, warningDays);
              const patch = patchFor(doc);
              return (
                <div key={doc.id} className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{documentTypeLabel(doc.documentType)}</span>
                        {state === "EXPIRED" && <Badge variant="destructive">Expired</Badge>}
                        {state === "EXPIRING" && <Badge variant="secondary" className={WARNING_CHIP}>Expiring soon</Badge>}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5 truncate">
                        {String(doc.fileUrl ?? "").startsWith("/uploads/") ? (
                          <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">
                            {doc.fileName}
                          </a>
                        ) : (
                          <span>{doc.fileName}</span>
                        )}
                        <span className="ml-2 text-slate-400">
                          · {doc.expiryDate ? `expires ${formatDate(String(doc.expiryDate))}` : "no expiry recorded"}
                        </span>
                      </div>
                    </div>
                    {canManage && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:text-rose-400 shrink-0"
                        disabled={deleteDocMutation.isPending}
                        onClick={() => {
                          if (window.confirm(`Remove "${doc.fileName}" (${documentTypeLabel(doc.documentType)}) from this staff file? The scan record is deleted; the file on disk stays.`)) {
                            deleteDocMutation.mutate(doc.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <div className="flex items-end gap-2 flex-wrap text-sm">
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase text-slate-500">Expiry</Label>
                      <Input
                        type="date"
                        className="h-8 w-[150px]"
                        value={draft.expiryDate}
                        disabled={!canManage}
                        onChange={(e) => setDrafts((prev) => ({ ...prev, [doc.id]: { ...draft, expiryDate: e.target.value } }))}
                      />
                    </div>
                    <label className={cn("flex items-center gap-2 text-xs pb-2", canManage ? "cursor-pointer" : "cursor-default")}>
                      <input
                        type="checkbox"
                        className="rounded text-indigo-600 focus:ring-indigo-500"
                        checked={draft.hardCopyOnFile}
                        disabled={!canManage}
                        onChange={(e) => setDrafts((prev) => ({ ...prev, [doc.id]: { ...draft, hardCopyOnFile: e.target.checked } }))}
                      />
                      <span className={draft.hardCopyOnFile ? "text-emerald-700 dark:text-emerald-400" : "text-slate-500"}>
                        {draft.hardCopyOnFile ? (
                          <>
                            <Check className="inline h-3 w-3 mr-0.5" /> Paper original on file
                          </>
                        ) : (
                          "Paper original not on file"
                        )}
                      </span>
                    </label>
                    <div className="space-y-1 flex-1 min-w-[160px]">
                      <Label className="text-[10px] uppercase text-slate-500">Notes</Label>
                      <Input
                        className="h-8"
                        placeholder="e.g. signed original in cabinet B"
                        value={draft.notes}
                        disabled={!canManage}
                        onChange={(e) => setDrafts((prev) => ({ ...prev, [doc.id]: { ...draft, notes: e.target.value } }))}
                      />
                    </div>
                    {canManage && (
                      <Button
                        size="sm"
                        variant={patch ? "default" : "outline"}
                        className="h-8 bg-indigo-600 hover:bg-indigo-700 text-white"
                        disabled={!patch || updateDocMutation.isPending}
                        onClick={() => patch && updateDocMutation.mutate({ id: doc.id, patch })}
                      >
                        {updateDocMutation.isPending && patch ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                        Save
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {canManage && (
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 p-4 space-y-3 mt-2">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Add document</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Type</Label>
                <Select
                  value={newDoc.documentType}
                  onValueChange={(v) => setNewDoc({ ...newDoc, documentType: v })}
                >
                  <SelectTrigger className="bg-white dark:bg-slate-950">
                    <SelectValue placeholder={documentTypes.length === 0 ? "Loading types..." : "Document type"} />
                  </SelectTrigger>
                  <SelectContent>
                    {documentTypes.map((type) => (
                      <SelectItem key={type} value={String(type).toUpperCase()}>{documentTypeLabel(type)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Expiry date (optional)</Label>
                <Input
                  type="date"
                  className="bg-white dark:bg-slate-950"
                  value={newDoc.expiryDate}
                  onChange={(e) => setNewDoc({ ...newDoc, expiryDate: e.target.value })}
                />
                {newDoc.documentType !== "" && (
                  <p className="text-[11px] text-slate-400">
                    {selectedTypeTracked
                      ? "This type is tracked for expiry — add the date printed on the document."
                      : "This type usually does not expire; leave blank unless it does."}
                  </p>
                )}
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Scan</Label>
              <div className="flex items-center gap-2">
                <input
                  ref={scanInputRef}
                  type="file"
                  accept="application/pdf,image/png,image/jpeg,image/webp"
                  className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-200 file:px-3 file:py-1.5 file:text-sm file:font-medium dark:file:bg-slate-800 dark:file:text-slate-200"
                  onChange={(e) => setScanFile(e.target.files?.[0] ?? null)}
                />
              </div>
              <p className="text-[11px] text-slate-400">PDF, PNG, JPEG or WebP up to 10 MB.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-3 items-center">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                  checked={newDoc.hardCopyOnFile}
                  onChange={(e) => setNewDoc({ ...newDoc, hardCopyOnFile: e.target.checked })}
                />
                Signed original is in the cabinet
              </label>
              <Input
                placeholder="Note (optional)"
                className="bg-white dark:bg-slate-950"
                value={newDoc.notes}
                onChange={(e) => setNewDoc({ ...newDoc, notes: e.target.value })}
              />
            </div>
            <Button
              size="sm"
              className="bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900 gap-2"
              disabled={!scanFile || !newDoc.documentType || addDocMutation.isPending}
              onClick={() => addDocMutation.mutate()}
            >
              {addDocMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Upload & add to file
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
