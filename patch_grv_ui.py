import re

with open('client/src/pages/grv-details.tsx', 'r') as f:
    content = f.read()

# Replace the stock items table row rendering
stock_row_target = """                        <tr key={line.id} className="border-t border-slate-50">
                          <td className="p-3 font-semibold text-slate-800">{line.productName}</td>
                          <td className="p-3 font-mono text-xs text-slate-500">{line.sku || "-"}</td>"""
stock_row_replacement = """                        <tr key={line.id} className="border-t border-slate-50">
                          <td className="p-3 font-semibold text-slate-800">
                            {line.isNew ? (
                              <SearchSelect
                                items={(products || []).map((p: any) => ({ value: p.id.toString(), label: p.name }))}
                                value={line.productId?.toString()}
                                onValueChange={(val) => handleLineChange(idx, "productId", Number(val))}
                                placeholder="Select product..."
                                className="bg-white min-w-[200px]"
                              />
                            ) : (
                              line.productName
                            )}
                          </td>
                          <td className="p-3 font-mono text-xs text-slate-500">{line.sku || "-"}</td>"""

content = content.replace(stock_row_target, stock_row_replacement)

# Replace the stock table end to add the Add Stock button
stock_table_end = """                    </tbody>
                  </table>
                </div>
              </div>"""
stock_table_end_replacement = """                    </tbody>
                  </table>
                  {grv.status === "DRAFT" && (
                    <div className="p-4 border-t border-slate-100 bg-slate-50 flex">
                      <Button variant="outline" size="sm" onClick={() => addLine("stock")} className="rounded-xl border-dashed">
                        <Plus className="w-4 h-4 mr-2" /> Add Stock Item
                      </Button>
                    </div>
                  )}
                </div>
              </div>"""

content = content.replace(stock_table_end, stock_table_end_replacement)

# Replace the non-stock items filter to include explicit check
non_stock_filter_target = """              {(grv.status === "DRAFT" && editableLines.length > 0 ? editableLines : grv.lines).some((l: any) => !l.productId) && ("""
non_stock_filter_replacement = """              {(grv.status === "DRAFT" && editableLines.length > 0 ? editableLines : grv.lines).some((l: any) => l.productId === null) && ("""
content = content.replace(non_stock_filter_target, non_stock_filter_replacement)

non_stock_filter_map_target = """.filter(l => !l.productId).map((line: any, originalIdx: number) => {"""
non_stock_filter_map_replacement = """.filter(l => l.productId === null).map((line: any, originalIdx: number) => {"""
content = content.replace(non_stock_filter_map_target, non_stock_filter_map_replacement)

non_stock_filter_count_target = """.filter(l => !l.productId).length}"""
non_stock_filter_count_replacement = """.filter(l => l.productId === null).length}"""
content = content.replace(non_stock_filter_count_target, non_stock_filter_count_replacement)


# Replace the non-stock items table row rendering
non_stock_row_target = """                          <tr key={line.id} className="border-t border-slate-100">
                            <td className="p-3 font-semibold text-slate-800">{line.productName || line.description}</td>
                            <td className="p-3 font-mono text-xs text-slate-500">{line.accountCode || "-"}</td>"""
non_stock_row_replacement = """                          <tr key={line.id} className="border-t border-slate-100">
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
                            </td>"""
content = content.replace(non_stock_row_target, non_stock_row_replacement)


# Replace the non-stock table end to add the Add Expense button
non_stock_table_end = """                      </tbody>
                    </table>
                  </div>
                </div>
              )}"""
non_stock_table_end_replacement = """                      </tbody>
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
              )}"""

content = content.replace(non_stock_table_end, non_stock_table_end_replacement)

# Ensure account modal is included at the bottom of GrvDetailsPage
modal_injection = """      <Dialog open={isAccountModalOpen} onOpenChange={setIsAccountModalOpen}>
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
}"""

content = content.replace("""    </Layout>
  );
}""", modal_injection)

with open('client/src/pages/grv-details.tsx', 'w') as f:
    f.write(content)

