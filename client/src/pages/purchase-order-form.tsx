import { Layout } from "@/components/layout";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { useActiveCompany } from "@/hooks/use-active-company";
import { useBranches } from "@/hooks/use-branches";
import { useProducts } from "@/hooks/use-products";
import {
  useCreatePurchaseOrder,
  useUpdatePurchaseOrder,
  usePurchaseOrders,
  type PurchaseOrder,
} from "@/hooks/use-purchase-orders";
import { useSuppliers } from "@/hooks/use-suppliers";
import { useCurrencies } from "@/hooks/use-currencies";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ArrowLeft, Loader2, Plus, Save, Send, Trash2, Check, ChevronsUpDown } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { type Account } from "@shared/schema";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { QuantityInput } from "@/components/ui/quantity-input";
import { ProductCombobox } from "@/components/ui/product-combobox";

type DraftLine = {
  isFreetext?: boolean;
  productId: string;
  segmentId?: string;
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

export default function PurchaseOrderFormPage({
  id,
}: {
  id?: string;
}) {
  const [, setLocation] = useLocation();
  const { activeCompanyId, activeCompany } = useActiveCompany();
  const companyId = activeCompanyId || 0;
  
  const mode = id ? "edit" : "create";
  
  const { data: orders = [], isLoading: loadingData } = usePurchaseOrders(companyId);
  const initialData = id ? orders.find((o) => String(o.id) === id) : null;
  const { data: suppliers = [] } = useSuppliers(companyId);
  const { data: products = [] } = useProducts(companyId);
  const { data: branches = [] } = useBranches(companyId);
  
  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ["/api/accounting/accounts", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const res = await apiFetch(`/api/companies/${companyId}/accounting/accounts`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: currencies = [] } = useCurrencies(companyId);
  const { data: taxTypes = [] } = useQuery<any[]>({
    queryKey: ["/api/tax-types", companyId],
    queryFn: async () => {
      const res = await apiFetch(`/api/tax-types?companyId=${companyId}`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: segments } = useQuery<any[]>({
    queryKey: ["/api/accounting/segments", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const res = await apiFetch(`/api/companies/${companyId}/accounting/segments`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { mutate: createOrder, isPending: creating } = useCreatePurchaseOrder(companyId);
  const { mutate: updateOrder, isPending: updating } = useUpdatePurchaseOrder(companyId);
  const { toast } = useToast();

  const [supplierId, setSupplierId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [currencyCode, setCurrencyCode] = useState("USD");
  const [expectedDate, setExpectedDate] = useState("");
  const [shipTo, setShipTo] = useState("");
  const [notes, setNotes] = useState("");
  const [taxInclusive, setTaxInclusive] = useState(false);
  const [lines, setLines] = useState<DraftLine[]>([
    { isFreetext: false, productId: "", segmentId: "none", description: "", accountCode: "", quantity: "1", unitCost: "0", taxTypeId: "", taxRate: "0", taxAmount: "0", isRecoverable: true, notes: "" },
  ]);
  const [openComboboxIndex, setOpenComboboxIndex] = useState<number | null>(null);

  useEffect(() => {
    if (mode === "create" && activeCompany) {
      if (!shipTo) {
        const addressParts = [
          activeCompany.name,
          activeCompany.address,
          activeCompany.city
        ].filter(Boolean);
        setShipTo(addressParts.join("\n"));
      }
      setCurrencyCode(activeCompany.currency || "USD");
    }
  }, [mode, activeCompany, shipTo]);

  useEffect(() => {
    if (mode === "edit" && initialData) {
      setSupplierId(String(initialData.supplierId));
      setBranchId(initialData.branchId ? String(initialData.branchId) : "");
      setPoNumber(initialData.poNumber);
      setCurrencyCode(initialData.currency || "USD");
      setExpectedDate(
        initialData.expectedDate
          ? format(new Date(initialData.expectedDate), "yyyy-MM-dd")
          : "",
      );
      setShipTo(initialData.shipTo || "");
      setNotes(initialData.notes || "");
      setLines(
        initialData.items.length > 0
          ? initialData.items.map((item: any) => ({
              isFreetext: !item.productId,
              productId: item.productId ? String(item.productId) : "",
              segmentId: item.segmentId ? String(item.segmentId) : "none",
              description: item.description || "",
              accountCode: item.accountCode || "",
              quantity: String(item.quantity),
              unitCost: String(item.unitCost),
              taxTypeId: item.taxTypeId ? String(item.taxTypeId) : "",
              taxRate: String(item.taxRate || 0),
              taxAmount: String(item.taxAmount || 0),
              isRecoverable: item.isRecoverable !== false,
              notes: item.notes || "",
            }))
          : [{ isFreetext: false, productId: "", segmentId: "none", description: "", accountCode: "", quantity: "1", unitCost: "0", taxTypeId: "", taxRate: "0", taxAmount: "0", isRecoverable: true, notes: "" }],
      );
      if ((initialData as any).taxInclusive) setTaxInclusive(true);
    }
  }, [mode, initialData]);

  const subtotal = lines.reduce(
    (sum, line) => sum + Number(line.quantity || 0) * Number(line.unitCost || 0),
    0,
  );
  
  const totalTax = lines.reduce(
    (sum, line) => sum + Number(line.taxAmount || 0),
    0
  );
  
  const total = taxInclusive ? subtotal : subtotal + totalTax;

  const addLine = () =>
    setLines((prev) => [...prev, { isFreetext: false, productId: "", segmentId: "none", description: "", accountCode: "", quantity: "1", unitCost: "0", taxTypeId: "", taxRate: "0", taxAmount: "0", isRecoverable: true, notes: "" }]);
  const removeLine = (index: number) =>
    setLines((prev) => prev.filter((_, i) => i !== index));
  const updateLine = (index: number, patch: Partial<DraftLine>) =>
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));

  const submit = () => {
    const items = lines
      .filter((line) => (line.productId || (line.isFreetext && line.description)) && Number(line.quantity) > 0)
      .map((line) => ({
        productId: line.isFreetext ? null : Number(line.productId),
        segmentId: line.segmentId && line.segmentId !== "none" ? Number(line.segmentId) : undefined,
        description: line.isFreetext ? line.description : null,
        accountCode: line.isFreetext ? line.accountCode : null,
        quantity: Number(line.quantity),
        unitCost: Number(line.unitCost || 0),
        taxTypeId: line.taxTypeId ? Number(line.taxTypeId) : null,
        taxRate: Number(line.taxRate || 0),
        taxAmount: Number(line.taxAmount || 0),
        isRecoverable: line.isRecoverable !== false,
        notes: line.notes || null,
      }));

    if (!supplierId || items.length === 0) {
      toast({ title: "Missing details", description: "Select a supplier and ensure lines are filled correctly.", variant: "destructive" });
      return;
    }

    if (mode === "create") {
      createOrder(
        { supplierId: Number(supplierId), branchId: branchId ? Number(branchId) : null, poNumber: poNumber || undefined, expectedDate: expectedDate || null, shipTo: shipTo || null, notes: notes || null, currency: currencyCode, taxInclusive, items },
        {
          onSuccess: (data: any) => {
            toast({ title: "Purchase order created", description: "The PO has been created successfully." });
            if (data?.po && data.po.id) {
               setLocation(`/inventory/purchase-orders/${data.po.id}`);
            } else {
               setLocation("/inventory/purchase-orders");
            }
          },
          onError: (error: any) => toast({ title: "Could not create PO", description: error.message, variant: "destructive" }),
        },
      );
    } else if (mode === "edit" && initialData) {
      updateOrder(
        {
          id: initialData.id,
          data: { supplierId: Number(supplierId), branchId: branchId ? Number(branchId) : null, expectedDate: expectedDate || null, shipTo: shipTo || null, notes: notes || null, currency: currencyCode, taxInclusive, items },
        },
        {
          onSuccess: () => {
            toast({ title: "Purchase order updated", description: `${initialData.poNumber} has been saved.` });
            setLocation(`/inventory/purchase-orders/${initialData.id}`);
          },
          onError: (error: any) => toast({ title: "Could not update PO", description: error.message, variant: "destructive" }),
        },
      );
    }
  };

  const isPending = creating || updating;

  if (mode === "edit" && loadingData) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20 text-slate-500">
          <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading Order...
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            className="rounded-xl"
            onClick={() => {
               if (mode === "edit" && id) setLocation(`/inventory/purchase-orders/${id}`);
               else setLocation("/inventory/purchase-orders");
            }}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              {mode === "create" ? "New Purchase Order" : `Edit PO: ${initialData?.poNumber}`}
            </h1>
            <p className="text-sm text-slate-500">
              {mode === "create" ? "Create a new supplier purchase order" : "Modify existing purchase order details"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="rounded-xl" onClick={() => {
               if (mode === "edit" && id) setLocation(`/inventory/purchase-orders/${id}`);
               else setLocation("/inventory/purchase-orders");
          }}>Cancel</Button>
          <Button onClick={submit} disabled={isPending} className="font-bold gap-2 rounded-xl">
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : (mode === "create" ? <Send className="h-4 w-4" /> : <Save className="h-4 w-4" />)}
            {mode === "create" ? "Create PO" : "Save Changes"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 space-y-6">
          <Card className="rounded-[18px] border-slate-200 shadow-sm overflow-hidden">
            <div className="border-b border-slate-100 bg-slate-50 px-6 py-4">
              <h3 className="font-bold text-slate-800">Order Lines</h3>
            </div>
            <CardContent className="p-6">
              <div className="space-y-4">
                <div className="rounded-xl border border-slate-100 overflow-hidden">
                  <div className="grid grid-cols-12 gap-0 bg-slate-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                    <div className="col-span-3">Product</div>
                    <div className="col-span-2">Segment</div>
                    <div className="col-span-1 text-right">Qty</div>
                    <div className="col-span-2 text-right">Unit Cost</div>
                    <div className="col-span-2 text-right">Tax</div>
                    <div className="col-span-1 text-right">Total</div>
                    <div className="col-span-1" />
                  </div>

                  <div className="space-y-0">
                    {lines.map((line, index) => (
                      <div key={index} className="grid grid-cols-12 gap-2 items-start border-t border-slate-50 px-3 py-3">
                        <div className="col-span-3 space-y-1">
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
                              className="w-[200px]"
                            />
                          ) : (
                            <div className="flex gap-2">
                              <Input
                                placeholder="Description (e.g. Office Supplies)"
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
                                        {accounts
                                          .filter((a) => ["ASSET", "EXPENSE"].includes(a.type) && a.isActive)
                                          .map((account) => (
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
                        <div className="col-span-2">
                          <Select
                            value={line.segmentId || "none"}
                            onValueChange={(val) => updateLine(index, { segmentId: val })}
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue placeholder="Segment" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">None</SelectItem>
                              {segments?.map((seg) => (
                                <SelectItem key={seg.id} value={String(seg.id)}>
                                  {seg.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="col-span-1">
                          <QuantityInput
                            type="number" min="0" value={line.quantity}
                            onChange={(e) => {
                              const qty = Number(e.target.value || 0);
                              const cost = Number(line.unitCost || 0);
                              const rate = Number(line.taxRate || 0);
                              const baseAmt = qty * cost;
                              let taxAmt = 0;
                              if (taxInclusive) {
                                taxAmt = baseAmt - (baseAmt / (1 + (rate / 100)));
                              } else {
                                taxAmt = baseAmt * (rate / 100);
                              }
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
                              let taxAmt = 0;
                              if (taxInclusive) {
                                taxAmt = baseAmt - (baseAmt / (1 + (rate / 100)));
                              } else {
                                taxAmt = baseAmt * (rate / 100);
                              }
                              updateLine(index, { unitCost: e.target.value, taxAmount: String(taxAmt.toFixed(2)) });
                            }}
                            className="h-9 text-right"
                          />
                        </div>
                        <div className="col-span-2 space-y-1">
                          <Select
                            value={line.taxTypeId || ""}
                            onValueChange={(val) => {
                              const tax = taxTypes.find((t: any) => String(t.id) === val);
                              const rate = tax ? Number(tax.rate) : 0;
                              const qty = Number(line.quantity || 0);
                              const cost = Number(line.unitCost || 0);
                              const baseAmt = qty * cost;
                              let taxAmt = 0;
                              if (taxInclusive) {
                                taxAmt = baseAmt - (baseAmt / (1 + (rate / 100)));
                              } else {
                                taxAmt = baseAmt * (rate / 100);
                              }
                              updateLine(index, { 
                                taxTypeId: val, 
                                taxRate: String(rate), 
                                taxAmount: String(taxAmt.toFixed(2)),
                                isRecoverable: true // Default recoverable when applying new tax
                              });
                            }}
                          >
                            <SelectTrigger className="h-9"><SelectValue placeholder="Tax" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">No Tax (0%)</SelectItem>
                              {taxTypes.map((t: any) => (
                                <SelectItem key={t.id} value={String(t.id)}>{t.name} ({t.rate}%)</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          
                          {line.taxTypeId && line.taxTypeId !== "__none__" && (
                            <div className="flex items-center gap-1">
                              <input 
                                type="checkbox" 
                                id={`recov-${index}`} 
                                checked={line.isRecoverable} 
                                onChange={(e) => updateLine(index, { isRecoverable: e.target.checked })}
                                className="h-3 w-3 rounded text-blue-600 focus:ring-blue-500 border-gray-300"
                              />
                              <label htmlFor={`recov-${index}`} className="text-[10px] text-slate-500 cursor-pointer">Recoverable</label>
                            </div>
                          )}
                        </div>
                        <div className="col-span-1 text-right text-base font-bold text-slate-800 flex flex-col justify-center h-9">
                          <div>
                            {currencyCode} {taxInclusive ? 
                              (Number(line.quantity || 0) * Number(line.unitCost || 0)).toFixed(2) : 
                              (Number(line.quantity || 0) * Number(line.unitCost || 0) + Number(line.taxAmount || 0)).toFixed(2)}
                          </div>
                          {Number(line.taxAmount || 0) > 0 && (
                            <div className="text-[10px] text-slate-400 font-normal">
                              incl. tax {Number(line.taxAmount || 0).toFixed(2)}
                            </div>
                          )}
                        </div>
                        <div className="col-span-1 flex justify-end h-9 items-center">
                          <Button
                            type="button" variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-500 hover:bg-red-50"
                            disabled={lines.length === 1}
                            onClick={() => removeLine(index)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <Button type="button" variant="outline" size="sm" onClick={addLine} className="rounded-xl font-bold gap-1 mt-2">
                  <Plus className="h-4 w-4" />Add Line
                </Button>
                
                <div className="pt-6 mt-6 border-t border-slate-100 flex justify-end">
                  <div className="text-right min-w-[250px]">
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-slate-500">Subtotal:</span>
                      <span className="font-bold">{currencyCode} {subtotal.toFixed(2)}</span>
                    </div>
                    {totalTax > 0 && (
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-slate-500">Total Tax:</span>
                        <span className="font-bold">{currencyCode} {totalTax.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center pt-2 border-t border-slate-100 mt-2">
                      <p className="text-sm font-semibold text-slate-800">Total Amount</p>
                      <p className="text-3xl font-black text-blue-600">{currencyCode} {total.toFixed(2)}</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="rounded-[18px] border-slate-200 shadow-sm overflow-hidden">
            <div className="border-b border-slate-100 bg-slate-50 px-6 py-4">
              <h3 className="font-bold text-slate-800">Notes & Instructions</h3>
            </div>
            <CardContent className="p-6">
              <Textarea 
                value={notes} 
                onChange={(e) => setNotes(e.target.value)} 
                placeholder="Delivery instructions, payment terms, etc." 
                className="min-h-[120px]"
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="rounded-[18px] border-slate-200 shadow-sm overflow-hidden">
            <div className="border-b border-slate-100 bg-slate-50 px-6 py-4">
              <h3 className="font-bold text-slate-800">Order Details</h3>
            </div>
            <CardContent className="p-6 space-y-4">
              <div className="space-y-2">
                <Label>Supplier <span className="text-red-500">*</span></Label>
                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="Select supplier" /></SelectTrigger>
                  <SelectContent>
                    {(suppliers as any[]).map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Currency <span className="text-red-500">*</span></Label>
                <Select value={currencyCode} onValueChange={setCurrencyCode}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="Select currency" /></SelectTrigger>
                  <SelectContent>
                    {currencies.length > 0 ? (
                      (currencies as any[]).map((c) => (
                        <SelectItem key={c.id || c.code} value={c.code}>{c.code} - {c.name}</SelectItem>
                      ))
                    ) : (
                      <>
                        <SelectItem value="USD">USD - US Dollar</SelectItem>
                        <SelectItem value="ZWL">ZWL - Zimbabwe Dollar</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label>Tax Setting</Label>
                <div className="flex items-center space-x-2 pt-2">
                  <Switch id="tax-inclusive" checked={taxInclusive} onCheckedChange={(val) => {
                    setTaxInclusive(val);
                    // Recalculate taxes for all lines
                    const newLines = lines.map(line => {
                      const qty = Number(line.quantity || 0);
                      const cost = Number(line.unitCost || 0);
                      const rate = Number(line.taxRate || 0);
                      const baseAmt = qty * cost;
                      let taxAmt = 0;
                      if (val) {
                        taxAmt = baseAmt - (baseAmt / (1 + (rate / 100)));
                      } else {
                        taxAmt = baseAmt * (rate / 100);
                      }
                      return { ...line, taxAmount: String(taxAmt.toFixed(2)) };
                    });
                    setLines(newLines);
                  }} />
                  <Label htmlFor="tax-inclusive" className="cursor-pointer">{taxInclusive ? "Amounts are Tax Inclusive" : "Amounts are Tax Exclusive"}</Label>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Branch (Optional)</Label>
                <Select
                  value={branchId || "__none__"}
                  onValueChange={(v) => setBranchId(v === "__none__" ? "" : v)}
                >
                  <SelectTrigger className="h-10"><SelectValue placeholder="Select branch" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— None —</SelectItem>
                    {(branches as any[]).map((b) => (
                      <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {mode === "create" && (
                <div className="space-y-2">
                  <Label>PO Number</Label>
                  <Input className="h-10" value={poNumber} onChange={(e) => setPoNumber(e.target.value)} placeholder="Auto if blank" />
                </div>
              )}
              
              <div className="space-y-2">
                <Label>Expected Delivery</Label>
                <Input className="h-10" type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
              </div>
              
              <div className="space-y-2">
                <Label>Ship To / Delivery Address</Label>
                <Textarea 
                  value={shipTo} 
                  onChange={(e) => setShipTo(e.target.value)} 
                  placeholder="Defaults to company address if left blank" 
                  className="min-h-[80px]"
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
