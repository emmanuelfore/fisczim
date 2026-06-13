import re

with open('client/src/pages/grv-details.tsx', 'r') as f:
    content = f.read()

# 1. Add taxTypes
content = re.sub(
    r'(const \{ data: accounts \} = useQuery\(\{[^}]*\}\);)',
    r'\1\n\n  const { data: taxTypes = [] } = useQuery({\n    queryKey: [`/api/tax-types?companyId=${companyId}`],\n    enabled: !!companyId,\n  });',
    content
)

# 2. Add Tax headers
content = content.replace(
    '<th className="p-3 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Line Total</th>',
    '<th className="p-3 text-[10px] font-black uppercase tracking-widest text-slate-400 w-48">Tax</th>\n                        <th className="p-3 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Line Total</th>'
)

content = content.replace(
    '<th className="p-3 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Total Charge</th>',
    '<th className="p-3 text-[10px] font-black uppercase tracking-widest text-slate-400 w-48">Tax</th>\n                          <th className="p-3 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Total Charge</th>'
)

# 3. Replace unitCost and quantity Inputs in Stock Items to include taxAmount calculation
stock_unit_cost_orig = """<Input 
                                  type="number" 
                                  step="0.01" 
                                  min="0"
                                  className="h-8 w-24 text-right font-mono" 
                                  value={line.unitCost} 
                                  onChange={(e) => handleLineChange(idx, "unitCost", e.target.value)} 
                                />"""
stock_unit_cost_new = """<Input 
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
                                />"""
content = content.replace(stock_unit_cost_orig, stock_unit_cost_new)

stock_qty_orig = """<Input 
                                    type="number" 
                                    step="0.01" 
                                    min="0"
                                    className="h-8 w-20 text-right font-mono" 
                                    value={line.quantity} 
                                    onChange={(e) => handleLineChange(idx, "quantity", e.target.value)} 
                                  />"""
stock_qty_new = """<Input 
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
                                  />"""
content = content.replace(stock_qty_orig, stock_qty_new)

# 4. Insert Tax TD into stock rows
stock_td_orig = """<td className="p-3 font-bold text-slate-900 text-right">
                            {currency} {((line.unitCost || 0) * (line.quantity || 0)).toFixed(2)}
                          </td>"""
tax_td_str = """<td className="p-3 space-y-1">
                            {grv.status === "DRAFT" ? (
                              <>
                                <Select
                                  value={line.taxTypeId?.toString() || ""}
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
                          </td>"""
content = content.replace(stock_td_orig, tax_td_str)

with open('client/src/pages/grv-details.tsx', 'w') as f:
    f.write(content)

print("Patch applied")
