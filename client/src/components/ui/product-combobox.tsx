import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

export function ProductCombobox({
  products,
  value,
  onChange,
  disabled = false,
  className,
}: {
  products: any[]
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  className?: string
}) {
  const [open, setOpen] = React.useState(false)

  const selectedProduct = products.find((p) => String(p.id) === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("justify-between font-normal bg-white h-9 px-3", className)}
        >
          <span className="truncate text-sm flex-1 text-left">
            {selectedProduct 
              ? <>{selectedProduct.name} {selectedProduct.originalLanguageName ? <span className="text-xs text-slate-400 font-normal ml-1">({selectedProduct.originalLanguageName})</span> : ""}{selectedProduct.sku ? ` (${selectedProduct.sku})` : ""}</> 
              : "Select product..."}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search products..." />
          <CommandList>
            <CommandEmpty>No product found.</CommandEmpty>
            <CommandGroup>
              {products.map((product) => (
                <CommandItem
                  key={product.id}
                  value={`${product.name} ${product.originalLanguageName || ""} ${product.sku || ""}`}
                  onSelect={() => {
                    onChange(String(product.id))
                    setOpen(false)
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === String(product.id) ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="flex flex-col min-w-0">
                    <span className="truncate font-medium">
                      {product.name} {product.originalLanguageName && <span className="text-xs text-slate-400 font-normal ml-1">({product.originalLanguageName})</span>}
                    </span>
                    {product.sku && (
                      <span className="text-[10px] text-muted-foreground truncate">{product.sku}</span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
