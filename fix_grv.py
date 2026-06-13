import re

with open('client/src/pages/grv-details.tsx', 'r') as f:
    content = f.read()

# Fix import
content = content.replace('import { SearchSelect } from "@/components/ui/search-select";\n', '')

# Replace SearchSelect component usage with standard Select
target_select = """                              <SearchSelect
                                items={(products || []).map((p: any) => ({ value: p.id.toString(), label: p.name }))}
                                value={line.productId?.toString()}
                                onValueChange={(val) => handleLineChange(idx, "productId", Number(val))}
                                placeholder="Select product..."
                                className="bg-white min-w-[200px]"
                              />"""
replacement_select = """                              <Select
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
                              </Select>"""
content = content.replace(target_select, replacement_select)

with open('client/src/pages/grv-details.tsx', 'w') as f:
    f.write(content)

