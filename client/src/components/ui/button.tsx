import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[10px]  font-semibold tracking-[-0.005em] transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.99]",
  {
    variants: {
      variant: {
        default:
          "border border-[#1D4ED8] bg-[#2563EB] text-white shadow-[0_1px_2px_rgba(15,23,42,0.08)] hover:bg-[#1D4ED8]",
        destructive:
          "border border-red-600 bg-red-600 text-white shadow-[0_1px_2px_rgba(15,23,42,0.08)] hover:bg-red-700",
        outline:
          "border border-[#E5E7EB] bg-white text-[#0F172A] shadow-none hover:bg-[#F8FAFC] hover:border-[#CBD5E1]",
        secondary:
          "border border-[#E5E7EB] bg-[#F8FAFC] text-[#0F172A] shadow-none hover:bg-white",
        ghost:
          "border border-transparent text-[#334155] hover:bg-[#F1F5F9] hover:text-[#0F172A]",
        link: "h-auto rounded-none border-transparent px-0 text-[#2563EB] underline-offset-4 hover:underline",
      },
      // Heights are set as "min" heights, because sometimes Ai will place large amount of content
      // inside buttons. With a min-height they will look appropriate with small amounts of content,
      // but will expand to fit large amounts of content.
      size: {
        default: "min-h-[44px] md:min-h-10 px-4 py-2",
        sm: "min-h-9 md:min-h-8 rounded-[9px] px-3 ",
        lg: "min-h-[48px] md:min-h-11 rounded-[10px] px-6",
        icon: "min-h-[44px] min-w-[44px] md:min-h-9 md:min-w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
