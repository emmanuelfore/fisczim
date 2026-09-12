import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
};

export function PageHeader({
  title,
  subtitle,
  actions,
  className,
}: PageHeaderProps) {
  if (!actions) return null;

  return (
    <div
      className={cn(
        "mb-4 flex w-full flex-col items-stretch justify-end gap-2 sm:flex-row sm:items-center",
        className,
      )}
      aria-label={`${title}${subtitle ? ` - ${subtitle}` : ""} actions`}
    >
      {actions}
    </div>
  );
}
