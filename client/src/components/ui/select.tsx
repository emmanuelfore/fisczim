"use client";

import * as React from "react";
import { Check, ChevronDown, ChevronUp } from "lucide-react";

import { cn } from "@/lib/utils";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";

interface SelectContextValue {
  value?: string;
  onValueChange: (value: string) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  allChildren: React.ReactNode;
  disabled?: boolean;
}

const SelectContext = React.createContext<SelectContextValue>({
  onValueChange: () => {},
  open: false,
  setOpen: () => {},
  allChildren: null,
  disabled: false,
});

function getLabelFromChildren(children: React.ReactNode, value: string | undefined): React.ReactNode {
  if (value === undefined || value === "") return null;
  let label: React.ReactNode = null;

  const search = (node: React.ReactNode) => {
    if (label) return;
    React.Children.forEach(node, (child) => {
      if (!React.isValidElement(child)) return;

      if (
        child.props &&
        child.props.value === value &&
        child.props.children &&
        typeof child.props.onValueChange !== "function" &&
        !child.props.onOpenChange
      ) {
        label = child.props.children;
        return;
      }

      if (child.props && child.props.children) {
        search(child.props.children);
      }
    });
  };

  search(children);
  return label;
}

const Select = ({
  children,
  value,
  onValueChange,
  defaultValue,
  disabled,
  ...props
}: {
  children: React.ReactNode;
  value?: any;
  onValueChange?: (value: any) => void;
  defaultValue?: any;
  disabled?: boolean;
}) => {
  const [open, setOpen] = React.useState(false);
  const [internalValue, setInternalValue] = React.useState(defaultValue || "");

  const isControlled = value !== undefined;
  const currentValue = isControlled ? value : internalValue;

  const handleValueChange = React.useCallback(
    (v: string) => {
      if (!isControlled) {
        setInternalValue(v);
      }
      onValueChange?.(v);
    },
    [isControlled, onValueChange]
  );

  return (
    <SelectContext.Provider
      value={{
        value: currentValue,
        onValueChange: handleValueChange,
        open,
        setOpen,
        allChildren: children,
        disabled,
      }}
    >
      <Popover open={open} onOpenChange={setOpen} {...props}>
        {children}
      </Popover>
    </SelectContext.Provider>
  );
};

const SelectGroup = CommandGroup;

const SelectValue = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement> & { placeholder?: React.ReactNode }
>(({ className, placeholder, ...props }, ref) => {
  const { value, allChildren } = React.useContext(SelectContext);
  const label = getLabelFromChildren(allChildren, value);
  return (
    <span ref={ref} className={cn("truncate block", className)} {...props}>
      {label || placeholder}
    </span>
  );
});
SelectValue.displayName = "SelectValue";

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof PopoverTrigger>,
  React.ComponentPropsWithoutRef<typeof PopoverTrigger>
>(({ className, children, disabled, ...props }, ref) => {
  const context = React.useContext(SelectContext);
  const isDisabled = disabled || context.disabled;
  return (
  <PopoverTrigger
    ref={ref}
    disabled={isDisabled}
    className={cn(
      "flex h-10 w-full items-center justify-between rounded-[10px] border border-[#E5E7EB] bg-white px-3 py-2 font-semibold text-[#0F172A] shadow-none ring-offset-background transition-colors focus:border-[#BFDBFE] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/15 disabled:cursor-not-allowed disabled:bg-[#F8FAFC] disabled:opacity-70 [&>span]:line-clamp-1 text-left",
      className
    )}
    {...props}
  >
    {children}
    <ChevronDown className="h-4 w-4 shrink-0 text-[#64748B]" />
  </PopoverTrigger>
)});
SelectTrigger.displayName = "SelectTrigger";

const SelectScrollUpButton = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex cursor-default items-center justify-center py-1", className)} {...props}>
      <ChevronUp className="h-4 w-4" />
    </div>
  )
);
SelectScrollUpButton.displayName = "SelectScrollUpButton";

const SelectScrollDownButton = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex cursor-default items-center justify-center py-1", className)} {...props}>
      <ChevronDown className="h-4 w-4" />
    </div>
  )
);
SelectScrollDownButton.displayName = "SelectScrollDownButton";

const SelectContent = React.forwardRef<
  React.ElementRef<typeof PopoverContent>,
  React.ComponentPropsWithoutRef<typeof PopoverContent> & { position?: string }
>(({ className, children, position, ...props }, ref) => {
  return (
    <PopoverContent
      ref={ref}
      className={cn(
        "w-[var(--radix-popover-trigger-width)] p-0 rounded-[14px] border border-[#E5E7EB] bg-white text-[#0F172A] shadow-[0_12px_32px_rgba(15,23,42,0.08)] overflow-hidden",
        className
      )}
      align="start"
      {...props}
    >
      <Command>
        <CommandInput placeholder="Search..." />
        <CommandList className="max-h-[300px] overflow-y-auto">
          <CommandEmpty>No results found.</CommandEmpty>
          {children}
        </CommandList>
      </Command>
    </PopoverContent>
  );
});
SelectContent.displayName = "SelectContent";

const SelectLabel = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("py-1.5 pl-8 pr-2 font-semibold text-sm", className)} {...props} />
  )
);
SelectLabel.displayName = "SelectLabel";

const SelectItem = React.forwardRef<
  React.ElementRef<typeof CommandItem>,
  React.ComponentPropsWithoutRef<typeof CommandItem> & { value: string }
>(({ className, children, value, ...props }, ref) => {
  const { value: selectedValue, onValueChange, setOpen } = React.useContext(SelectContext);

  return (
    <CommandItem
      ref={ref}
      onSelect={() => {
        onValueChange(value);
        setOpen(false);
      }}
      className={cn(
        "relative flex w-full cursor-default select-none items-center rounded-[10px] py-2 pl-8 pr-2 font-medium outline-none data-[disabled='true']:pointer-events-none data-[disabled='true']:opacity-50 aria-selected:bg-[#EFF6FF] aria-selected:text-[#1D4ED8]",
        className
      )}
      {...props}
    >
      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
        <Check
          className={cn(
            "h-4 w-4",
            selectedValue === value ? "opacity-100" : "opacity-0"
          )}
        />
      </span>
      <span className="flex-1 truncate">{children}</span>
    </CommandItem>
  );
});
SelectItem.displayName = "SelectItem";

const SelectSeparator = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("-mx-1 my-1 h-px bg-muted", className)} {...props} />
  )
);
SelectSeparator.displayName = "SelectSeparator";

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
};
