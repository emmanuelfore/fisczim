import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
};

export function PageHeader({ title, subtitle, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 mb-8", className)}>
      <div>
        <h1 className="text-3xl font-display font-black text-slate-900 tracking-tight">{title}</h1>
        {subtitle ? <p className="text-slate-500 mt-1 font-medium">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2 w-full lg:w-auto">{actions}</div> : null}
    </div>
  );
}

