import re

with open('client/src/pages/purchase-order-form.tsx', 'r') as f:
    content = f.read()

# Update DraftLine type
draft_line_target = """type DraftLine = {
  isFreetext?: boolean;
  productId: string;
  description?: string;
  accountCode?: string;
  quantity: string;
  unitCost: string;
  notes: string;
};"""
draft_line_replacement = """type DraftLine = {
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
};"""
content = content.replace(draft_line_target, draft_line_replacement)

# Import Switch
switch_import_target = """import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";"""
switch_import_replacement = """import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";"""
content = content.replace(switch_import_target, switch_import_replacement)

# Fetch Tax Types
tax_fetch_target = """  const { data: currencies = [] } = useCurrencies(companyId);"""
tax_fetch_replacement = """  const { data: currencies = [] } = useCurrencies(companyId);
  const { data: taxTypes = [] } = useQuery<any[]>({
    queryKey: ["/api/tax-types"],
    queryFn: async () => {
      const res = await apiFetch("/api/tax-types");
      if (!res.ok) return [];
      return res.json();
    },
  });"""
content = content.replace(tax_fetch_target, tax_fetch_replacement)

# State init
state_init_target = """  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([
    { isFreetext: false, productId: "", description: "", accountCode: "", quantity: "1", unitCost: "0", notes: "" },
  ]);"""
state_init_replacement = """  const [notes, setNotes] = useState("");
  const [taxInclusive, setTaxInclusive] = useState(false);
  const [lines, setLines] = useState<DraftLine[]>([
    { isFreetext: false, productId: "", description: "", accountCode: "", quantity: "1", unitCost: "0", taxTypeId: "", taxRate: "0", taxAmount: "0", isRecoverable: true, notes: "" },
  ]);"""
content = content.replace(state_init_target, state_init_replacement)

# State edit mapping
edit_map_target = """              accountCode: item.accountCode || "",
              quantity: String(item.quantity),
              unitCost: String(item.unitCost),
              notes: item.notes || "",
            }))
          : [{ isFreetext: false, productId: "", description: "", accountCode: "", quantity: "1", unitCost: "0", notes: "" }],
      );
    }
  }, [mode, initialData]);"""
edit_map_replacement = """              accountCode: item.accountCode || "",
              quantity: String(item.quantity),
              unitCost: String(item.unitCost),
              taxTypeId: item.taxTypeId ? String(item.taxTypeId) : "",
              taxRate: String(item.taxRate || 0),
              taxAmount: String(item.taxAmount || 0),
              isRecoverable: item.isRecoverable !== false,
              notes: item.notes || "",
            }))
          : [{ isFreetext: false, productId: "", description: "", accountCode: "", quantity: "1", unitCost: "0", taxTypeId: "", taxRate: "0", taxAmount: "0", isRecoverable: true, notes: "" }],
      );
      if ((initialData as any).taxInclusive) setTaxInclusive(true);
    }
  }, [mode, initialData]);"""
content = content.replace(edit_map_target, edit_map_replacement)

# Total calc
total_calc_target = """  const total = lines.reduce(
    (sum, line) => sum + Number(line.quantity || 0) * Number(line.unitCost || 0),
    0,
  );"""
total_calc_replacement = """  const subtotal = lines.reduce(
    (sum, line) => sum + Number(line.quantity || 0) * Number(line.unitCost || 0),
    0,
  );
  
  const totalTax = lines.reduce(
    (sum, line) => sum + Number(line.taxAmount || 0),
    0
  );
  
  const total = taxInclusive ? subtotal : subtotal + totalTax;"""
content = content.replace(total_calc_target, total_calc_replacement)

# Addline
add_line_target = """    setLines((prev) => [...prev, { isFreetext: false, productId: "", description: "", accountCode: "", quantity: "1", unitCost: "0", notes: "" }]);"""
add_line_replacement = """    setLines((prev) => [...prev, { isFreetext: false, productId: "", description: "", accountCode: "", quantity: "1", unitCost: "0", taxTypeId: "", taxRate: "0", taxAmount: "0", isRecoverable: true, notes: "" }]);"""
content = content.replace(add_line_target, add_line_replacement)

# Submit map
submit_map_target = """        quantity: Number(line.quantity),
        unitCost: Number(line.unitCost || 0),
        notes: line.notes || null,
      }));"""
submit_map_replacement = """        quantity: Number(line.quantity),
        unitCost: Number(line.unitCost || 0),
        taxTypeId: line.taxTypeId ? Number(line.taxTypeId) : null,
        taxRate: Number(line.taxRate || 0),
        taxAmount: Number(line.taxAmount || 0),
        isRecoverable: line.isRecoverable !== false,
        notes: line.notes || null,
      }));"""
