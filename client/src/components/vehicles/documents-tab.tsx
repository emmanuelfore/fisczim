import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { pdf } from "@react-pdf/renderer";
import { format } from "date-fns";
import { Download, Eye, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { InvoicePDF } from "@/components/invoices/pdf-document";
import { VehicleAgreementPDF } from "./agreement-pdf";
import { VehiclePaymentReceiptPDF } from "./payment-receipt-pdf";
import { useCompany } from "@/hooks/use-companies";
import { useVehicleCustomerAccount } from "@/hooks/use-vehicles";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

const kinds = ["Supplier invoice", "Shipping", "Customs", "Signed agreement", "Other"];
const maxFileSize = 5 * 1024 * 1024;

type DocumentRow = {
  key: string;
  name: string;
  kind: string;
  date: string | null;
  load: () => Promise<Blob>;
};

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("Could not read the file"));
    reader.readAsDataURL(file);
  });
}

export function VehicleDocumentsTab({ v, companyId, editable }: { v: any; companyId: number; editable: boolean }) {
  const { data: company } = useCompany(companyId);
  const { data: account } = useVehicleCustomerAccount(companyId, v.accountingModel !== "principal" ? v.id : 0);
  const qc = useQueryClient();
  const { toast } = useToast();
  const root = `/api/companies/${companyId}/vehicles/${v.id}`;
  const listKey = ["vehicle-documents", companyId, v.id] as const;
  const { data: uploads, isPending, isError } = useQuery<{
    id: number; name: string; kind: string; mimeType: string; createdAt: string;
  }[]>({
    queryKey: listKey,
    queryFn: async () => {
      const response = await apiFetch(root + "/documents");
      if (!response.ok) throw new Error("Could not load uploaded documents");
      return response.json();
    },
  });
  const { data: agreementData } = useQuery({
    queryKey: ["vehicle-agreement", companyId, v.id],
    queryFn: async () => {
      const response = await apiFetch(root + "/agreement");
      if (response.status === 404) return null;
      if (!response.ok) throw new Error("Could not load the agreement");
      return response.json();
    },
  });
  const [selected, setSelected] = useState<DocumentRow>();
  const [preview, setPreview] = useState<{ url: string; image: boolean }>();
  const [previewError, setPreviewError] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [file, setFile] = useState<File>();
  const [kind, setKind] = useState("Other");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setPreview(undefined);
    setPreviewError(false);
    if (!selected) return;
    let active = true;
    let url: string | undefined;
    selected.load().then(blob => {
      if (!active) return;
      url = URL.createObjectURL(blob);
      setPreview({ url, image: blob.type.startsWith("image/") });
    }, () => { if (active) setPreviewError(true); });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [selected]);

  const download = async (row: DocumentRow) => {
    try {
      const url = URL.createObjectURL(await row.load());
      const link = document.createElement("a");
      link.href = url;
      link.download = row.name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      toast({ title: "Could not download the document", variant: "destructive" });
    }
  };
  const addDocument = async () => {
    if (!file || file.size > maxFileSize) return;
    setSaving(true);
    try {
      const response = await apiFetch(root + "/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, kind, contentBase64: await readBase64(file) }),
      });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || "Upload failed");
      await qc.invalidateQueries({ queryKey: listKey });
      setUploadOpen(false);
      toast({ title: "Document added" });
    } catch (error) {
      toast({ title: "Could not upload the document", description: (error as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const rows: DocumentRow[] = (uploads ?? []).map(upload => ({
    key: "upload-" + upload.id, name: upload.name, kind: upload.kind, date: upload.createdAt,
    load: async () => {
      const response = await apiFetch(root + "/documents/" + upload.id);
      if (!response.ok) throw new Error("Could not load the document");
      return response.blob();
    },
  }));
  if (company && agreementData?.agreement) {
    const { agreement, schedule } = agreementData;
    rows.push({
      key: "agreement", name: agreement.agreementNumber + ".pdf", kind: "Sales agreement", date: agreement.createdAt,
      load: () => pdf(<VehicleAgreementPDF agreement={agreement} vehicle={v} customer={v.customer} company={company} schedule={schedule} costs={account?.costSheet} />).toBlob(),
    });
  }
  if (company && v.invoice) {
    rows.push({
      key: "invoice", name: v.invoice.invoiceNumber + ".pdf", kind: v.accountingModel === "principal" ? "Sales invoice" : "Processing-fee invoice",
      date: v.invoice.issueDate,
      load: () => pdf(<InvoicePDF invoice={{ ...v.invoice, vehicle: v, vehicleCosts: v.invoice.vehicleCosts ?? v.costs }} company={company} customer={v.customer} />).toBlob(),
    });
  }
  for (const payment of company ? v.payments ?? [] : []) {
    rows.push({
      key: "receipt-" + payment.id, name: "VR-" + payment.id + ".pdf", kind: "Payment receipt", date: payment.paymentDate,
      load: async () => {
        const response = await apiFetch(root + "/payments/" + payment.id + "/receipt");
        if (!response.ok) throw new Error("Could not load the receipt");
        const receipt = await response.json();
        return pdf(<VehiclePaymentReceiptPDF receipt={receipt} company={company} />).toBlob();
      },
    });
  }
  rows.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

  return <>
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle>Documents</CardTitle>
        {editable && <Button onClick={() => { setFile(undefined); setKind("Other"); setUploadOpen(true); }}><Plus className="mr-1 h-4 w-4" />Add document</Button>}
      </CardHeader>
      <CardContent>
        {isError && <p className="mb-3 text-sm text-rose-700">Could not load uploaded documents.</p>}
        {rows.length ? <Table>
          <TableHeader><TableRow><TableHead>Document</TableHead><TableHead className="hidden md:table-cell">Type</TableHead><TableHead className="hidden sm:table-cell">Date</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
          <TableBody>{rows.map(row => <TableRow key={row.key}>
            <TableCell className="max-w-48 break-words font-medium">{row.name}<span className="block text-xs font-normal text-slate-600 md:hidden">{row.kind}</span></TableCell>
            <TableCell className="hidden md:table-cell">{row.kind}</TableCell>
            <TableCell className="hidden whitespace-nowrap sm:table-cell">{row.date ? format(new Date(row.date), "d MMM yyyy") : "—"}</TableCell>
            <TableCell className="text-right whitespace-nowrap">
              <Button size="sm" variant="ghost" aria-label={`Preview ${row.name}`} onClick={() => setSelected(row)}><Eye className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Preview</span></Button>
              <Button size="icon" variant="ghost" aria-label={`Download ${row.name}`} onClick={() => void download(row)}><Download className="h-4 w-4" /></Button>
            </TableCell>
          </TableRow>)}</TableBody>
        </Table> : <p className="text-sm text-slate-600">{isPending ? "Loading documents…" : "No documents on file yet."}</p>}
      </CardContent>
    </Card>
    <Dialog open={!!selected} onOpenChange={open => { if (!open) setSelected(undefined); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader><DialogTitle>{selected?.name}</DialogTitle><DialogDescription>{selected?.kind}</DialogDescription></DialogHeader>
        {previewError ? <p className="text-sm text-rose-700">Could not load this document.</p>
          : !preview ? <p className="text-sm text-slate-600">Preparing preview…</p>
          : preview.image ? <img className="mx-auto max-h-[65dvh] max-w-full object-contain" src={preview.url} alt={selected?.name} />
          : <iframe className="h-[62dvh] w-full rounded border" src={preview.url} title={selected?.name} />}
        <DialogFooter>{preview && <Button asChild><a href={preview.url} download={selected?.name}>Download</a></Button>}</DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={uploadOpen} onOpenChange={open => { if (!saving) setUploadOpen(open); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add vehicle document</DialogTitle><DialogDescription>Choose a PDF, PNG, or JPEG file up to 5 MB.</DialogDescription></DialogHeader>
        <div><Label htmlFor="vehicle-document-kind">Document type</Label>
          <select id="vehicle-document-kind" className="w-full rounded-md border bg-background p-2 text-sm" value={kind} onChange={event => setKind(event.target.value)}>{kinds.map(value => <option key={value}>{value}</option>)}</select>
        </div>
        <div><Label htmlFor="vehicle-document-file">File</Label><Input id="vehicle-document-file" type="file" accept="application/pdf,image/png,image/jpeg" onChange={event => setFile(event.target.files?.[0])} /></div>
        {file && file.size > maxFileSize && <p className="text-sm text-rose-700">This file is larger than 5 MB.</p>}
        <DialogFooter><Button onClick={addDocument} disabled={!file || file.size > maxFileSize || saving}>{saving ? "Uploading…" : "Add document"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
