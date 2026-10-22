import type { Dispatch, SetStateAction } from "react";
import { Boxes, Layers3 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

type InventoryValuationMethod = "WAC" | "FIFO" | "LIFO";

type Props = {
  formData: any;
  setFormData: Dispatch<SetStateAction<any>>;
};

const VALUATION_METHODS: Array<{
  value: InventoryValuationMethod;
  label: string;
  name: string;
  description: string;
}> = [
  {
    value: "WAC",
    label: "WAC - Weighted Average Cost",
    name: "Weighted Average Cost",
    description:
      "Revalues stock using the average cost of remaining on-hand quantities.",
  },
  {
    value: "FIFO",
    label: "FIFO - First In, First Out",
    name: "First In, First Out",
    description:
      "Issues older stock layers first when calculating cost of goods sold.",
  },
  {
    value: "LIFO",
    label: "LIFO - Last In, First Out",
    name: "Last In, First Out",
    description:
      "Issues the newest stock layers first when calculating cost of goods sold.",
  },
];

export function InventorySettings({ formData, setFormData }: Props) {
  const selectedMethod = (formData.inventoryValuationMethod ||
    "WAC") as InventoryValuationMethod;
  const selected =
    VALUATION_METHODS.find((method) => method.value === selectedMethod) ||
    VALUATION_METHODS[0];

  return (
    <div className="max-w-5xl space-y-4">
      <Card className="overflow-hidden rounded-[14px] border border-[#E5E7EB] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <CardHeader className="border-b border-[#E5E7EB] bg-[#F8FAFC] p-5">
          <CardTitle className="flex items-center text-base font-semibold tracking-tight text-[#0F172A]">
            <div className="mr-3 flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#EFF6FF]">
              <Boxes className="h-4 w-4 text-[#2563EB]" />
            </div>
            Stock Valuation
          </CardTitle>
          <CardDescription className="ml-11 mt-0.5  text-[#64748B]">
            Choose how inventory layers are consumed for cost of goods sold and
            valuation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 p-5">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-2">
              <Label className="text-xs font-medium text-[#64748B]">
                Stock Valuation Method
              </Label>
              <Select
                value={selected.value}
                onValueChange={(value: InventoryValuationMethod) => {
                  setFormData((prev: any) => ({
                    ...prev,
                    inventoryValuationMethod: value,
                  }));
                }}
              >
                <SelectTrigger className="h-10 rounded-[10px] border-[#E5E7EB] bg-white font-medium">
                  <SelectValue placeholder="Select valuation method" />
                </SelectTrigger>
                <SelectContent>
                  {VALUATION_METHODS.map((method) => (
                    <SelectItem key={method.value} value={method.value}>
                      {method.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs leading-5 text-[#64748B]">
                This affects tracked products when invoices, stock issues,
                adjustments, and inventory valuation reports calculate stock
                cost.
              </p>
            </div>

            <div className="rounded-[12px] border border-[#E5E7EB] bg-[#F8FAFC] p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Layers3 className="h-4 w-4 text-[#2563EB]" />
                  <span className=" font-semibold text-[#0F172A]">
                    Current Method
                  </span>
                </div>
                <Badge
                  variant="outline"
                  className="bg-white font-mono text-[11px]"
                >
                  {selected.value}
                </Badge>
              </div>
              <p className=" font-semibold text-[#0F172A]">{selected.name}</p>
              <p className="mt-1 text-xs leading-5 text-[#64748B]">
                {selected.description}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
