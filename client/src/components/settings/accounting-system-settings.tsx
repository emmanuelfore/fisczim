import { useQuery } from "@tanstack/react-query";
import type { Dispatch, SetStateAction } from "react";
import { type Account } from "@shared/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api";

type Props = {
  companyId: number;
  formData: any;
  setFormData: Dispatch<SetStateAction<any>>;
};

const DEFAULT_ACCOUNTING_SETTINGS = {
  cashAccountCode: "1000",
  accountsReceivableCode: "1200",
  inventoryAccountCode: "1300",
  accountsPayableCode: "2000",
  vatOutputAccountCode: "2100",
  vatInputAccountCode: "2110",
  salesRevenueAccountCode: "4000",
  cogsAccountCode: "5000",
  generalExpenseAccountCode: "5100",
  fxGainAccountCode: "4900",
  fxLossAccountCode: "5900",
};

const SYSTEM_POSTINGS = [
  { key: "cashAccountCode", label: "Cash receipts and payments", hint: "Used when payments are recorded without a more specific bank account." },
  { key: "accountsReceivableCode", label: "Customer receivables", hint: "Debit on sales invoices, credit when customers pay." },
  { key: "salesRevenueAccountCode", label: "Sales revenue", hint: "Credit side of invoices and POS sales." },
  { key: "vatOutputAccountCode", label: "VAT output", hint: "Output tax collected on customer invoices." },
  { key: "inventoryAccountCode", label: "Inventory control", hint: "Stock value relieved when tracked products are sold." },
  { key: "cogsAccountCode", label: "Cost of sales", hint: "Expense account for product costs on sales." },
  { key: "accountsPayableCode", label: "Supplier payables", hint: "Credit side of supplier bills, debit when suppliers are paid." },
  { key: "vatInputAccountCode", label: "VAT input", hint: "Input tax on supplier bills." },
  { key: "generalExpenseAccountCode", label: "General expenses", hint: "Default debit account for expenses." },
  { key: "fxGainAccountCode", label: "Foreign exchange gains", hint: "Automatic gains when settlement rates move favorably." },
  { key: "fxLossAccountCode", label: "Foreign exchange losses", hint: "Automatic losses when settlement rates move unfavorably." },
] as const;

export function AccountingSystemSettings({ companyId, formData, setFormData }: Props) {
  const { data: accounts = [], isLoading } = useQuery<Account[]>({
    queryKey: ["/api/accounting/accounts", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const res = await apiFetch(`/api/companies/${companyId}/accounting/accounts`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(err.message || "Failed to load chart of accounts");
      }
      return res.json();
    },
  });

  const settings = {
    ...DEFAULT_ACCOUNTING_SETTINGS,
    ...(formData.accountingSettings || {}),
  };

  const updateSetting = (key: string, value: string) => {
    setFormData((prev: any) => ({
      ...prev,
      accountingSettings: {
        ...DEFAULT_ACCOUNTING_SETTINGS,
        ...(prev.accountingSettings || {}),
        [key]: value,
      },
    }));
  };

  return (
    <Card>
      <CardHeader className="border-b border-[#E5E7EB]">
        <CardTitle>System Transaction Accounts</CardTitle>
        <CardDescription>
          Choose the GL accounts used by automatic postings for sales, payments, VAT, inventory, suppliers, expenses and FX.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-5">
        <div className="grid gap-4 md:grid-cols-2">
          {SYSTEM_POSTINGS.map((item) => (
            <div key={item.key} className="space-y-2 rounded-[10px] border border-[#E5E7EB] bg-[#F8FAFC] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Label className="text-sm font-semibold text-[#0F172A]">{item.label}</Label>
                  <p className="mt-1 text-xs leading-5 text-[#64748B]">{item.hint}</p>
                </div>
                <Badge variant="outline" className="shrink-0 bg-white font-mono text-[11px]">
                  {settings[item.key]}
                </Badge>
              </div>
              <Select
                value={settings[item.key]}
                onValueChange={(value) => updateSetting(item.key, value)}
                disabled={isLoading}
              >
                <SelectTrigger className="h-10 bg-white">
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.code}>
                      {account.code} - {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
