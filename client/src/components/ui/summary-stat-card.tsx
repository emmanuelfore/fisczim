import { Card } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type SummaryStatTone =
  | "slate"
  | "blue"
  | "emerald"
  | "amber"
  | "rose"
  | "violet";

const toneStyles: Record<
  SummaryStatTone,
  { iconBg: string; iconText: string }
> = {
  slate: { iconBg: "bg-slate-50", iconText: "text-slate-600" },
  blue: { iconBg: "bg-blue-50", iconText: "text-blue-600" },
  emerald: { iconBg: "bg-emerald-50", iconText: "text-emerald-600" },
  amber: { iconBg: "bg-amber-50", iconText: "text-amber-600" },
  rose: { iconBg: "bg-rose-50", iconText: "text-rose-600" },
  violet: { iconBg: "bg-violet-50", iconText: "text-violet-600" },
};

interface SummaryStatCardProps {
  label: string;
  value: React.ReactNode;
  icon: LucideIcon;
  tone?: SummaryStatTone;
  className?: string;
  valueClassName?: string;
  onClick?: () => void;
}

export function SummaryStatCard({
  label,
  value,
  icon: Icon,
  tone = "slate",
  className,
  valueClassName,
  onClick,
}: SummaryStatCardProps) {
  const style = toneStyles[tone];

  return (
    <Card
      className={cn(
        "bg-white border-none shadow-sm rounded-3xl p-6 ring-1 ring-slate-100",
        onClick &&
          "cursor-pointer transition-all duration-200 hover:shadow-md hover:ring-slate-200",
        className,
      )}
      onClick={onClick}
    >
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
        {label}
      </p>
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "w-10 h-10 rounded-2xl flex items-center justify-center",
            style.iconBg,
            style.iconText,
          )}
        >
          <Icon className="w-5 h-5" />
        </div>
        <span
          className={cn("text-2xl font-black text-slate-900", valueClassName)}
        >
          {value}
        </span>
      </div>
    </Card>
  );
}
