import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { filterRecords } from "@/lib/report-utils";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ReportProps {
  companyId: number;
  dateRange: { from: Date; to: Date };
  search: string;
  hideZeroActivity?: boolean;
}

interface Column {
  key: string;
  label: string;
  align?: "left" | "right" | "center";
}

const REPORTS: Record<string, { title: string; endpoint: string; columns: Column[]; searchKeys: string[] }> = {
  dailySales: {
    title: "Daily Sales",
    endpoint: "auto-spares-daily-sales",
    searchKeys: ["date"],
    columns: [
      { key: "date", label: "Date" },
      { key: "invoiceCount", label: "Invoices", align: "right" },
      { key: "totalSales", label: "Total Sales", align: "right" },
      { key: "cash", label: "Cash", align: "right" },
      { key: "card", label: "Card", align: "right" },
      { key: "mobileMoney", label: "Mobile Money", align: "right" },
      { key: "returns", label: "Returns", align: "right" },
      { key: "netSales", label: "Net Sales", align: "right" },
    ],
  },
  topSellingParts: {
    title: "Top-Selling Parts",
    endpoint: "top-selling-parts",
    searchKeys: ["part", "sku", "category", "brand"],
    columns: [
      { key: "part", label: "Part" },
      { key: "sku", label: "SKU" },
      { key: "category", label: "Category" },
      { key: "brand", label: "Brand" },
      { key: "quantitySold", label: "Qty Sold", align: "right" },
      { key: "revenue", label: "Revenue", align: "right" },
    ],
  },
  deadStock: {
    title: "Dead Stock",
    endpoint: "dead-stock",
    searchKeys: ["part", "sku", "category", "brand", "ageingBucket"],
    columns: [
      { key: "part", label: "Part" },
      { key: "sku", label: "SKU" },
      { key: "category", label: "Category" },
      { key: "stockLevel", label: "Stock", align: "right" },
      { key: "stockValue", label: "Stock Value", align: "right" },
      { key: "lastSoldAt", label: "Last Sold" },
      { key: "daysSinceLastSale", label: "Days Idle", align: "right" },
      { key: "ageingBucket", label: "Ageing" },
    ],
  },
  profitMargins: {
    title: "Profit Margins",
    endpoint: "profit-margins",
    searchKeys: ["dimensionType", "dimension"],
    columns: [
      { key: "dimensionType", label: "View" },
      { key: "dimension", label: "Item / Category / Brand / Supplier / Salesperson" },
      { key: "quantitySold", label: "Qty Sold", align: "right" },
      { key: "revenue", label: "Revenue", align: "right" },
      { key: "cogs", label: "COGS", align: "right" },
      { key: "grossProfit", label: "Profit", align: "right" },
      { key: "marginPercent", label: "Margin %", align: "right" },
    ],
  },
  purchaseReport: {
    title: "Purchase Report",
    endpoint: "purchase-report",
    searchKeys: ["productName", "supplierName", "reference"],
    columns: [
      { key: "date", label: "Date" },
      { key: "productName", label: "Part" },
      { key: "supplierName", label: "Supplier" },
      { key: "quantity", label: "Qty", align: "right" },
      { key: "unitCost", label: "Unit Cost", align: "right" },
      { key: "totalCost", label: "Total Cost", align: "right" },
      { key: "reference", label: "Reference" },
    ],
  },
  supplierPerformance: {
    title: "Supplier Performance",
    endpoint: "supplier-performance",
    searchKeys: ["supplierName"],
    columns: [
      { key: "supplierName", label: "Supplier" },
      { key: "purchaseOrders", label: "POs", align: "right" },
      { key: "receivedOrders", label: "Received", align: "right" },
      { key: "lateOrders", label: "Late", align: "right" },
      { key: "onTimeRate", label: "On-Time %", align: "right" },
      { key: "quantityReceived", label: "Qty Received", align: "right" },
      { key: "purchaseValue", label: "Purchase Value", align: "right" },
      { key: "warrantyReturns", label: "Warranty Returns", align: "right" },
      { key: "priceRange", label: "Price Range" },
    ],
  },
  customerCredit: {
    title: "Customer Credit",
    endpoint: "customer-credit",
    searchKeys: ["customerName", "lastPaymentAt"],
    columns: [
      { key: "customerName", label: "Customer" },
      { key: "invoices", label: "Invoices", align: "right" },
      { key: "totalInvoiced", label: "Invoiced", align: "right" },
      { key: "totalPaid", label: "Paid", align: "right" },
      { key: "balance", label: "Balance", align: "right" },
      { key: "overdueInvoices", label: "Overdue", align: "right" },
      { key: "overdueBalance", label: "Overdue Balance", align: "right" },
      { key: "lastPaymentAt", label: "Last Payment" },
    ],
  },
  salespersonPerformance: {
    title: "Salesperson Performance",
    endpoint: "salesperson-performance",
    searchKeys: ["userName"],
    columns: [
      { key: "userName", label: "Salesperson" },
      { key: "invoices", label: "Invoices", align: "right" },
      { key: "revenue", label: "Revenue", align: "right" },
      { key: "profit", label: "Profit", align: "right" },
      { key: "marginPercent", label: "Margin %", align: "right" },
      { key: "discounts", label: "Discounts", align: "right" },
      { key: "returns", label: "Returns", align: "right" },
    ],
  },
  categoryBrandPerformance: {
    title: "Category / Brand Performance",
    endpoint: "category-brand-performance",
    searchKeys: ["type", "name"],
    columns: [
      { key: "type", label: "View" },
      { key: "name", label: "Category / Brand" },
      { key: "lineCount", label: "Lines", align: "right" },
      { key: "quantitySold", label: "Qty Sold", align: "right" },
      { key: "revenue", label: "Revenue", align: "right" },
    ],
  },
  returnWarranty: {
    title: "Returns & Warranty",
    endpoint: "return-warranty",
    searchKeys: ["type", "reference", "customerName", "part", "reason", "status"],
    columns: [
      { key: "date", label: "Date" },
      { key: "type", label: "Type" },
      { key: "reference", label: "Reference" },
      { key: "customerName", label: "Customer" },
      { key: "part", label: "Part" },
      { key: "reason", label: "Reason" },
      { key: "status", label: "Status" },
      { key: "amount", label: "Amount", align: "right" },
    ],
  },
  reorderSuggestions: {
    title: "Reorder Suggestions",
    endpoint: "reorder-suggestions",
    searchKeys: ["part", "sku", "category"],
    columns: [
      { key: "part", label: "Part" },
      { key: "sku", label: "SKU" },
      { key: "category", label: "Category" },
      { key: "stockLevel", label: "Stock", align: "right" },
      { key: "lowStockThreshold", label: "Min", align: "right" },
      { key: "soldInPeriod", label: "Sold", align: "right" },
      { key: "dailyVelocity", label: "Daily Velocity", align: "right" },
      { key: "suggestedQty", label: "Reorder Qty", align: "right" },
      { key: "estimatedCost", label: "Est. Cost", align: "right" },
    ],
  },
  priceChanges: {
    title: "Price Changes",
    endpoint: "price-changes",
    searchKeys: ["part", "sku", "category", "reason", "changedBy"],
    columns: [
      { key: "date", label: "Date" },
      { key: "part", label: "Part" },
      { key: "sku", label: "SKU" },
      { key: "oldPrice", label: "Old Price", align: "right" },
      { key: "newPrice", label: "New Price", align: "right" },
      { key: "change", label: "Change", align: "right" },
      { key: "changePercent", label: "Change %", align: "right" },
      { key: "reason", label: "Reason" },
      { key: "changedBy", label: "Changed By" },
    ],
  },
};

