import React, { useState } from "react";
import { Layout } from "@/components/layout";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus, Trash2, PackagePlus, Receipt, Truck } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { QuantityInput } from "@/components/ui/quantity-input";
import { ProductCombobox } from "@/components/ui/product-combobox";

export default function CreateGrv() {
  const { activeCompanyId } = useActiveCompany();
  const companyId = activeCompanyId || 0;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [sourceType, setSourceType] = useState<"supplier" | "customer">("supplier");
  const [supplierId, setSupplierId] = useState<string>("");
  const [customerId, setCustomerId] = useState<string>("");
  const [gdnNumber, setGdnNumber] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  const [taxInclusive, setTaxInclusive] = useState(false);
  const [lines, setLines] = useState<any[]>([
    { type: "stock", productId: "", accountCode: "", description: "", quantity: 1, unitCost: 0, taxTypeId: null, taxRate: 0, taxAmount: 0, isRecoverable: true, serialNumbers: [] }
  ]);

  const { data: taxTypes = [] } = useQuery({
    queryKey: [`/api/tax-types?companyId=${companyId}`],
    enabled: !!companyId,
  });

  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [activeLineIndex, setActiveLineIndex] = useState<number | null>(null);

  const [activeSerialLineIndex, setActiveSerialLineIndex] = useState<number | null>(null);
  const [isSerialModalOpen, setIsSerialModalOpen] = useState(false);
  const [tempSerials, setTempSerials] = useState<string>("");

  const [activeBatchLineIndex, setActiveBatchLineIndex] = useState<number | null>(null);
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [tempBatchInfo, setTempBatchInfo] = useState({ batchNumber: "", manufacturingDate: "", expiryDate: "" });

  const { data: suppliers = [] } = useQuery<any[]>({
    queryKey: [`/api/companies/${companyId}/suppliers`],
    enabled: !!companyId,
  });

  const { data: customers = [] } = useQuery<any[]>({
    queryKey: [`/api/companies/${companyId}/customers`],
    enabled: !!companyId,
  });

  const { data: products = [] } = useQuery<any[]>({
    queryKey: [`/api/companies/${companyId}/products`],
    enabled: !!companyId,
  });

  const { data: accounts = [] } = useQuery<any[]>({
    queryKey: [`/api/accounting/accounts`, companyId],
    enabled: !!companyId,
  });

  const createGdn = useMutation({
    mutationFn: async (payload: any) => {
      const res = await apiRequest("POST", `/api/companies/${companyId}/gdns`, payload);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Draft GRV Created", description: "You can now review and post it to stock." });
      queryClient.invalidateQueries({ queryKey: ["gdns", companyId, "DRAFT"] });
      queryClient.invalidateQueries({ queryKey: ["grvs", companyId] });
      setLocation("/inventory/account");
    },
    onError: (err: any) => {
      toast({ title: "Failed to create GRV", description: err.message, variant: "destructive" });
    }
  });

  const handleLineChange = (index: number, field: string, value: any) => {
    const updated = [...lines];
    updated[index] = { ...updated[index], [field]: value };
    setLines(updated);
  };

  const addLine = (type: "stock" | "expense") => {
    setLines([...lines, { type, productId: "", accountCode: "", description: "", quantity: 1, unitCost: 0, taxTypeId: null, taxRate: 0, taxAmount: 0, isRecoverable: true, serialNumbers: [] }]);
  };

  const removeLine = (index: number) => {
    if (lines.length === 1) return;
    const updated = [...lines];
    updated.splice(index, 1);
    setLines(updated);
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

  const openSerialModal = (index: number) => {
    setActiveSerialLineIndex(index);
    setTempSerials((lines[index].serialNumbers || []).join("\n"));
    setIsSerialModalOpen(true);
  };

  const saveSerials = () => {
    if (activeSerialLineIndex !== null) {
      const qty = lines[activeSerialLineIndex].quantity;
      const serials = tempSerials.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
      if (serials.length > 0 && serials.length !== qty) {
        toast({ title: "Quantity Mismatch", description: `You entered ${serials.length} serials for a quantity of ${qty}.`, variant: "destructive" });
        return;
      }
      handleLineChange(activeSerialLineIndex, "serialNumbers", serials);
    }
    setIsSerialModalOpen(false);
  };

  const openBatchModal = (index: number) => {
    setActiveBatchLineIndex(index);
    setTempBatchInfo({
      batchNumber: lines[index].batchNumber || "",
      manufacturingDate: lines[index].manufacturingDate || "",
      expiryDate: lines[index].expiryDate || new Date().toISOString().split("T")[0]
    });
    setIsBatchModalOpen(true);
  };

  const saveBatchInfo = () => {
    if (activeBatchLineIndex !== null) {
      if (!tempBatchInfo.batchNumber || !tempBatchInfo.expiryDate) {
        toast({ title: "Missing Information", description: "Batch Number and Expiry Date are required.", variant: "destructive" });
        return;
      }
      handleLineChange(activeBatchLineIndex, "batchNumber", tempBatchInfo.batchNumber);
      handleLineChange(activeBatchLineIndex, "manufacturingDate", tempBatchInfo.manufacturingDate);
      handleLineChange(activeBatchLineIndex, "expiryDate", tempBatchInfo.expiryDate);
    }
    setIsBatchModalOpen(false);
  };

  const subtotal = lines.reduce((sum, line) => sum + (Number(line.quantity || 0) * Number(line.unitCost || 0)), 0);
  const totalTax = lines.reduce((sum, line) => sum + Number(line.taxAmount || 0), 0);
  const total = taxInclusive ? subtotal : subtotal + totalTax;

  const handleSubmit = () => {
    if (!gdnNumber) return toast({ title: "Missing fields", description: "Please enter a reference number.", variant: "destructive" });
    if (sourceType === "supplier" && !supplierId) return toast({ title: "Missing fields", description: "Please select a supplier.", variant: "destructive" });
    if (sourceType === "customer" && !customerId) return toast({ title: "Missing fields", description: "Please select a customer.", variant: "destructive" });
    
    const validLines = lines.filter(l => (l.type === "stock" && l.productId) || (l.type === "expense" && l.accountCode));
    if (validLines.length === 0) return toast({ title: "Missing items", description: "Please add at least one valid item or charge.", variant: "destructive" });

    createGdn.mutate({
      supplierId: sourceType === "supplier" ? Number(supplierId) : null,
      customerId: sourceType === "customer" ? Number(customerId) : null,
      gdnNumber,
      notes,
      taxInclusive,
      items: validLines.map(l => ({
        productId: l.type === "stock" ? l.productId : null,
        accountCode: l.type === "expense" ? l.accountCode : null,
        description: l.type === "expense" ? l.description : null,
        quantity: l.quantity,
        unitCost: l.unitCost,
        taxTypeId: l.taxTypeId ? Number(l.taxTypeId) : null,
        taxRate: Number(l.taxRate || 0),
        taxAmount: Number(l.taxAmount || 0),
        isRecoverable: l.isRecoverable !== false,
        serialNumbers: l.serialNumbers || [],
        batchNumber: l.batchNumber || null,
        manufacturingDate: l.manufacturingDate || null,
        expiryDate: l.expiryDate || null,
      }))
    });
  };

  return (
    <Layout>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="outline" className="rounded-xl" onClick={() => setLocation("/inventory/account")}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back
          </Button>
          <div className="h-6 w-px bg-slate-200 mx-2" />
          <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <PackagePlus className="w-6 h-6 text-blue-600" />
            Direct Goods Receipt (GRV)
          </h1>
        </div>
        <Button 
          onClick={handleSubmit} 
          disabled={createGdn.isPending}
          className="rounded-xl bg-blue-600 hover:bg-blue-700 font-bold"
        >
          {createGdn.isPending ? "Saving..." : "Create Draft GRV"}
        </Button>
      </div>

      <div className="space-y-6">
          <div className="space-y-6">
          <Card className="rounded-[18px] border-slate-200 shadow-sm">
            <div className="border-b border-slate-100 bg-slate-50 px-5 py-3 flex justify-between items-center">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">Document Details</h3>
              <div className="flex items-center gap-2">
                 <Label htmlFor="tax-inc" className="text-xs text-slate-500 cursor-pointer">Amounts include VAT</Label>
                 <Switch
                    id="tax-inc"
                    checked={taxInclusive}
                    onCheckedChange={(checked) => {
                      setTaxInclusive(checked);
                      // Recalculate all tax amounts
                      const updated = lines.map(line => {
                        const rate = Number(line.taxRate || 0);
                        const baseAmt = Number(line.quantity || 0) * Number(line.unitCost || 0);
                        const taxAmt = checked ? baseAmt - (baseAmt / (1 + (rate / 100))) : baseAmt * (rate / 100);
                        return { ...line, taxAmount: taxAmt.toFixed(2) };
                      });
                      setLines(updated);
                    }}
                 />
              </div>
            </div>
            <CardContent className="p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Supplier Document Ref / GDN #</Label>
                <Input 
                  placeholder="e.g. DEL-2023-01" 
                  value={gdnNumber} 
                  onChange={(e) => setGdnNumber(e.target.value)}
                  className="bg-slate-50 font-mono"
                />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center h-5">
                  <Label>Source <span className="text-red-500">*</span></Label>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className={sourceType === "supplier" ? "font-bold text-slate-900" : ""}>Supplier</span>
                    <Switch
                      checked={sourceType === "customer"}
                      onCheckedChange={(checked) => {
                        setSourceType(checked ? "customer" : "supplier");
                        setSupplierId("");
                        setCustomerId("");
                      }}
                    />
                    <span className={sourceType === "customer" ? "font-bold text-slate-900" : ""}>Customer</span>
                  </div>
                </div>
                {sourceType === "supplier" ? (
                  <Select value={supplierId} onValueChange={setSupplierId}>
                    <SelectTrigger className="bg-slate-50">
                      <SelectValue placeholder="Select Supplier" />
                    </SelectTrigger>
                    <SelectContent>
                      {(suppliers || []).map((s: any) => (
                        <SelectItem key={s.id} value={s.id.toString()}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Select value={customerId} onValueChange={setCustomerId}>
                    <SelectTrigger className="bg-slate-50">
                      <SelectValue placeholder="Select Customer" />
                    </SelectTrigger>
                    <SelectContent>
                      {(customers || []).map((c: any) => (
                        <SelectItem key={c.id} value={c.id.toString()}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="space-y-2">
                <Label>Notes & Instructions</Label>
                <Textarea 
                  placeholder="Any receiving notes..." 
                  value={notes} 
                  onChange={(e) => setNotes(e.target.value)}
                  className="bg-slate-50 resize-none"
                  rows={1}
                />
              </div>
            </CardContent>
          </Card>
        </div>
          <Card className="rounded-[18px] border-slate-200 shadow-sm overflow-hidden">
            <div className="border-b border-slate-100 bg-slate-50 px-6 py-4">
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                <Receipt className="w-4 h-4" /> Received Items & Charges
              </h3>
            </div>
            <CardContent className="p-0">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Type / Item</th>
                    <th className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-400 w-24">Qty</th>
                    <th className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-400 w-32">Unit Cost</th>
                    <th className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-400 w-48">Tax</th>
                    <th className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-400 w-32 text-right">Total</th>
                    <th className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-400 w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, idx) => (
                    <tr key={idx} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="p-4">
                        <div className="flex gap-2">
                          <Select value={line.type} onValueChange={(val) => handleLineChange(idx, "type", val)}>
                            <SelectTrigger className="w-32 bg-white">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="stock">Stock Item</SelectItem>
                              <SelectItem value="expense">Expense/Charge</SelectItem>
                            </SelectContent>
                          </Select>
                          
                          {line.type === "stock" ? (
                            <>
                              <ProductCombobox
                                value={line.productId?.toString() || ""}
                                products={products || []}
                                onChange={(val) => {
                                  const product = (products || []).find((p: any) => String(p.id) === val);
                                  const newCost = Number(product?.costPrice || line.unitCost || 0);
                                  const rate = Number(line.taxRate || 0);
                                  const qty = Number(line.quantity || 0);
                                  const baseAmt = qty * newCost;
                                  const taxAmt = taxInclusive ? baseAmt - (baseAmt / (1 + (rate / 100))) : baseAmt * (rate / 100);
                                  
                                  const updated = [...lines];
                                  updated[idx] = { 
                                    ...updated[idx], 
                                    productId: Number(val), 
                                    unitCost: newCost, 
                                    taxAmount: taxAmt.toFixed(2) 
                                  };
                                  setLines(updated);
                                }}
                                className="flex-1"
                              />
                              {(products || []).find((p: any) => String(p.id) === String(line.productId))?.serialTrackingEnabled && (
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  onClick={() => openSerialModal(idx)}
                                  className={`ml-2 ${line.serialNumbers?.length === line.quantity ? "border-emerald-500 text-emerald-600" : "border-amber-500 text-amber-600"}`}
                                >
                                  {line.serialNumbers?.length > 0 ? `${line.serialNumbers.length} Serials` : "Add Serials"}
                                </Button>
                              )}
                              {(products || []).find((p: any) => String(p.id) === String(line.productId))?.batchTrackingEnabled && (
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  onClick={() => openBatchModal(idx)}
                                  className={`ml-2 ${line.batchNumber ? "border-emerald-500 text-emerald-600" : "border-amber-500 text-amber-600"}`}
                                >
                                  {line.batchNumber ? `Batch: ${line.batchNumber}` : "Add Batch Info"}
                                </Button>
                              )}
                            </>
                          ) : (
                            <div className="flex-1 flex gap-2">
                              <Input 
                                placeholder="Description (e.g. Freight)" 
                                value={line.description}
                                onChange={(e) => handleLineChange(idx, "description", e.target.value)}
                                className="bg-white"
                              />
                              <Button variant="outline" onClick={() => openAccountModal(idx)}>
                                {line.accountCode || "Select GL Account"}
                              </Button>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="p-4">
                        <QuantityInput 
                          type="number" 
                          min="0" 
                          value={line.quantity}
                          onChange={(e) => {
                            const qty = Number(e.target.value || 0);
                            const cost = Number(line.unitCost || 0);
                            const rate = Number(line.taxRate || 0);
                            const baseAmt = qty * cost;
                            const taxAmt = taxInclusive ? baseAmt - (baseAmt / (1 + (rate / 100))) : baseAmt * (rate / 100);
                            
                            const updated = [...lines];
                            updated[idx] = { ...updated[idx], quantity: qty, taxAmount: taxAmt.toFixed(2) };
                            setLines(updated);
                          }}
                          className="font-mono text-right bg-white"
                        />
                      </td>
                      <td className="p-4">
                        <Input 
                          type="number" 
                          min="0" 
                          step="0.01"
                          value={line.unitCost}
                          onChange={(e) => {
                            const cost = Number(e.target.value || 0);
                            const qty = Number(line.quantity || 0);
                            const rate = Number(line.taxRate || 0);
                            const baseAmt = qty * cost;
                            const taxAmt = taxInclusive ? baseAmt - (baseAmt / (1 + (rate / 100))) : baseAmt * (rate / 100);
                            
                            const updated = [...lines];
                            updated[idx] = { ...updated[idx], unitCost: cost, taxAmount: taxAmt.toFixed(2) };
                            setLines(updated);
                          }}
                          className="font-mono text-right bg-white"
                        />
                      </td>
                      <td className="p-4 space-y-1">
                          <Select
                            value={line.taxTypeId ? String(line.taxTypeId) : "none"}
                            onValueChange={(val) => {
                              const updated = [...lines];
                              if (val === "none") {
                                updated[idx] = { ...updated[idx], taxTypeId: null, taxRate: 0, taxAmount: 0 };
                              } else {
                                const t = (taxTypes as any[]).find((x) => String(x.id) === val);
                                if (t) {
                                  const rate = Number(t.rate);
                                  const qty = Number(line.quantity || 0);
                                  const cost = Number(line.unitCost || 0);
                                  const baseAmt = qty * cost;
                                  const taxAmt = taxInclusive ? baseAmt - (baseAmt / (1 + (rate / 100))) : baseAmt * (rate / 100);
                                  updated[idx] = { ...updated[idx], taxTypeId: val, taxRate: rate, taxAmount: taxAmt.toFixed(2) };
                                }
                              }
                              setLines(updated);
                            }}
                          >
                            <SelectTrigger className="h-9 bg-white">
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
                              <label htmlFor={`rec-${idx}`} className="text-[9px] text-slate-500 uppercase cursor-pointer">
                                Recoverable
                              </label>
                              <input
                                type="checkbox"
                                id={`rec-${idx}`}
                                checked={line.isRecoverable !== false}
                                onChange={(e) => handleLineChange(idx, "isRecoverable", e.target.checked)}
                                className="h-3 w-3 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              />
                            </div>
                          )}
                      </td>
                      <td className="p-4 text-right font-mono text-slate-700">
                        {((Number(line.quantity || 0) * Number(line.unitCost || 0)) + (taxInclusive ? 0 : Number(line.taxAmount || 0))).toFixed(2)}
                      </td>
                      <td className="p-4 text-center">
                        <Button variant="ghost" size="icon" onClick={() => removeLine(idx)} className="text-red-400 hover:text-red-600 hover:bg-red-50">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="bg-slate-50 border-t border-slate-100 p-4">
                <div className="flex justify-end items-center mb-2">
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
              <div className="p-4 border-t border-slate-100 flex gap-3">
                <Button variant="outline" onClick={() => addLine("stock")} className="rounded-xl border-dashed">
                  <Plus className="w-4 h-4 mr-2" /> Add Stock Item
                </Button>
                <Button variant="outline" onClick={() => addLine("expense")} className="rounded-xl border-dashed">
                  <Plus className="w-4 h-4 mr-2" /> Add Freight/Charge
                </Button>
              </div>
            </CardContent>
          </Card>
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

      <Dialog open={isSerialModalOpen} onOpenChange={setIsSerialModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Enter Serial Numbers</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-slate-500">
              Enter serial or batch numbers separated by newlines or commas.
            </p>
            <Textarea
              value={tempSerials}
              onChange={(e) => setTempSerials(e.target.value)}
              placeholder="e.g. SN123456\nSN789012"
              className="font-mono h-48"
            />
            <Button onClick={saveSerials} className="w-full">
              Save Serial Numbers
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isBatchModalOpen} onOpenChange={setIsBatchModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Enter Batch Information</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Batch Number <span className="text-red-500">*</span></Label>
              <Input
                placeholder="e.g. BATCH-001"
                value={tempBatchInfo.batchNumber}
                onChange={(e) => setTempBatchInfo({ ...tempBatchInfo, batchNumber: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Manufacturing Date</Label>
              <Input
                type="date"
                value={tempBatchInfo.manufacturingDate}
                onChange={(e) => setTempBatchInfo({ ...tempBatchInfo, manufacturingDate: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Expiry Date <span className="text-red-500">*</span></Label>
              <Input
                type="date"
                value={tempBatchInfo.expiryDate}
                onChange={(e) => setTempBatchInfo({ ...tempBatchInfo, expiryDate: e.target.value })}
              />
            </div>
            <Button onClick={saveBatchInfo} className="w-full">
              Save Batch Info
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
