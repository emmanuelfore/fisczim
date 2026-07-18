import * as React from "react"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"

export interface QuantityInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const QuantityInput = React.forwardRef<HTMLInputElement, QuantityInputProps>(
  ({ className, type = "number", ...props }, ref) => {
    return (
      <Input
        type={type}
        className={cn(
          "min-w-[140px] w-full max-w-[180px] font-mono text-right",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
QuantityInput.displayName = "QuantityInput"

export { QuantityInput }
