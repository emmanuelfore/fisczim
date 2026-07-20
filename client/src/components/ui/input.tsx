import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    // h-9 to match icon buttons and default buttons.
    return (
      <input
        type={type}
        className={cn(
          "flex h-11 md:h-10 min-h-[44px] md:min-h-0 w-full rounded-[10px] border border-[#E5E7EB] bg-white px-3 py-2  font-medium text-[#0F172A] shadow-none ring-offset-background file:border-0 file:bg-transparent  file:font-semibold file:text-foreground placeholder:text-[#94A3B8] transition-colors focus-visible:border-[#BFDBFE] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/15 disabled:cursor-not-allowed disabled:bg-[#F8FAFC] disabled:opacity-70 text-[16px] md:text-sm",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
