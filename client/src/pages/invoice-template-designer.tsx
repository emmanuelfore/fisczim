import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InvoicePDF } from "@/components/invoices/pdf-document";
import { useCompany } from "@/hooks/use-companies";
import { useUpdateCompany } from "@/hooks/use-companies";
import { useTaxConfig } from "@/hooks/use-tax-config";
import {
  defaultInvoiceTemplateSettings,
  getStoredInvoiceTemplateSettings,
  invoiceTemplates,
  type InvoiceTemplateDesignerSettings,
  type InvoiceTemplateId,
} from "@/lib/invoice-templates";
import { cn } from "@/lib/utils";
import { Check, Loader2, Palette, Save } from "lucide-react";
import { pdf } from "@react-pdf/renderer";
import QRCode from "qrcode";
import { useEffect, useMemo, useState } from "react";

export default function InvoiceTemplateDesignerPage() {
  const companyId = parseInt(localStorage.getItem("selectedCompanyId") || "0");
  const { data: company } = useCompany(companyId);
  const updateCompany = useUpdateCompany(companyId);
  const { taxTypes } = useTaxConfig(companyId);
  const [settings, setSettings] = useState<InvoiceTemplateDesignerSettings>(defaultInvoiceTemplateSettings);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const selectedTemplate = useMemo(
    () => invoiceTemplates.find(template => template.id === settings.defaultTemplateId) || invoiceTemplates[0],
    [settings.defaultTemplateId]
  );
  const accent = settings.accentColor || selectedTemplate.accent;

  useEffect(() => {
    setSettings(getStoredInvoiceTemplateSettings(companyId));
  }, [companyId]);

  const updateSettings = (patch: Partial<InvoiceTemplateDesignerSettings>) => {
    setSettings(current => {
      const next = { ...current, ...patch };
      if (companyId) localStorage.setItem(`invoice_template_designer_${companyId}`, JSON.stringify(next));
      return next;
    });
  };

  const saveSettings = async () => {
    localStorage.setItem(`invoice_template_designer_${companyId}`, JSON.stringify(settings));
    if (companyId) {
      await updateCompany.mutateAsync({
        invoiceTemplate: settings.defaultTemplateId,
        primaryColor: accent,
      } as any).catch(() => undefined);
    }
  };

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    async function renderPreview() {
      setPreviewLoading(true);
      const sampleQr = await QRCode.toDataURL("https://receipt.zimra.org/sample-template-preview");
      const sampleCompany = {
        ...(company || {}),
        id: companyId,
        name: company?.name || "Your Company",
        tradingName: company?.tradingName || company?.name || "Your Company",
        address: company?.address || "12 Samora Machel Avenue",
        city: company?.city || "Harare",
        country: company?.country || "Zimbabwe",
        tin: company?.tin || "1234567890",
        vatNumber: company?.vatNumber || "VAT000000",
        vatRegistered: company?.vatRegistered ?? true,
        fdmsDeviceId: company?.fdmsDeviceId || "FDMS-001",
        fdmsDeviceSerialNo: company?.fdmsDeviceSerialNo || "SERIAL-001",
        primaryColor: accent,
        invoiceTemplate: settings.defaultTemplateId,
        bankName: company?.bankName || "CBZ Bank",
        accountName: company?.accountName || company?.tradingName || company?.name || "Your Company",
        accountNumber: company?.accountNumber || "00123456789",
        branchCode: company?.branchCode || "6101",
        qrUrl: company?.qrUrl || "https://receipt.zimra.org",
      };
      const sampleInvoice = {
        id: 0,
        companyId,
        invoiceNumber: "INV-000245",
        issueDate: new Date("2026-05-24").toISOString(),
        dueDate: new Date("2026-06-23").toISOString(),
        status: "issued",
        fiscalCode: "SAMPLE-FISCAL-CODE",
        qrCodeData: "SAMPLE-ZIMRA-QR-DATA-1234567890ABCDEF",
        fiscalDayNo: 12,
        receiptCounter: 245,
        receiptGlobalNo: 2450,
        currency: "USD",
        paymentMethod: "CASH",
        transactionType: "FiscalInvoice",
        taxInclusive: false,
        subtotal: "652.17",
        taxAmount: "97.83",
        total: "750.00",
        notes: "Thank you for your business.",
        poNumber: "PO-2026-118",
        invoiceTemplate: settings.defaultTemplateId,
        items: [
          { description: "Consulting services", quantity: "1", unitPrice: "250.00", taxRate: "15", lineTotal: "250.00", product: { hsCode: "9983" } },
          { description: "Software licence", quantity: "1", unitPrice: "250.00", taxRate: "15", lineTotal: "250.00", product: { hsCode: "8523" } },
          { description: "Implementation support", quantity: "1", unitPrice: "250.00", taxRate: "15", lineTotal: "250.00", product: { hsCode: "9983" } },
        ],
      };
      const sampleCustomer = {
        name: "Acme Trading Pvt Ltd",
        address: "45 Enterprise Road",
        city: "Harare",
        country: "Zimbabwe",
        tin: "1098765432",
        vatNumber: "VAT987654",
        email: "accounts@acme.co.zw",
        phone: "+263 77 000 0000",
      };

      const blob = await pdf(
        <InvoicePDF
          invoice={sampleInvoice}
          company={sampleCompany}
          customer={sampleCustomer}
          qrCodeUrl={sampleQr}
          taxTypes={taxTypes.data}
          templateSettings={settings}
        />
      ).toBlob();

      if (cancelled) return;
      objectUrl = URL.createObjectURL(blob);
      setPreviewUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return objectUrl;
      });
      setPreviewLoading(false);
    }

    renderPreview().catch(() => {
      if (!cancelled) setPreviewLoading(false);
    });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [company, companyId, accent, settings, taxTypes.data]);

  return (
    <Layout>
      <div className="mx-auto grid max-w-[1500px] gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                <Palette className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-950">Template Designer</h2>
                <p className="text-sm text-slate-500">Choose a default look and tune the invoice details.</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Accent color</Label>
                <div className="flex gap-2">
                  <Input
                    type="color"
                    value={accent}
                    onChange={event => updateSettings({ accentColor: event.target.value })}
                    className="h-11 w-16 p-1"
                  />
                  <Input
                    value={accent}
                    onChange={event => updateSettings({ accentColor: event.target.value })}
                    className="h-11 font-mono"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Logo placement</Label>
                <Select value={settings.logoPlacement} onValueChange={(value: InvoiceTemplateDesignerSettings["logoPlacement"]) => updateSettings({ logoPlacement: value })}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="left">Left</SelectItem>
                    <SelectItem value="center">Center</SelectItem>
                    <SelectItem value="right">Right</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>QR code placement</Label>
                <Select value={settings.qrPlacement} onValueChange={(value: InvoiceTemplateDesignerSettings["qrPlacement"]) => updateSettings({ qrPlacement: value })}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="header-right">Header right</SelectItem>
                    <SelectItem value="header-center">Header center</SelectItem>
                    <SelectItem value="footer">Footer verification block</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Density</Label>
                <Select value={settings.density} onValueChange={(value: InvoiceTemplateDesignerSettings["density"]) => updateSettings({ density: value })}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="comfortable">Comfortable</SelectItem>
                    <SelectItem value="compact">Compact</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button className="h-11 w-full gap-2 bg-slate-950 text-white hover:bg-slate-800" onClick={saveSettings}>
                <Save className="h-4 w-4" /> Save Template Settings
              </Button>
            </div>
          </div>

          <div className="grid gap-2">
            {invoiceTemplates.map(template => (
              <button
                key={template.id}
                type="button"
                onClick={() => updateSettings({ defaultTemplateId: template.id })}
                className={cn(
                  "flex items-center gap-3 rounded-xl border bg-white p-3 text-left shadow-sm transition hover:border-slate-300",
                  settings.defaultTemplateId === template.id ? "border-slate-950 ring-2 ring-slate-950/5" : "border-slate-200"
                )}
              >
                <span className="h-9 w-9 rounded-lg border" style={{ background: template.secondary, borderColor: template.border }}>
                  <span className="block h-2 rounded-t-lg" style={{ background: template.accent }} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-slate-900">{template.name}</span>
                  <span className="block truncate text-xs text-slate-500">{template.description}</span>
                </span>
                {settings.defaultTemplateId === template.id && <Check className="h-4 w-4 text-emerald-600" />}
              </button>
            ))}
          </div>
        </aside>

        <main className="rounded-2xl border border-slate-200 bg-slate-100 p-4 shadow-sm">
          <div className="flex min-h-[900px] items-start justify-center overflow-auto rounded-xl bg-slate-200/70 px-3 py-5">
            {previewLoading || !previewUrl ? (
              <div className="flex min-h-[720px] items-center justify-center gap-2 text-slate-500">
                <Loader2 className="h-5 w-5 animate-spin" /> Rendering exact PDF preview...
              </div>
            ) : (
              <div className="aspect-[210/297] w-full max-w-[794px] overflow-hidden rounded-sm bg-white shadow-[0_18px_45px_rgba(15,23,42,0.18)] ring-1 ring-slate-200">
                <iframe
                  src={`${previewUrl}#toolbar=0&navpanes=0&scrollbar=0&view=Fit`}
                  title="Invoice template PDF preview"
                  width="100%"
                  height="100%"
                  className="h-full w-full"
                  style={{ border: "none", display: "block" }}
                />
              </div>
            )}
          </div>
        </main>
      </div>
    </Layout>
  );
}