content = content.replace(submit_map_target, submit_map_replacement)

# Submit payload
submit_payload_target = """{ supplierId: Number(supplierId), branchId: branchId ? Number(branchId) : null, poNumber: poNumber || undefined, expectedDate: expectedDate || null, shipTo: shipTo || null, notes: notes || null, currency: currencyCode, items }"""
submit_payload_replacement = """{ supplierId: Number(supplierId), branchId: branchId ? Number(branchId) : null, poNumber: poNumber || undefined, expectedDate: expectedDate || null, shipTo: shipTo || null, notes: notes || null, currency: currencyCode, taxInclusive, items }"""
content = content.replace(submit_payload_target, submit_payload_replacement)

submit_payload2_target = """data: { supplierId: Number(supplierId), branchId: branchId ? Number(branchId) : null, expectedDate: expectedDate || null, shipTo: shipTo || null, notes: notes || null, currency: currencyCode, items },"""
submit_payload2_replacement = """data: { supplierId: Number(supplierId), branchId: branchId ? Number(branchId) : null, expectedDate: expectedDate || null, shipTo: shipTo || null, notes: notes || null, currency: currencyCode, taxInclusive, items },"""
content = content.replace(submit_payload2_target, submit_payload2_replacement)


# Table Header
table_header_target = """                  <div className="grid grid-cols-12 gap-0 bg-slate-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                    <div className="col-span-5">Product</div>
                    <div className="col-span-2 text-right">Qty</div>
                    <div className="col-span-2 text-right">Unit Cost</div>
                    <div className="col-span-2 text-right">Total</div>
                    <div className="col-span-1" />
                  </div>"""
table_header_replacement = """                  <div className="grid grid-cols-12 gap-0 bg-slate-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                    <div className="col-span-4">Product</div>
                    <div className="col-span-1 text-right">Qty</div>
                    <div className="col-span-2 text-right">Unit Cost</div>
                    <div className="col-span-2 text-right">Tax</div>
                    <div className="col-span-2 text-right">Total</div>
                    <div className="col-span-1" />
                  </div>"""
content = content.replace(table_header_target, table_header_replacement)

# Table Row Update
table_row_target = """                      <div key={index} className="grid grid-cols-12 gap-2 items-start border-t border-slate-50 px-3 py-3">
                        <div className="col-span-5 space-y-1">"""
table_row_replacement = """                      <div key={index} className="grid grid-cols-12 gap-2 items-start border-t border-slate-50 px-3 py-3">
                        <div className="col-span-4 space-y-1">"""
content = content.replace(table_row_target, table_row_replacement)

table_qty_target = """                        <div className="col-span-2">
                          <Input
                            type="number" min="0" value={line.quantity}
                            onChange={(e) => updateLine(index, { quantity: e.target.value })}"""
table_qty_replacement = """                        <div className="col-span-1">
                          <Input
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
                            }}"""
content = content.replace(table_qty_target, table_qty_replacement)

table_cost_target = """                        <div className="col-span-2">
                          <Input
                            type="number" min="0" step="0.01" value={line.unitCost}
                            onChange={(e) => updateLine(index, { unitCost: e.target.value })}
                            className="h-9 text-right"
                          />
                        </div>
                        <div className="col-span-2 text-right text-base font-bold text-slate-800 flex items-center justify-end h-9">
                          {currencyCode} {(Number(line.quantity || 0) * Number(line.unitCost || 0)).toFixed(2)}
                        </div>"""
table_cost_replacement = """                        <div className="col-span-2">
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
                        <div className="col-span-2 text-right text-base font-bold text-slate-800 flex flex-col justify-center h-9">
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
                        </div>"""
content = content.replace(table_cost_target, table_cost_replacement)

# Totals breakdown at bottom
bottom_totals_target = """                <div className="pt-6 mt-6 border-t border-slate-100 flex justify-end">
                  <div className="text-right">
                    <p className="text-sm font-semibold text-slate-500 mb-1">Total Amount</p>
                    <p className="text-3xl font-black text-blue-600">{currencyCode} {total.toFixed(2)}</p>
                  </div>
                </div>"""
bottom_totals_replacement = """                <div className="pt-6 mt-6 border-t border-slate-100 flex justify-end">
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
                </div>"""
content = content.replace(bottom_totals_target, bottom_totals_replacement)

# Tax Inclusive Toggle in Order Details
order_details_target = """              <div className="space-y-2">
                <Label>Branch (Optional)</Label>"""
order_details_replacement = """              <div className="space-y-2">
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
                <Label>Branch (Optional)</Label>"""
content = content.replace(order_details_target, order_details_replacement)


with open('client/src/pages/purchase-order-form.tsx', 'w') as f:
    f.write(content)

