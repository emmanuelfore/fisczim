import re

with open('client/src/pages/create-grv.tsx', 'r') as f:
    content = f.read()

# Add taxTypes and taxInclusive state
imports_target = """import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus, Trash2, PackagePlus, Receipt, Truck } from "lucide-react";"""

imports_replacement = """import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus, Trash2, PackagePlus, Receipt, Truck } from "lucide-react";
import { Switch } from "@/components/ui/switch";"""

content = content.replace(imports_target, imports_replacement)

state_target = """  const [lines, setLines] = useState<any[]>([
    { type: "stock", productId: "", accountCode: "", description: "", quantity: 1, unitCost: 0 }
  ]);"""

state_replacement = """  const [taxInclusive, setTaxInclusive] = useState(false);
  const [lines, setLines] = useState<any[]>([
    { type: "stock", productId: "", accountCode: "", description: "", quantity: 1, unitCost: 0, taxTypeId: "", taxRate: 0, taxAmount: 0, isRecoverable: true }
  ]);

  const { data: taxTypes = [] } = useQuery({
    queryKey: ["/api/tax-types"],
    enabled: !!companyId,
  });"""

content = content.replace(state_target, state_replacement)

# Update addLine
add_target = """  const addLine = (type: "stock" | "expense") => {
    setLines([...lines, { type, productId: "", accountCode: "", description: "", quantity: 1, unitCost: 0 }]);
  };"""
add_replacement = """  const addLine = (type: "stock" | "expense") => {
    setLines([...lines, { type, productId: "", accountCode: "", description: "", quantity: 1, unitCost: 0, taxTypeId: "", taxRate: 0, taxAmount: 0, isRecoverable: true }]);
  };"""
content = content.replace(add_target, add_replacement)

# Subtotals logic
submit_target = """  const handleSubmit = () => {"""
submit_replacement = """  const subtotal = lines.reduce((sum, line) => sum + (Number(line.quantity || 0) * Number(line.unitCost || 0)), 0);
  const totalTax = lines.reduce((sum, line) => sum + Number(line.taxAmount || 0), 0);
  const total = taxInclusive ? subtotal : subtotal + totalTax;

  const handleSubmit = () => {"""
content = content.replace(submit_target, submit_replacement)

# Submit payload
payload_target = """        productId: l.type === "stock" ? l.productId : null,
        accountCode: l.type === "expense" ? l.accountCode : null,
        description: l.type === "expense" ? l.description : null,
        quantity: l.quantity,
        unitCost: l.unitCost"""
payload_replacement = """        productId: l.type === "stock" ? l.productId : null,
        accountCode: l.type === "expense" ? l.accountCode : null,
        description: l.type === "expense" ? l.description : null,
        quantity: l.quantity,
        unitCost: l.unitCost,
        taxTypeId: l.taxTypeId ? Number(l.taxTypeId) : null,
        taxRate: Number(l.taxRate || 0),
        taxAmount: Number(l.taxAmount || 0),
        isRecoverable: l.isRecoverable !== false"""
content = content.replace(payload_target, payload_replacement)

# Also add taxInclusive to payload
submit_mut_target = """    createGdn.mutate({
      supplierId: supplierId || null,
      gdnNumber,
      notes,"""
submit_mut_replacement = """    createGdn.mutate({
      supplierId: supplierId || null,
      gdnNumber,
      notes,
      taxInclusive,"""
content = content.replace(submit_mut_target, submit_mut_replacement)

# Update the table headers
th_target = """                    <th className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Type / Item</th>
                    <th className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-400 w-32">Qty</th>
                    <th className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-400 w-32">Unit Cost</th>
                    <th className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-400 w-12"></th>"""
th_replacement = """                    <th className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Type / Item</th>
                    <th className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-400 w-24">Qty</th>
                    <th className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-400 w-32">Unit Cost</th>
                    <th className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-400 w-48">Tax</th>
                    <th className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-400 w-32 text-right">Total</th>
                    <th className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-400 w-12"></th>"""
content = content.replace(th_target, th_replacement)

# Update the row cells
row_target = """                      <td className="p-4">
                        <Input 
                          type="number" 
                          min="1" 
                          value={line.quantity}
                          onChange={(e) => handleLineChange(idx, "quantity", Number(e.target.value))}
                          className="font-mono text-right bg-white"
                        />
                      </td>
                      <td className="p-4">
                        <Input 
                          type="number" 
                          min="0" 
                          step="0.01"
                          value={line.unitCost}
                          onChange={(e) => handleLineChange(idx, "unitCost", Number(e.target.value))}
                          className="font-mono text-right bg-white"
                        />
                      </td>"""
row_replacement = """                      <td className="p-4">
                        <Input 
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
                            value={line.taxTypeId || ""}
                            onValueChange={(val) => {
                              const t = (taxTypes as any[]).find((x) => String(x.id) === val);
                              if (t) {
                                const rate = Number(t.rate);
                                const qty = Number(line.quantity || 0);
                                const cost = Number(line.unitCost || 0);
                                const baseAmt = qty * cost;
                                const taxAmt = taxInclusive ? baseAmt - (baseAmt / (1 + (rate / 100))) : baseAmt * (rate / 100);
                                
                                const updated = [...lines];
                                updated[idx] = { ...updated[idx], taxTypeId: val, taxRate: rate, taxAmount: taxAmt.toFixed(2) };
                                setLines(updated);
                              }
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
                      </td>"""
content = content.replace(row_target, row_replacement)

# Totals at bottom of table
table_end_target = """              <div className="p-4 border-t border-slate-100 flex gap-3">"""
table_end_replacement = """              <div className="bg-slate-50 border-t border-slate-100 p-4">
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
              <div className="p-4 border-t border-slate-100 flex gap-3">"""
content = content.replace(table_end_target, table_end_replacement)

# Tax Inclusive toggle
doc_details_target = """<div className="border-b border-slate-100 bg-slate-50 px-5 py-3">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">Document Details</h3>
            </div>
            <CardContent className="p-5 space-y-4">"""
doc_details_replacement = """<div className="border-b border-slate-100 bg-slate-50 px-5 py-3 flex justify-between items-center">
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
            <CardContent className="p-5 space-y-4">"""
content = content.replace(doc_details_target, doc_details_replacement)

with open('client/src/pages/create-grv.tsx', 'w') as f:
    f.write(content)
print("create-grv.tsx patched successfully!")