function buildReportUrl(companyId: number, endpoint: string, dateRange: { from: Date; to: Date }) {
  return `/api/companies/${companyId}/reports/${endpoint}?startDate=${dateRange.from.toISOString()}&endDate=${dateRange.to.toISOString()}`;
}

function AutoSparesReportTable({
  configKey,
  companyId,
  dateRange,
  search,
}: ReportProps & { configKey: keyof typeof REPORTS }) {
  const config = REPORTS[configKey];
  const { data = [], isLoading, error } = useQuery<any[]>({
    queryKey: ["auto-spares-report", config.endpoint, companyId, dateRange.from, dateRange.to],
    queryFn: async () => {
      const res = await apiFetch(buildReportUrl(companyId, config.endpoint, dateRange));
      if (!res.ok) throw new Error(`Failed to load ${config.title} (${res.status})`);
      return res.json();
    },
    enabled: !!companyId,
  });

  const filtered = filterRecords(data, search, config.searchKeys);

  if (isLoading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-5 w-5 animate-spin text-violet-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[220px] items-center justify-center text-slate-400">
        Failed to load report
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-2">
        <span className="text-xs font-bold uppercase tracking-widest text-slate-500">
          {config.title}
        </span>
        <span className="text-xs font-black text-slate-700">
          {filtered.length} rows
        </span>
      </div>
      {filtered.length === 0 ? (
        <div className="flex min-h-[220px] items-center justify-center text-slate-400">
          No records found for this period
        </div>
      ) : (
        <table className="w-full text-xs">
          <thead className="sticky top-[41px] z-10 border-b border-slate-100 bg-white">
            <tr>
              {config.columns.map((column) => (
                <th
                  key={column.key}
                  className={cn(
                    "px-4 py-2 font-bold text-slate-500",
                    column.align === "right" ? "text-right" : column.align === "center" ? "text-center" : "text-left",
                  )}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, index) => (
              <tr key={row.id || row.adjustmentId || row.productId || row.reference || index} className="border-b border-slate-50 hover:bg-slate-50">
                {config.columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn(
                      "px-4 py-2 text-slate-700",
                      column.align === "right" ? "text-right font-semibold tabular-nums" : column.align === "center" ? "text-center" : "text-left",
                    )}
                  >
                    {row[column.key] ?? "-"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function AutoSparesDailySalesReport(props: ReportProps) {
  return <AutoSparesReportTable {...props} configKey="dailySales" />;
}

export function TopSellingPartsReport(props: ReportProps) {
  return <AutoSparesReportTable {...props} configKey="topSellingParts" />;
}

export function DeadStockReport(props: ReportProps) {
  return <AutoSparesReportTable {...props} configKey="deadStock" />;
}

export function ProfitMarginsReport(props: ReportProps) {
  return <AutoSparesReportTable {...props} configKey="profitMargins" />;
}

export function PurchaseReport(props: ReportProps) {
  return <AutoSparesReportTable {...props} configKey="purchaseReport" />;
}

export function SupplierPerformanceReport(props: ReportProps) {
  return <AutoSparesReportTable {...props} configKey="supplierPerformance" />;
}

export function CustomerCreditReport(props: ReportProps) {
  return <AutoSparesReportTable {...props} configKey="customerCredit" />;
}

export function SalespersonPerformanceReport(props: ReportProps) {
  return <AutoSparesReportTable {...props} configKey="salespersonPerformance" />;
}

export function CategoryBrandPerformanceReport(props: ReportProps) {
  return <AutoSparesReportTable {...props} configKey="categoryBrandPerformance" />;
}

export function ReturnWarrantyReport(props: ReportProps) {
  return <AutoSparesReportTable {...props} configKey="returnWarranty" />;
}

export function ReorderSuggestionsReport(props: ReportProps) {
  return <AutoSparesReportTable {...props} configKey="reorderSuggestions" />;
}

export function PriceChangesReport(props: ReportProps) {
  return <AutoSparesReportTable {...props} configKey="priceChanges" />;
}
