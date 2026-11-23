import { Building2 } from "lucide-react";
import { useCostCenters } from "@/hooks/use-cost-centers";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const ALL_COST_CENTERS = "all";

interface CostCenterFilterProps {
  companyId: number;
  value: string;
  onChange: (value: string) => void;
  /** Compact styling for dense report toolbars. */
  compact?: boolean;
  className?: string;
}

/**
 * Shared cost-center filter for accounting reports. Uses the normalized
 * `cost_centers` table (not the legacy product owner_group string), so its
 * value can be passed straight to the `costCenterId` report query parameter.
 */
export function CostCenterFilter({
  companyId,
  value,
  onChange,
  compact = false,
  className,
}: CostCenterFilterProps) {
  const { data: costCenters = [] } = useCostCenters(companyId);

  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`}>
      <Building2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger
          className={
            compact
              ? "h-8 text-xs font-bold border-none bg-slate-100/50 rounded-xl focus:ring-0 min-w-[130px]"
              : "h-11 rounded-xl bg-white border-slate-200"
          }
        >
          <SelectValue placeholder="All Cost Centers" />
        </SelectTrigger>
        <SelectContent className="rounded-xl border-slate-100 shadow-xl">
          <SelectItem
            value={ALL_COST_CENTERS}
            className={compact ? "text-xs font-bold" : "font-bold"}
          >
            All Cost Centers
          </SelectItem>
          {costCenters.map((center) => (
            <SelectItem
              key={center.id}
              value={String(center.id)}
              className={compact ? "text-xs font-bold" : undefined}
            >
              {center.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Build the query parameter object for a selected cost center. */
export function costCenterParam(value: string): { costCenterId?: number } {
  return value && value !== ALL_COST_CENTERS ? { costCenterId: Number(value) } : {};
}
