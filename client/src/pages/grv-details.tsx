import { Layout } from "@/components/layout";
import { useRoute, useLocation, Link } from "wouter";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useGrv, useConfirmGdn } from "@/hooks/use-grvs";
import { useCompany } from "@/hooks/use-companies";
import { usePurchaseReturns } from "@/hooks/use-purchase-returns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Download, Loader2, Package, CheckCircle2, Truck, FileText, MoreHorizontal, Clock } from "lucide-react";
import { format } from "date-fns";
import { PDFDownloadLink } from "@react-pdf/renderer";
import { GrvPdfDocument } from "@/components/inventory/grv-pdf-document";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";

type SupplierInvoiceLinePreview = {
  id: number;
  productId: number;
  accountCode?: string | null;
  description?: string | null;
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
  const { data: purchaseReturns = [] } = usePurchaseReturns(companyId);

  const [isInvoiceDialogOpen, setIsInvoiceDialogOpen] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [vatRate, setVatRate] = useState("");
  const [taxInclusive, setTaxInclusive] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const currency = company?.currency || "USD";

  const { data: products = [] } = useQuery<any[]>({
    queryKey: [`/api/companies/${companyId}/products`],
    enabled: !!companyId,
  });

  const { data: accounts = [] } = useQuery<any[]>({
    queryKey: [`/api/accounting/accounts`, companyId],
    enabled: !!companyId,
  });

  const { data: taxTypes = [] } = useQuery({
    queryKey: [`/api/tax-types?companyId=${companyId}`],
    enabled: !!companyId,
  });

  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [activeLineIndex, setActiveLineIndex] = useState<number | null>(null);

  const confirmGdn = useConfirmGdn(companyId);

  const [editableLines, setEditableLines] = useState<any[]>([]);

  useEffect(() => {
    if (grv) {
      if (grv.status === "DRAFT" && editableLines.length === 0) {
        setEditableLines(grv.lines.map((l: any) => ({ ...l })));
      }
      setTaxInclusive(!!grv.taxInclusive);
    }
  }, [grv]);

  const handleLineChange = (index: number, field: string, value: any) => {
    const updated = [...editableLines];
    updated[index] = { ...updated[index], [field]: value };
    setEditableLines(updated);
  };

  const addLine = (type: "stock" | "expense") => {
    setEditableLines([...editableLines, { 
      id: `new-${Date.now()}`,
      isNew: true,
      productId: type === "stock" ? "" : null, 
      accountCode: type === "expense" ? "" : null, 
      description: "", 
      quantity: 1, 
      unitCost: 0,
      taxTypeId: null,
      taxRate: 0,
      taxAmount: 0,
      isRecoverable: true
    }]);
  };

  const removeLine = (index: number) => {
    const updated = [...editableLines];
    updated.splice(index, 1);
    setEditableLines(updated);
  };

  const openAccountModal = (index: number) => {
    setActiveLineIndex(index);
    setIsAccountModalOpen(true);
  };

  const handleAccountSelect = (accountCode: string, description: string) => {
    if (activeLineIndex !== null) {
      handleLineChange(activeLineIndex, "accountCode", accountCode);
      handleLineChange(activeLineIndex, "description", description);
    }
    setIsAccountModalOpen(false);
  };

  const handleConfirm = () => {
    if (!grv) return;
    confirmGdn.mutate({
      gdnId: Number(grv.id),
      items: editableLines.map(l => ({ 
        productId: l.productId, 
        accountCode: l.accountCode,
        description: l.description,
        quantity: l.quantity, 
        unitCost: l.unitCost,
        taxTypeId: (l.taxTypeId && l.taxTypeId !== "none") ? Number(l.taxTypeId) : null,
        taxRate: l.taxRate,
        taxAmount: l.taxAmount,
        isRecoverable: l.isRecoverable
      }))
    }, {
      onSuccess: (data: any) => {
        toast({ title: "Success", description: "GRV has been posted and stock updated." });
        if (data && data.grvNumber) {
          setLocation(`/inventory/grvs/${data.grvNumber}`);
        }
      },
      onError: (err: any) => {
        toast({ title: "Failed to post", description: err.message, variant: "destructive" });
      }
    });
  };

  const getEffectiveLineRate = (lineRate?: number) => {
    const override = vatRate.trim();
    if (override !== "") return Number(override || 0);
    return Number(lineRate || 0);
  };

  const invoiceLinePreview: SupplierInvoiceLinePreview[] = (
    grv?.lines || []
  ).map((line) => {
    const rate = getEffectiveLineRate(line.taxRate);
    const sourceTotal = Number(line.totalCost || 0);
    const taxAmount =
      rate > 0
        ? taxInclusive
          ? sourceTotal - sourceTotal / (1 + rate / 100)
          : sourceTotal * (rate / 100)
        : 0;
    const subtotal = taxInclusive ? sourceTotal - taxAmount : sourceTotal;
    const total = taxInclusive ? sourceTotal : sourceTotal + taxAmount;

    return {
      id: line.id,
      productId: line.productId,
      accountCode: line.accountCode,
      description: line.description,
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

  const invoiceSubtotal = invoiceLinePreview.reduce(
    (sum, line) => sum + line.subtotal,
    0,
  );
  const invoiceTaxAmount = invoiceLinePreview.reduce(
    (sum, line) => sum + line.taxAmount,
    0,
  );
  const invoiceTotal = invoiceLinePreview.reduce(
    (sum, line) => sum + line.total,
    0,
  );

  const createInvoiceMutation = useMutation({
    mutationFn: async () => {
      if (!grv?.supplierId)
        throw new Error("This GRV does not have a supplier");

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
        referenceGdnId: Number(grv.id),
        items: invoiceLinePreview.map((line) => ({
          productId: line.productId,
          accountCode: line.accountCode,
          quantity: line.quantity.toString(),
          description: line.productName,
          unitPrice: (line.subtotal / Number(line.quantity || 1)).toFixed(2),
          totalPrice: line.subtotal.toFixed(2),
          taxRate: line.taxRate.toFixed(2),
          taxAmount: line.taxAmount.toFixed(2),
        })),
      };
      const res = await apiRequest(
        "POST",
        `/api/companies/${companyId}/supplier-invoices`,
        payload,
      );
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Success",
        description: "Supplier Invoice created successfully",
      });
      setIsInvoiceDialogOpen(false);
      queryClient.invalidateQueries({
        queryKey: [`/api/companies/${companyId}/supplier-invoices`],
      });
      setLocation("/supplier-invoices");
    },
    onError: (err: any) => {
      toast({
        title: "Error",
        description: err.message || "Failed to create invoice",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20 text-slate-500">
          <Loader2 className="w-6 h-6 animate-spin mr-2 text-primary" /> Loading Goods Received Voucher...
        </div>
      </Layout>
    );
  }

  if (!grv) {
    return (
      <Layout>
        <Card className="rounded-2xl border-slate-200 mt-6">
          <CardContent className="p-8 text-center flex flex-col items-center justify-center">
            <Package className="h-12 w-12 text-slate-300 mb-4" />
            <p className="font-bold text-slate-700">GRV not found</p>
            <Link href="/inventory/account">
              <Button variant="outline" className="rounded-xl mt-4">
                Return to Goods Received
              </Button>
            </Link>
          </CardContent>
        </Card>
      </Layout>
    );
  }

  const matchedReturns = purchaseReturns.filter(pr => pr.goodsDeliveryNoteId === Number(grv.id));

  return (
    <Layout>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            className="rounded-xl"
            onClick={() => setLocation("/inventory/account")}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div className="h-6 w-px bg-slate-200 mx-2" />
          <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            Purchase Receipt Details
          </h1>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 space-y-6">
          <Card className="rounded-[18px] border-slate-200 shadow-sm overflow-hidden">
            <div className="border-b border-slate-100 bg-white px-6 py-5 flex items-center gap-3">
              <Truck className="h-5 w-5 text-blue-600" />
              <h3 className="font-bold text-slate-800 text-lg">Receipt Information</h3>
              <Badge variant="outline" className="ml-2 font-mono">{grv.grvNumber}</Badge>
            </div>
            <CardContent className="p-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 mb-8">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Receipt Date</p>
                  <p className="text-sm font-semibold text-slate-800">
                    {grv.createdAt ? format(new Date(grv.createdAt), "dd MMM yyyy") : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Supplier</p>
                  <p className="text-sm font-semibold text-blue-600">{grv.supplierName || "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Currency</p>
                  <p className="text-sm font-semibold text-slate-800">{currency}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Recorded By</p>
                  <p className="text-sm font-semibold text-slate-800">{grv.createdBy || "System"}</p>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-3">
                  <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <span className="bg-slate-100 text-slate-500 w-6 h-6 rounded-full flex items-center justify-center text-xs">
                      {(grv.status === "DRAFT" && editableLines.length > 0 ? editableLines : grv.lines).filter(l => l.productId).length}
                    </span>
                    Received Inventory
                  </h4>
                  {grv.status === "DRAFT" && (
                    <div className="flex items-center gap-2">
                      <Label htmlFor="tax-inc" className="text-xs text-slate-500 cursor-pointer">Amounts include VAT</Label>
                      <Switch
                        id="tax-inc"
                        checked={taxInclusive}
                        onCheckedChange={(checked) => {
                          setTaxInclusive(checked);
                          const updated = editableLines.map(line => {
                            const rate = Number(line.taxRate || 0);
                            const qty = Number(line.quantity || 0);
                            const cost = Number(line.unitCost || 0);
                            const baseAmt = qty * cost;
                            const taxAmt = checked ? baseAmt - (baseAmt / (1 + (rate / 100))) : baseAmt * (rate / 100);
                            return { ...line, taxAmount: taxAmt.toFixed(2) };
                          });
                          setEditableLines(updated);
                        }}
                      />
                    </div>
                  )}
                </div>
                <div className="rounded-xl border border-slate-100 overflow-hidden mb-6">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="p-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Description</th>
                        <th className="p-3 text-[10px] font-black uppercase tracking-widest text-slate-400">SKU</th>
                        <th className="p-3 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Unit Cost</th>
                        <th className="p-3 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Qty</th>
                        <th className="p-3 text-[10px] font-black uppercase tracking-widest text-slate-400 w-48">Tax</th>
                        <th className="p-3 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Line Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(grv.status === "DRAFT" && editableLines.length > 0 ? editableLines : grv.lines).filter(l => l.productId).map((line: any, originalIdx: number) => {
                        const idx = (grv.status === "DRAFT" && editableLines.length > 0 ? editableLines : grv.lines).findIndex(l => l.id === line.id);
                        return (
                        <tr key={line.id} className="border-t border-slate-50">
                          <td className="p-3 font-semibold text-slate-800">
                            {line.isNew ? (
                              <Select
                                value={line.productId?.toString()}
                                onValueChange={(val) => handleLineChange(idx, "productId", Number(val))}
                              >
                                <SelectTrigger className="bg-white min-w-[200px]">
                                  <SelectValue placeholder="Select product..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {(products || []).map((p: any) => (
                                    <SelectItem key={p.id} value={p.id.toString()}>
                                      {p.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              line.productName
                            )}
                          </td>
                          <td className="p-3 font-mono text-xs text-slate-500">{line.sku || "-"}</td>
                          <td className="p-3 font-mono text-sm text-right text-slate-700">
                            {grv.status === "DRAFT" ? (
                              <div className="flex justify-end items-center gap-1">
                                <span className="text-slate-400 text-xs">{currency}</span>
                                <Input 
                                  type="number" 
                                  step="0.01" 
                                  min="0"
                                  className="h-8 w-24 text-right font-mono" 
                                  value={line.unitCost} 
                                  onChange={(e) => {
                                    const cost = Number(e.target.value || 0);
                                    const qty = Number(line.quantity || 0);
                                    const rate = Number(line.taxRate || 0);
                                    const baseAmt = qty * cost;
                                    const taxAmt = taxInclusive ? baseAmt - (baseAmt / (1 + (rate / 100))) : baseAmt * (rate / 100);
                                    
                                    const updated = [...editableLines];
                                    updated[idx] = { ...updated[idx], unitCost: cost, taxAmount: taxAmt.toFixed(2) };
                                    setEditableLines(updated);
                                  }} 
                                />
                              </div>
                            ) : (
                              <>{currency} {line.unitCost.toFixed(2)}</>
                            )}
                          </td>
                          <td className="p-3 font-bold text-right">
                            {grv.status === "DRAFT" ? (
                              <div className="flex justify-end items-center">
                                <Input 
                                  type="number" 
                                  step="0.01" 
                                  min="0"
                                  className="h-8 w-20 text-right font-mono" 
                                  value={line.quantity} 
                                  onChange={(e) => handleLineChange(idx, "quantity", e.target.value)} 
                                />
                              </div>
                            ) : (
                              <>{line.quantity.toFixed(2)}</>
                            )}
                          </td>
                          <td className="p-3 space-y-1">
                            {grv.status === "DRAFT" ? (
                              <>
                                <Select
                                  value={line.taxTypeId ? String(line.taxTypeId) : "none"}
                                  onValueChange={(val) => {
                                    const t = (taxTypes as any[]).find((x) => String(x.id) === val);
                                    if (t) {
                                      const rate = Number(t.rate);
                                      const qty = Number(line.quantity || 0);
                                      const cost = Number(line.unitCost || 0);
                                      const baseAmt = qty * cost;
                                      const taxAmt = taxInclusive ? baseAmt - (baseAmt / (1 + (rate / 100))) : baseAmt * (rate / 100);
                                      
                                      const updated = [...editableLines];
                                      updated[idx] = { ...updated[idx], taxTypeId: val, taxRate: rate, taxAmount: taxAmt.toFixed(2) };
                                      setEditableLines(updated);
                                    } else if (val === "none") {
                                      const updated = [...editableLines];
                                      updated[idx] = { ...updated[idx], taxTypeId: null, taxRate: 0, taxAmount: 0 };
                                      setEditableLines(updated);
                                    }
                                  }}
                                >
                                  <SelectTrigger className="h-8 bg-white text-xs">
                                    <SelectValue placeholder="No Tax" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="none">No Tax</SelectItem>
                                    {(taxTypes as any[]).map((t) => (
                                      <SelectItem key={t.id} value={String(t.id)}>
                                        {t.name} ({Number(t.rate)}%)
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                {Number(line.taxRate) > 0 && (
                                  <div className="flex items-center gap-1 justify-end pt-1 pr-1">
                                    <label htmlFor={`rec-${idx}`} className="text-[8px] text-slate-500 uppercase cursor-pointer">
                                      Recoverable
                                    </label>
                                    <input
                                      type="checkbox"
                                      id={`rec-${idx}`}
                                      checked={line.isRecoverable !== false}
                                      onChange={(e) => handleLineChange(idx, "isRecoverable", e.target.checked)}
                                      className="h-3 w-3 rounded border-gray-300 text-blue-600"
                                    />
                                  </div>
                                )}
                              </>
                            ) : (
                              <div className="text-right">
                                <div>{line.taxTypeName || "No Tax"}</div>
                                <div className="text-xs text-slate-500">{currency} {Number(line.taxAmount || 0).toFixed(2)}</div>
                              </div>
                            )}
                          </td>
                          <td className="p-3 font-bold text-slate-900 text-right">
                            {currency} {((line.unitCost || 0) * (line.quantity || 0) + (taxInclusive ? 0 : Number(line.taxAmount || 0))).toFixed(2)}
                          </td>
                        </tr>
                      )})}
                    </tbody>
                  </table>
                  {grv.status === "DRAFT" && (
                    <div className="p-4 border-t border-slate-100 bg-slate-50 flex">
                      <Button variant="outline" size="sm" onClick={() => addLine("stock")} className="rounded-xl border-dashed">
                        <Plus className="w-4 h-4 mr-2" /> Add Stock Item
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {((grv.status === "DRAFT" && editableLines.length > 0 ? editableLines : grv.lines).some((l: any) => l.productId === null) || grv.status === "DRAFT") && (
                <div>
                  <h4 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                    <span className="bg-slate-100 text-slate-500 w-6 h-6 rounded-full flex items-center justify-center text-xs">
                      {(grv.status === "DRAFT" && editableLines.length > 0 ? editableLines : grv.lines).filter(l => l.productId === null).length}
                    </span>
                    Landed Costs & Additional Charges
                  </h4>
                  <div className="rounded-xl border border-slate-100 overflow-hidden">
                    <table className="w-full text-left bg-slate-50/50">
                      <thead>
                        <tr className="bg-slate-100/50 border-b border-slate-200">
                          <th className="p-3 text-[10px] font-black uppercase tracking-widest text-slate-500">Charge Description</th>
                          <th className="p-3 text-[10px] font-black uppercase tracking-widest text-slate-500">Expense Account</th>
                          <th className="p-3 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Cost</th>
                          <th className="p-3 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Qty</th>
                          <th className="p-3 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Total Charge</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(grv.status === "DRAFT" && editableLines.length > 0 ? editableLines : grv.lines).filter(l => l.productId === null).map((line: any, originalIdx: number) => {
                          const idx = (grv.status === "DRAFT" && editableLines.length > 0 ? editableLines : grv.lines).findIndex(l => l.id === line.id);
                          return (
                          <tr key={line.id} className="border-t border-slate-100">
                            <td className="p-3 font-semibold text-slate-800">
                              {line.isNew ? (
                                <Input 
                                  placeholder="Description (e.g. Freight)" 
                                  value={line.description || ""}
                                  onChange={(e) => handleLineChange(idx, "description", e.target.value)}
                                  className="bg-white min-w-[150px]"
                                />
                              ) : (
                                line.productName || line.description
                              )}
                            </td>
                            <td className="p-3 font-mono text-xs text-slate-500">
                              {line.isNew ? (
                                <Button variant="outline" size="sm" onClick={() => openAccountModal(idx)}>
                                  {line.accountCode || "Select GL Account"}
                                </Button>
                              ) : (
                                line.accountCode || "-"
                              )}
                            </td>
                            <td className="p-3 font-mono text-sm text-right text-slate-700">
                              {grv.status === "DRAFT" ? (
                                <div className="flex justify-end items-center gap-1">
                                  <span className="text-slate-400 text-xs">{currency}</span>
                                  <Input 
                                    type="number" 
                                    step="0.01" 
                                    min="0"
                                    className="h-8 w-24 text-right font-mono" 
                                    value={line.unitCost} 
                                    onChange={(e) => handleLineChange(idx, "unitCost", e.target.value)} 
                                  />
                                </div>
                              ) : (
                                <>{currency} {line.unitCost.toFixed(2)}</>
                              )}
                            </td>
                            <td className="p-3 font-bold text-right">
                              {grv.status === "DRAFT" ? (
                                <div className="flex justify-end items-center">
                                  <Input 
                                    type="number" 
                                    step="0.01" 
                                    min="0"
                                    className="h-8 w-20 text-right font-mono" 
                                    value={line.quantity} 
                                    onChange={(e) => {
                                      const qty = Number(e.target.value || 0);
                                      const cost = Number(line.unitCost || 0);
                                      const rate = Number(line.taxRate || 0);
                                      const baseAmt = qty * cost;
                                      const taxAmt = taxInclusive ? baseAmt - (baseAmt / (1 + (rate / 100))) : baseAmt * (rate / 100);
                                      
                                      const updated = [...editableLines];
                                      updated[idx] = { ...updated[idx], quantity: qty, taxAmount: taxAmt.toFixed(2) };
                                      setEditableLines(updated);
                                    }} 
                                  />
                                </div>
                              ) : (
                                <>{line.quantity.toFixed(2)}</>
                              )}
                            </td>
                            <td className="p-3 font-bold text-slate-900 text-right">
                              {currency} {((line.unitCost || 0) * (line.quantity || 0)).toFixed(2)}
                            </td>
                          </tr>
                        )})}
                      </tbody>
                    </table>
                    {grv.status === "DRAFT" && (
                      <div className="p-4 border-t border-slate-100 flex">
                        <Button variant="outline" size="sm" onClick={() => addLine("expense")} className="rounded-xl border-dashed">
                          <Plus className="w-4 h-4 mr-2" /> Add Freight/Charge
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {grv.notes && (
                <div className="mt-6 rounded-xl border border-amber-100 bg-amber-50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-amber-600 mb-1">Notes / Instructions</p>
                  <p className="text-sm text-amber-900 leading-relaxed">{grv.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="rounded-[18px] border-slate-200 shadow-sm overflow-hidden">
            <div className="border-b border-slate-100 bg-slate-50 px-5 py-3">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">Workflow Status</h3>
            </div>
            <CardContent className="p-5">
              {grv.status === "DRAFT" ? (
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center border border-amber-200 bg-amber-50 text-amber-700">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-bold text-slate-800 text-lg">Draft</p>
                    <p className="text-xs text-slate-500">Pending confirmation</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center border border-emerald-200 bg-emerald-50 text-emerald-700">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-bold text-slate-800 text-lg">Posted</p>
                    <p className="text-xs text-slate-500">Updated inventory</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-[18px] border-slate-200 shadow-sm overflow-hidden">
            <div className="border-b border-slate-100 bg-slate-50 px-5 py-3">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">Financial Summary</h3>
            </div>
            <CardContent className="p-5 space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">Subtotal:</span>
                <span className="font-semibold text-slate-800">
                  {currency} {(() => {
                    const lines = grv.status === "DRAFT" && editableLines.length > 0 ? editableLines : grv.lines;
                    return lines.reduce((sum: number, line: any) => sum + (Number(line.quantity || 0) * Number(line.unitCost || 0)), 0).toFixed(2);
                  })()}
                </span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">Total VAT / Tax:</span>
                <span className="font-semibold text-slate-800">
                  {currency} {(() => {
                    const lines = grv.status === "DRAFT" && editableLines.length > 0 ? editableLines : grv.lines;
                    return lines.reduce((sum: number, line: any) => sum + Number(line.taxAmount || 0), 0).toFixed(2);
                  })()}
                </span>
              </div>
              <div className="h-px bg-slate-100 my-2" />
              <div className="flex justify-between items-end">
                <span className="text-base font-bold text-slate-800">Total Value:</span>
                <span className="text-2xl font-black text-blue-600">
                  {currency} {(() => {
                    const lines = grv.status === "DRAFT" && editableLines.length > 0 ? editableLines : grv.lines;
                    const subtotal = lines.reduce((sum: number, line: any) => sum + (Number(line.quantity || 0) * Number(line.unitCost || 0)), 0);
                    const tax = lines.reduce((sum: number, line: any) => sum + Number(line.taxAmount || 0), 0);
                    return (taxInclusive ? subtotal : subtotal + tax).toFixed(2);
                  })()}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[18px] border-slate-200 shadow-sm overflow-hidden">
            <div className="border-b border-slate-100 bg-slate-50 px-5 py-3">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">Quick Actions</h3>
            </div>
            <CardContent className="p-4 space-y-2 flex flex-col">
              {grv.status === "DRAFT" && (
                <Button 
                  onClick={handleConfirm}
                  disabled={confirmGdn.isPending}
                  className="w-full rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold h-11"
                >
                  {confirmGdn.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                  Confirm & Post Stock
                </Button>
              )}
              {grv.status !== "DRAFT" && (
                <Link href={`/supplier-invoices/new?grvId=${grv.id}`}>
                  <Button className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-11">
                    <FileText className="w-4 h-4 mr-2" />
                    Create Supplier Invoice
                  </Button>
                </Link>
              )}

              <PDFDownloadLink
                document={<GrvPdfDocument grv={grv} company={company} />}
                fileName={`${grv.grvNumber || "GRV"}.pdf`}
              >
                {({ loading }) => (
                  <Button
                    variant="outline"
                    className="w-full rounded-xl font-bold h-11"
                    disabled={loading}
                  >
                    {loading ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4 mr-2" />
                    )}
                    Download PDF
                  </Button>
                )}
              </PDFDownloadLink>
            </CardContent>
          </Card>

          {matchedReturns.length > 0 && (
            <Card className="rounded-[18px] border-slate-200 shadow-sm overflow-hidden mt-4">
              <div className="border-b border-slate-100 bg-slate-50 px-5 py-3">
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">Linked Returns / Reversals</h3>
              </div>
              <CardContent className="p-4 space-y-3">
                {matchedReturns.map((ret) => (
                  <div key={ret.id} className="flex justify-between items-center text-xs">
                    <span
                      className="text-blue-600 hover:underline cursor-pointer font-semibold"
                      onClick={() => setLocation(`/inventory/purchase-returns/${ret.id}`)}
                    >
                      {ret.returnNumber}
                    </span>
                    <Badge className={cn(
                      "font-bold text-[9px] border-none",
                      ret.status === "COMPLETED" ? "bg-emerald-100 text-emerald-800" :
                      ret.status === "SHIPPED" ? "bg-indigo-100 text-indigo-800" : "bg-slate-100 text-slate-600"
                    )}>
                      {ret.status}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
      <Dialog open={isAccountModalOpen} onOpenChange={setIsAccountModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Select GL Account</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-2 max-h-96 overflow-y-auto">
            {(accounts || []).filter((a: any) => a.type === "EXPENSE" || a.type === "COST_OF_SALES").map((acc: any) => (
              <div 
                key={acc.code} 
                className="flex flex-col p-3 rounded-lg border border-slate-100 hover:border-blue-200 hover:bg-blue-50 cursor-pointer"
                onClick={() => handleAccountSelect(acc.code, acc.name)}
              >
                <span className="font-bold text-slate-800">{acc.name}</span>
                <span className="font-mono text-xs text-slate-500">{acc.code} - {acc.type}</span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
