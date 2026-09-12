import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useActiveCompany } from "@/hooks/use-active-company";
import { usePurchaseOrders } from "@/hooks/use-purchase-orders";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { type Account, type Supplier } from "@shared/schema";
import { useCurrencies } from "@/hooks/use-currencies";
import { useProducts } from "@/hooks/use-products";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Save, FileText, Plus, Trash2, Check, ChevronsUpDown } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { QuantityInput } from "@/components/ui/quantity-input";
import { ProductCombobox } from "@/components/ui/product-combobox";

type InvoiceLine = {
  isFreetext?: boolean;
  productId: string;
  description?: string;
  accountCode?: string;
  quantity: string;
  unitCost: string;
  taxTypeId?: string;
  taxRate?: string;
  taxAmount?: string;
  isRecoverable?: boolean;
  notes: string;
};

export default function SupplierInvoiceFormPage() {
  const [, setLocation] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const defaultType = window.location.pathname.startsWith("/supplier-credit-notes") ? "CreditNote" : (searchParams.get("type") || "Invoice");
  const defaultRefId = searchParams.get("referenceId") || "";

  const { activeCompany, activeCompanyId, isLoading: isCompanyLoading } = useActiveCompany();
  const companyId = activeCompanyId || 0;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [supplierId, setSupplierId] = useState("");
  const [transactionType, setTransactionType] = useState(defaultType);
  const [referenceInvoiceId, setReferenceInvoiceId] = useState(defaultRefId);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [date, setDate] = useState(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  });
  const [dueDate, setDueDate] = useState("");
  const [purchaseOrderId, setPurchaseOrderId] = useState("");
  const [grvReference, setGrvReference] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [taxInclusive, setTaxInclusive] = useState(true);
  const [notes, setNotes] = useState("");
  
  const [lines, setLines] = useState<InvoiceLine[]>([
    { isFreetext: true, productId: "", description: "", accountCode: "", quantity: "1", unitCost: "0", taxTypeId: "", taxRate: "0", taxAmount: "0", isRecoverable: true, notes: "" },
  ]);
  const [openComboboxIndex, setOpenComboboxIndex] = useState<number | null>(null);

  const { data: currencies = [] } = useCurrencies(companyId);
  const { data: products = [] } = useProducts(companyId);

  useEffect(() => {
    if (!activeCompany) return;
    setTaxInclusive(activeCompany.vatEnabled ?? true);
    setCurrency(activeCompany.currency || "USD");
  }, [activeCompany]);

  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: [`/api/companies/${companyId}/suppliers`],
    enabled: !!companyId,
  });

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ["/api/accounting/accounts", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const res = await apiFetch(`/api/companies/${companyId}/accounting/accounts`);
      if (!res.ok) throw new Error("Failed to load accounts");
      return res.json();
    },
  });

  const { data: taxTypes = [] } = useQuery<any[]>({
    queryKey: ["/api/tax-types", companyId],
    queryFn: async () => {
      const res = await apiFetch(`/api/tax-types?companyId=${companyId}`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const expenseAccounts = accounts.filter(
    (account) => ["ASSET", "EXPENSE"].includes(account.type) && account.isActive,
  );

  const { data: purchaseOrders = [] } = usePurchaseOrders(companyId);
  const openPurchaseOrders = purchaseOrders.filter((order) => !["CANCELLED"].includes(order.status));

  // Pre-load from GRV if grvId is provided in URL query string
  const grvIdParam = searchParams.get("grvId") || "";
  const { data: grvDetail } = useQuery<any>({
    queryKey: ["grv", companyId, grvIdParam],
    enabled: !!companyId && !!grvIdParam,
    queryFn: async () => {
      const res = await apiFetch(`/api/companies/${companyId}/grvs/${encodeURIComponent(grvIdParam)}`);
      if (!res.ok) throw new Error("Failed to load GRV details");
      return res.json();
    }
  });

  useEffect(() => {
    if (grvDetail) {
      if (grvDetail.supplierId) {
        setSupplierId(String(grvDetail.supplierId));
      }
      setGrvReference(grvDetail.grvNumber || "");
      setReferenceInvoiceId(grvDetail.id ? String(grvDetail.id) : "");
      setNotes(`Supplier bill created from GRV ${grvDetail.grvNumber}`);
      setTaxInclusive(grvDetail.taxInclusive !== false);
      if (grvDetail.lines && grvDetail.lines.length > 0) {
        setLines(grvDetail.lines.map((line: any) => ({
          isFreetext: !line.productId,
          productId: line.productId ? String(line.productId) : "",
          description: line.productName || line.description || "",
          accountCode: line.accountCode || "",
          quantity: String(line.quantity || 1),
          unitCost: String(line.unitCost || 0),
          taxTypeId: line.taxTypeId ? String(line.taxTypeId) : "",
          taxRate: String(line.taxRate || 0),
          taxAmount: String(line.taxAmount || 0),
          isRecoverable: line.isRecoverable !== false,
          notes: line.notes || ""
        })));
      }
    }
  }, [grvDetail]);

  const applyPurchaseOrder = (poId: string) => {
    setPurchaseOrderId(poId);
    const order = openPurchaseOrders.find((po) => String(po.id) === poId);
    if (order) {
      setSupplierId(String(order.supplierId));
      setCurrency((order as any).currency || "USD");
      setNotes(`Supplier bill against PO ${order.poNumber}`);
      if (order.items && order.items.length > 0) {
        setLines(order.items.map((item: any) => ({
          isFreetext: !item.productId,
          productId: item.productId ? String(item.productId) : "",
          description: item.description || "",
          accountCode: item.accountCode || "",
          quantity: String(item.quantity || 1),
          unitCost: String(item.unitCost || 0),
          taxTypeId: item.taxTypeId ? String(item.taxTypeId) : "",
          taxRate: String(item.taxRate || 0),
          taxAmount: String(item.taxAmount || 0),
          isRecoverable: item.isRecoverable !== false,
          notes: item.notes || ""
        })));
      }
    }
  };

  const addLine = () =>
    setLines((prev) => [...prev, { isFreetext: true, productId: "", description: "", accountCode: "", quantity: "1", unitCost: "0", taxTypeId: "", taxRate: "0", taxAmount: "0", isRecoverable: true, notes: "" }]);
  const removeLine = (index: number) =>
    setLines((prev) => prev.filter((_, i) => i !== index));
  const updateLine = (index: number, patch: Partial<InvoiceLine>) =>
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));

  const subtotal = lines.reduce(
    (sum, line) => sum + Number(line.quantity || 0) * Number(line.unitCost || 0),
    0,
  );
  
  const totalTax = lines.reduce(
    (sum, line) => sum + Number(line.taxAmount || 0),
    0
  );
  
  const total = taxInclusive ? subtotal : subtotal + totalTax;

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("No company selected");
      if (!supplierId) throw new Error("Select a supplier");
      if (!invoiceNumber.trim()) throw new Error("Enter the supplier invoice number");
      if (total <= 0) throw new Error("Total amount must be greater than zero");

      const items = lines
        .filter((line) => (line.productId || (line.isFreetext && line.description)) && Number(line.quantity) > 0)
        .map((line) => ({
          productId: line.isFreetext ? null : Number(line.productId),
          description: line.isFreetext ? line.description : null,
          accountCode: line.isFreetext ? line.accountCode : null,
          quantity: Number(line.quantity),
          unitCost: Number(line.unitCost || 0),
          totalPrice: (Number(line.quantity) * Number(line.unitCost)).toFixed(2),
          taxTypeId: line.taxTypeId ? Number(line.taxTypeId) : null,
          taxRate: Number(line.taxRate || 0).toFixed(2),
          taxAmount: Number(line.taxAmount || 0).toFixed(2),
          isRecoverable: line.isRecoverable !== false,
        }));

      if (items.length === 0) throw new Error("Please add at least one valid line item");

      const res = await apiFetch(`/api/companies/${companyId}/supplier-invoices`, {
        method: "POST",
        body: JSON.stringify({
          supplierId: Number(supplierId),
          invoiceNumber: invoiceNumber.trim(),
          date: new Date(date).toISOString(),
          dueDate: dueDate ? new Date(dueDate).toISOString() : null,
          totalAmount: total.toFixed(2),
          subtotalAmount: (taxInclusive ? total - totalTax : subtotal).toFixed(2),
          taxAmount: totalTax.toFixed(2),
          taxInclusive,
          currency,
          purchaseOrderId: purchaseOrderId ? Number(purchaseOrderId) : undefined,
          transactionType,
          referenceInvoiceId: referenceInvoiceId ? Number(referenceInvoiceId) : null,
          grvReference: grvReference.trim() || undefined,
          notes: notes || undefined,
          status: "unpaid",
          items,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(err.message || (transactionType === "CreditNote" ? "Failed to create credit note" : "Failed to create supplier bill"));
      }
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${companyId}/supplier-invoices`] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/ledger"] });
      const isCN = transactionType === "CreditNote";
      toast({
        title: isCN ? "Supplier credit note created" : "Supplier bill created",
        description: isCN ? "The AP credit note has been registered." : "The payable and ledger entry were posted.",
      });
      if (data?.id) {
        setLocation(`/supplier-invoices/${data.id}`);
      } else {
        setLocation(isCN ? "/supplier-credit-notes" : "/supplier-invoices");
      }
    },
    onError: (error: any) => {
      toast({
        title: transactionType === "CreditNote" ? "Could not create credit note" : "Could not create bill",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const isCN = transactionType === "CreditNote";

  return (
    <Layout>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="outline" className="rounded-xl" onClick={() => setLocation(isCN ? "/supplier-credit-notes" : "/supplier-invoices")}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back
          </Button>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              {isCN ? "New Supplier Credit Note" : "New Supplier Bill"}
            </h1>
            <p className="text-sm text-slate-500">
              {isCN ? "Record a new credit note from a supplier" : "Record a new invoice or bill from a supplier"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="rounded-xl" onClick={() => setLocation(isCN ? "/supplier-credit-notes" : "/supplier-invoices")}>Cancel</Button>
          <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || isCompanyLoading} className="font-bold gap-2 rounded-xl bg-primary hover:bg-primary/90 text-white">
            {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {createMutation.isPending ? "Creating..." : (isCN ? "Create Credit Note" : "Create Bill")}
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        <Card className="rounded-[18px] border-slate-200 shadow-sm overflow-hidden">
          <CardHeader className="border-b border-slate-100 bg-slate-50 px-6 py-4 flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileText className="h-5 w-5 text-blue-600" /> Bill Details
            </CardTitle>
            <div className="flex items-center gap-2">
              <Label htmlFor="tax-inc" className="text-xs text-slate-500 cursor-pointer">Amounts include VAT</Label>
              <Switch
                id="tax-inc"
                checked={taxInclusive}
                onCheckedChange={(checked) => {
                  setTaxInclusive(checked);
                  const updated = lines.map(line => {
                    const rate = Number(line.taxRate || 0);
                    const baseAmt = Number(line.quantity || 0) * Number(line.unitCost || 0);
                    const taxAmt = checked ? baseAmt - (baseAmt / (1 + (rate / 100))) : baseAmt * (rate / 100);
                    return { ...line, taxAmount: String(taxAmt.toFixed(2)) };
                  });
                  setLines(updated);
                }}
              />
            </div>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="space-y-2">
                <Label>Supplier <span className="text-red-500">*</span></Label>
                <Select value={supplierId} onValueChange={setSupplierId} disabled={!!grvIdParam}>
                  <SelectTrigger className="h-11 bg-slate-50"><SelectValue placeholder="Select supplier" /></SelectTrigger>
                  <SelectContent>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Invoice Number <span className="text-red-500">*</span></Label>
                <Input className="h-11 bg-slate-50" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="Enter supplier invoice #" />
              </div>
              <div className="space-y-2">
                <Label>Bill Date <span className="text-red-500">*</span></Label>
                <Input className="h-11 bg-slate-50" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Due Date</Label>
                <Input className="h-11 bg-slate-50" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
              
              <div className="space-y-2">
                <Label>Purchase Order</Label>
                <Select value={purchaseOrderId} onValueChange={applyPurchaseOrder}>
                  <SelectTrigger className="h-11 bg-slate-50"><SelectValue placeholder="Optional PO link" /></SelectTrigger>
                  <SelectContent>
                    {openPurchaseOrders.map((order) => (
                      <SelectItem key={order.id} value={String(order.id)}>{order.poNumber} - {order.supplierName || "Supplier"}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>GRV Reference</Label>
                <Input className="h-11 bg-slate-50" value={grvReference} onChange={(e) => setGrvReference(e.target.value)} placeholder="Optional GRV no" />
              </div>
              <div className="space-y-2">
                <Label>Currency</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger className="h-11 bg-slate-50"><SelectValue placeholder="Select currency" /></SelectTrigger>
                  <SelectContent>
                    {currencies.map((c: any) => (
                      <SelectItem key={c.id || c.code} value={c.code}>{c.code} - {c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Transaction Type</Label>
                <Select value={transactionType} onValueChange={setTransactionType}>
                  <SelectTrigger className="h-11 bg-slate-50"><SelectValue placeholder="Invoice" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Invoice">Standard Bill</SelectItem>
                    <SelectItem value="DebitNote">Debit Note</SelectItem>
                    <SelectItem value="CreditNote">Credit Note</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="mt-6 space-y-2">
              <Label>Notes & Description</Label>
              <Textarea className="bg-slate-50" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What was this bill for?" rows={2} />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[18px] border-slate-200 shadow-sm overflow-hidden">
          <div className="border-b border-slate-100 bg-slate-50 px-6 py-4">
            <h3 className="font-bold text-slate-800">Line Items</h3>
          </div>
          <CardContent className="p-6">
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-100 overflow-hidden">
                <div className="grid grid-cols-12 gap-0 bg-slate-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <div className="col-span-4">Product / Expense</div>
                  <div className="col-span-1 text-right">Qty</div>
                  <div className="col-span-2 text-right">Unit Cost</div>
                  <div className="col-span-2 text-right">Tax</div>
                  <div className="col-span-2 text-right">Total</div>
                  <div className="col-span-1" />
                </div>

                <div className="space-y-0">
                  {lines.map((line, index) => (
                    <div key={index} className="grid grid-cols-12 gap-2 items-start border-t border-slate-50 px-3 py-3">
                      <div className="col-span-4 space-y-1">
                        {!line.isFreetext ? (
                          <ProductCombobox
                            value={line.productId}
                            products={products as any[]}
                            onChange={(value) => {
                              const product = (products as any[]).find((p) => String(p.id) === value);
                              const newCost = String(product?.costPrice || line.unitCost || "0");
                              const rate = Number(line.taxRate || 0);
                              const qty = Number(line.quantity || 0);
                              const cost = Number(newCost);
                              const baseAmt = qty * cost;
                              const taxAmt = taxInclusive ? baseAmt - (baseAmt / (1 + (rate / 100))) : baseAmt * (rate / 100);
                              updateLine(index, { productId: value, unitCost: newCost, taxAmount: String(taxAmt.toFixed(2)) });
                            }}
                          />
                        ) : (
                          <div className="flex gap-2">
                            <Input
                              placeholder="Description (e.g. Electricity)"
                              value={line.description}
                              onChange={(e) => updateLine(index, { description: e.target.value })}
                              className="h-9 flex-1"
                            />
                            <Popover open={openComboboxIndex === index} onOpenChange={(open) => setOpenComboboxIndex(open ? index : null)}>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="outline"
                                  role="combobox"
                                  className="h-9 w-[220px] justify-between font-normal"
                                >
                                  {line.accountCode
                                    ? (() => {
                                        const a = accounts.find((acc) => acc.code === line.accountCode);
                                        return a ? `${a.code} - ${a.name}` : line.accountCode;
                                      })()
                                    : "Select account..."}
                                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-[300px] p-0" align="start">
                                <Command>
                                  <CommandInput placeholder="Search account..." />
                                  <CommandList>
                                    <CommandEmpty>No account found.</CommandEmpty>
                                    <CommandGroup>
                                      <CommandItem
                                        value="__none__"
                                        onSelect={() => {
                                          updateLine(index, { accountCode: "", description: line.description });
                                          setOpenComboboxIndex(null);
                                        }}
                                      >
                                        <Check className={cn("mr-2 h-4 w-4", !line.accountCode ? "opacity-100" : "opacity-0")} />
                                        — None —
                                      </CommandItem>
                                      {expenseAccounts.map((account) => (
                                        <CommandItem
                                          key={account.id}
                                          value={`${account.code} ${account.name}`}
                                          onSelect={() => {
                                            const newDesc = line.description || account.name;
                                            updateLine(index, { accountCode: account.code, description: newDesc });
                                            setOpenComboboxIndex(null);
                                          }}
                                        >
                                          <Check
                                            className={cn(
                                              "mr-2 h-4 w-4",
                                              line.accountCode === account.code ? "opacity-100" : "opacity-0"
                                            )}
                                          />
                                          <div className="flex flex-col">
                                            <span>{account.name}</span>
                                            <span className="text-[10px] text-muted-foreground">{account.code}</span>
                                          </div>
                                        </CommandItem>
                                      ))}
                                    </CommandGroup>
                                  </CommandList>
                                </Command>
                              </PopoverContent>
                            </Popover>
                          </div>
                        )}
                        <div className="flex items-center gap-1 pt-1">
                          <input
                            type="checkbox"
                            id={`ft-${index}`}
                            checked={line.isFreetext}
                            onChange={(e) => updateLine(index, { isFreetext: e.target.checked, productId: "" })}
                            className="h-3 w-3 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <label htmlFor={`ft-${index}`} className="text-[10px] text-slate-500 cursor-pointer">
                            Non-inventory item / Expense
                          </label>
                        </div>
                      </div>
                      <div className="col-span-1">
                        <QuantityInput
                          type="number" min="0" value={line.quantity}
                          onChange={(e) => {
                            const qty = Number(e.target.value || 0);
                            const cost = Number(line.unitCost || 0);
                            const rate = Number(line.taxRate || 0);
                            const baseAmt = qty * cost;
                            const taxAmt = taxInclusive ? baseAmt - (baseAmt / (1 + (rate / 100))) : baseAmt * (rate / 100);
                            updateLine(index, { quantity: e.target.value, taxAmount: String(taxAmt.toFixed(2)) });
                          }}
                          className="h-9 text-right"
                        />
                      </div>
                      <div className="col-span-2">
                        <Input
                          type="number" min="0" step="0.01" value={line.unitCost}
                          onChange={(e) => {
                            const cost = Number(e.target.value || 0);
                            const qty = Number(line.quantity || 0);
                            const rate = Number(line.taxRate || 0);
                            const baseAmt = qty * cost;
                            const taxAmt = taxInclusive ? baseAmt - (baseAmt / (1 + (rate / 100))) : baseAmt * (rate / 100);
                            updateLine(index, { unitCost: e.target.value, taxAmount: String(taxAmt.toFixed(2)) });
                          }}
                          className="h-9 text-right"
                        />
                      </div>
                      <div className="col-span-2 space-y-1">
                        <Select
                          value={line.taxTypeId || ""}
                          onValueChange={(val) => {
                            const t = taxTypes.find((x) => String(x.id) === val);
                            if (t) {
                              const rate = Number(t.rate);
                              const qty = Number(line.quantity || 0);
                              const cost = Number(line.unitCost || 0);
                              const baseAmt = qty * cost;
                              const taxAmt = taxInclusive ? baseAmt - (baseAmt / (1 + (rate / 100))) : baseAmt * (rate / 100);
                              updateLine(index, { taxTypeId: val, taxRate: String(rate), taxAmount: String(taxAmt.toFixed(2)) });
                            } else if (val === "none") {
                              updateLine(index, { taxTypeId: "", taxRate: "0", taxAmount: "0" });
                            }
                          }}
                        >
                          <SelectTrigger className="h-9 bg-white">
                            <SelectValue placeholder="No Tax" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No Tax</SelectItem>
                            {taxTypes.map((t) => (
                              <SelectItem key={t.id} value={String(t.id)}>
                                {t.name} ({Number(t.rate)}%)
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {Number(line.taxRate) > 0 && (
                          <div className="flex items-center gap-1 justify-end pt-1 pr-1">
                            <label htmlFor={`rec-${index}`} className="text-[9px] text-slate-500 uppercase cursor-pointer">
                              Recoverable
                            </label>
                            <input
                              type="checkbox"
                              id={`rec-${index}`}
                              checked={line.isRecoverable !== false}
                              onChange={(e) => updateLine(index, { isRecoverable: e.target.checked })}
                              className="h-3 w-3 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                          </div>
                        )}
                      </div>
                      <div className="col-span-2 text-right font-mono text-slate-700 py-1.5">
                        {((Number(line.quantity || 0) * Number(line.unitCost || 0)) + (taxInclusive ? 0 : Number(line.taxAmount || 0))).toFixed(2)}
                      </div>
                      <div className="col-span-1 text-right">
                        <Button
                          variant="ghost" size="icon"
                          onClick={() => removeLine(index)}
                          disabled={lines.length === 1}
                          className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="bg-slate-50 border-t border-slate-100 p-4">
                  <div className="flex justify-between items-center">
                    <Button variant="outline" onClick={addLine} size="sm" className="rounded-xl bg-white border-dashed">
                      <Plus className="w-4 h-4 mr-2" />
                      Add Line
                    </Button>
                    <div className="w-64 space-y-2">
                      <div className="flex justify-between text-sm text-slate-500">
                        <span>Subtotal {taxInclusive && "(Inc. VAT)"}</span>
                        <span className="font-mono">{subtotal.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm text-slate-500">
                        <span>VAT</span>
                        <span className="font-mono">{totalTax.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between font-bold text-slate-900 text-lg pt-2 border-t border-slate-200">
                        <span>Total</span>
                        <span className="font-mono">{total.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
