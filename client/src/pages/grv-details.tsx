import { Layout } from "@/components/layout";
import { useRoute, useLocation, Link } from "wouter";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useGrv } from "@/hooks/use-grvs";
import { useCompany } from "@/hooks/use-companies";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Download, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { PDFDownloadLink } from "@react-pdf/renderer";
import { GrvPdfDocument } from "@/components/inventory/grv-pdf-document";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

type SupplierInvoiceLinePreview = {
  id: number;
  productId: number;
  productName: string;
  sku: string;
  quantity: number;
  unitCost: number;
  sourceTotal: number;
  taxRate: number;
  taxAmount: number;
  subtotal: number;
  total: number;
};

export default function GrvDetailsPage() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/inventory/grvs/:id");
  const grvId = decodeURIComponent(params?.id || "");
  const { activeCompanyId } = useActiveCompany();
  const companyId = activeCompanyId || 0;

  const { data: grv, isLoading } = useGrv(companyId, grvId);
  const { data: company } = useCompany(companyId);

  const [isInvoiceDialogOpen, setIsInvoiceDialogOpen] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [vatRate, setVatRate] = useState("");
  const [taxInclusive, setTaxInclusive] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const currency = company?.currency || "USD";

  const getEffectiveLineRate = (lineRate?: number) => {
    const override = vatRate.trim();
    if (override !== "") return Number(override || 0);
    return Number(lineRate || 0);
  };

  const invoiceLinePreview: SupplierInvoiceLinePreview[] = (grv?.lines || []).map((line) => {
    const rate = getEffectiveLineRate(line.taxRate);
    const sourceTotal = Number(line.totalCost || 0);
    const taxAmount = rate > 0
      ? taxInclusive
        ? sourceTotal - (sourceTotal / (1 + rate / 100))
        : sourceTotal * (rate / 100)
      : 0;
    const subtotal = taxInclusive ? sourceTotal - taxAmount : sourceTotal;
    const total = taxInclusive ? sourceTotal : sourceTotal + taxAmount;

    return {
      id: line.id,
      productId: line.productId,
      productName: line.productName,
      sku: line.sku,
      quantity: line.quantity,
      unitCost: line.unitCost,
      sourceTotal,
      taxRate: rate,
      taxAmount,
      subtotal,
      total,
    };
  });

  const invoiceSubtotal = invoiceLinePreview.reduce((sum, line) => sum + line.subtotal, 0);
  const invoiceTaxAmount = invoiceLinePreview.reduce((sum, line) => sum + line.taxAmount, 0);
  const invoiceTotal = invoiceLinePreview.reduce((sum, line) => sum + line.total, 0);

  const createInvoiceMutation = useMutation({
    mutationFn: async () => {
      if (!grv?.supplierId) throw new Error("This GRV does not have a supplier");

      const payload = {
        supplierId: grv?.supplierId,
        invoiceNumber,
        date: new Date().toISOString(),
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        totalAmount: invoiceTotal.toFixed(2),
        taxAmount: invoiceTaxAmount.toFixed(2),
        currency,
        notes: `Created from GRV ${grv.grvNumber}`,
        status: "unpaid",
        items: invoiceLinePreview.map((line) => ({
          productId: line.productId,
          quantity: line.quantity.toString(),
          description: line.productName,
          unitPrice: (line.subtotal / Number(line.quantity || 1)).toFixed(2),
          totalPrice: line.subtotal.toFixed(2),
          taxRate: line.taxRate.toFixed(2),
          taxAmount: line.taxAmount.toFixed(2),
        }))
      };
      const res = await apiRequest("POST", `/api/companies/${companyId}/supplier-invoices`, payload);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Success", description: "Supplier Invoice created successfully" });
      setIsInvoiceDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${companyId}/supplier-invoices`] });
      setLocation("/supplier-invoices"); // Navigate to the invoices page to see it
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to create invoice", variant: "destructive" });
    }
  });

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button variant="outline" className="rounded-xl" onClick={() => setLocation("/inventory/account")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </div>

        {grv && (
          <div className="flex items-center gap-2">
            <Dialog open={isInvoiceDialogOpen} onOpenChange={setIsInvoiceDialogOpen}>
              <DialogTrigger asChild>
                <Button className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white">
                  Create Supplier Invoice
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Supplier Invoice</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Supplier Invoice Number</Label>
                    <Input 
                      placeholder="e.g. INV-2023-001" 
                      value={invoiceNumber} 
                      onChange={e => setInvoiceNumber(e.target.value)} 
                    />
                    <p className="text-xs text-slate-500">Provide the invoice number given by the supplier.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>VAT Rate Override %</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={vatRate}
                        onChange={(e) => setVatRate(e.target.value)}
                        placeholder="Use product VAT rates"
                      />
                      <p className="text-xs text-slate-500">Clear this field to use each product's configured VAT rate.</p>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 mt-6">
                      <Label htmlFor="grv-vat-inclusive" className="text-sm">Amounts include VAT</Label>
                      <Switch id="grv-vat-inclusive" checked={taxInclusive} onCheckedChange={setTaxInclusive} />
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200 overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="p-2 font-bold text-slate-500">Item</th>
                          <th className="p-2 text-right font-bold text-slate-500">Qty</th>
                          <th className="p-2 text-right font-bold text-slate-500">VAT %</th>
                          <th className="p-2 text-right font-bold text-slate-500">VAT</th>
                          <th className="p-2 text-right font-bold text-slate-500">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invoiceLinePreview.map((line) => (
                          <tr key={line.id} className="border-t border-slate-100">
                            <td className="p-2 font-semibold text-slate-700">{line.productName}</td>
                            <td className="p-2 text-right font-mono">{line.quantity.toFixed(2)}</td>
                            <td className="p-2 text-right font-mono">{line.taxRate.toFixed(2)}%</td>
                            <td className="p-2 text-right font-mono">{currency} {line.taxAmount.toFixed(2)}</td>
                            <td className="p-2 text-right font-mono font-bold">{currency} {line.total.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Subtotal</span>
                      <span className="font-mono font-semibold">{currency} {invoiceSubtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Input VAT</span>
                      <span className="font-mono font-semibold">{currency} {invoiceTaxAmount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-base">
                      <span className="font-bold text-slate-700">Supplier Invoice Total</span>
                      <span className="font-mono font-black">{currency} {invoiceTotal.toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-4">
                    <Button variant="outline" onClick={() => setIsInvoiceDialogOpen(false)}>Cancel</Button>
                    <Button 
                      onClick={() => createInvoiceMutation.mutate()} 
                      disabled={createInvoiceMutation.isPending || !invoiceNumber}
                    >
                      {createInvoiceMutation.isPending ? "Creating..." : "Confirm"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            <PDFDownloadLink
              document={<GrvPdfDocument grv={grv} company={company} />}
              fileName={`${grv.grvNumber || "GRV"}.pdf`}
            >
              {({ loading }) => (
                <Button variant="outline" className="rounded-xl border-slate-200">
                  {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                  Download PDF
                </Button>
              )}
            </PDFDownloadLink>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-slate-500">
          <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading GRV...
        </div>
      ) : !grv ? (
        <Card className="rounded-2xl border-slate-200">
          <CardContent className="p-8 text-center">
            <p className="font-bold text-slate-700">GRV not found</p>
            <Link href="/inventory/account">
              <Button variant="outline" className="rounded-xl mt-4">Return to Goods Received</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-none shadow-xl shadow-slate-200/50 bg-white rounded-[2rem] overflow-hidden ring-1 ring-slate-100">
          <CardContent className="p-8">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Goods Received Voucher</h2>
              <Badge variant="outline" className="font-mono mt-2">{grv.grvNumber}</Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div className="rounded-xl border border-slate-200 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Supplier</p>
                <p className="font-bold text-slate-800">{grv.supplierName || "N/A"}</p>
              </div>
              <div className="rounded-xl border border-slate-200 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Document Info</p>
                <p className="text-sm text-slate-700">Date: {grv.createdAt ? format(new Date(grv.createdAt), "dd MMM yyyy HH:mm") : "-"}</p>
                <p className="text-sm text-slate-700">Recorded By: {grv.createdBy || "System"}</p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-400">SKU</th>
                    <th className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Description</th>
                    <th className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Qty</th>
                    <th className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Unit Cost</th>
                    <th className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Line Total</th>
                  </tr>
                </thead>
                <tbody>
                  {grv.lines.map((line) => (
                    <tr key={line.id} className="border-b border-slate-100 last:border-0">
                      <td className="p-4 text-xs font-mono text-slate-500">{line.sku || "-"}</td>
                      <td className="p-4 text-sm font-semibold text-slate-800">{line.productName}</td>
                      <td className="p-4 text-sm font-medium text-slate-700 text-right">{line.quantity.toFixed(2)}</td>
                      <td className="p-4 text-sm font-medium text-slate-700 text-right">${line.unitCost.toFixed(2)}</td>
                      <td className="p-4 text-sm font-black text-slate-900 text-right">${line.totalCost.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6 flex justify-end">
              <div className="w-full max-w-sm rounded-xl border border-slate-200 p-4 bg-slate-50/40">
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-slate-500">Total Quantity</span>
                  <span className="font-bold text-slate-800">{grv.totalQuantity.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-base">
                  <span className="font-bold text-slate-700">Total Cost</span>
                  <span className="font-black text-slate-900">${grv.totalCost.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {grv.notes ? (
              <div className="mt-6 rounded-xl border border-slate-200 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Notes</p>
                <p className="text-sm text-slate-700">{grv.notes}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}
    </Layout>
  );
}
