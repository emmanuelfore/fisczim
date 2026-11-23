import { useQuery } from "@tanstack/react-query";
import type { Dispatch, SetStateAction } from "react";
import { type Account } from "@shared/schema";
import {
  DEFAULT_ACCOUNTING_SYSTEM_ACCOUNTS,
  mergeAccountingSystemAccounts,
  type AccountingSystemAccountKey,
} from "@shared/accounting-defaults";
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
import { Button } from "@/components/ui/button";
import { accountingKey, fetchAccounting } from "@/lib/accounting-query";

type Props = {
  companyId: number;
  formData: any;
  setFormData: Dispatch<SetStateAction<any>>;
};

const SYSTEM_POSTINGS = [
  {
    key: "cashAccountCode",
    label: "Cash receipts and payments",
    hint: "Used when payments are recorded without a more specific bank account.",
  },
  {
    key: "accountsReceivableCode",
    label: "Customer receivables",
    hint: "Debit on sales invoices, credit when customers pay.",
  },
  {
    key: "salesRevenueAccountCode",
    label: "Sales revenue",
    hint: "Credit side of invoices and POS sales.",
  },
  {
    key: "vatOutputAccountCode",
    label: "VAT output",
    hint: "Output tax collected on customer invoices.",
  },
  {
    key: "inventoryAccountCode",
    label: "Inventory control",
    hint: "Stock value relieved when tracked products are sold.",
  },
  {
    key: "cogsAccountCode",
    label: "Cost of sales",
    hint: "Expense account for product costs on sales.",
  },
  {
    key: "accountsPayableCode",
    label: "Supplier payables",
    hint: "Credit side of supplier bills, debit when suppliers are paid.",
  },
  {
    key: "vatInputAccountCode",
    label: "VAT input",
    hint: "Input tax on supplier bills.",
  },
  {
    key: "generalExpenseAccountCode",
    label: "General expenses",
    hint: "Default debit account for expenses.",
  },
  {
    key: "fxGainAccountCode",
    label: "Foreign exchange gains",
    hint: "Automatic gains when settlement rates move favorably.",
  },
  {
    key: "fxLossAccountCode",
    label: "Foreign exchange losses",
    hint: "Automatic losses when settlement rates move unfavorably.",
  },
  {
    key: "busConductorCashAccountCode",
    label: "Bus conductor cash clearing",
    hint: "Debit account for cash tickets issued by conductors before cash-up.",
  },
  {
    key: "busCashOnHandAccountCode",
    label: "Bus cash received",
    hint: "Debit account when approved conductor cash-ups are counted into office cash.",
  },
  {
    key: "busMobileMoneyAccountCode",
    label: "Bus mobile money clearing",
    hint: "Debit account for bus tickets paid by EcoCash or mobile wallet.",
  },
  {
    key: "busCardClearingAccountCode",
    label: "Bus card and bank clearing",
    hint: "Debit account for card, swipe, and bank transfer bus ticket payments.",
  },
  {
    key: "busRevenueAccountCode",
    label: "Bus passenger revenue",
    hint: "Credit account for non-fiscal bus ticket revenue postings.",
  },
  {
    key: "busCashShortageAccountCode",
    label: "Bus cash shortages",
    hint: "Debit expense account when approved cash-ups are short.",
  },
  {
    key: "busCashOverageAccountCode",
    label: "Bus cash overages",
    hint: "Credit income account when approved cash-ups are over.",
  },
] as const;

export function AccountingSystemSettings({
  companyId,
  formData,
  setFormData,
}: Props) {
  const {
    data: accounts = [],
    isLoading,
    isError,
    refetch,
  } = useQuery<Account[]>({
    queryKey: accountingKey("accounts", companyId),
    enabled: !!companyId,
    queryFn: () =>
      fetchAccounting<Account[]>(
        `/api/companies/${companyId}/accounting/accounts`,
      ),
  });

  const settings = mergeAccountingSystemAccounts(formData.accountingSettings);

  const updateSetting = (key: AccountingSystemAccountKey, value: string) => {
    setFormData((prev: any) => {
      const existing = prev.accountingSettings?.[key];
      if (existing === value || (!existing && value === DEFAULT_ACCOUNTING_SYSTEM_ACCOUNTS[key])) {
        return prev;
      }
      return {
        ...prev,
        accountingSettings: {
          ...(prev.accountingSettings || {}),
          [key]: value,
        },
      };
    });
  };

  return (
    <Card>
      <CardHeader className="border-b border-[#E5E7EB]">
        <CardTitle>System Transaction Accounts</CardTitle>
        <CardDescription>
          Choose the GL accounts used by automatic postings for sales, payments,
          VAT, inventory, suppliers, expenses, FX, and bus ticketing.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-5">
        {isError && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-[10px] border border-rose-200 bg-rose-50 px-4 py-3">
            <p className="text-sm font-semibold text-rose-700">
              Could not load the chart of accounts.
            </p>
            <Button variant="outline" size="sm" className="shrink-0 rounded-lg" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          {SYSTEM_POSTINGS.map((item) => (
            <div
              key={item.key}
              className="space-y-2 rounded-[10px] border border-[#E5E7EB] bg-[#F8FAFC] p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Label
                    htmlFor={`accounting-setting-${item.key}`}
                    className=" font-semibold text-[#0F172A]"
                  >
                    {item.label}
                  </Label>
                  <p className="mt-1 text-xs leading-5 text-[#64748B]">
                    {item.hint}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className="shrink-0 bg-white font-mono text-[11px]"
                >
                  {settings[item.key]}
                </Badge>
              </div>
              <Select
                value={settings[item.key]}
                onValueChange={(value) => updateSetting(item.key, value)}
                disabled={isLoading}
              >
                <SelectTrigger
                  id={`accounting-setting-${item.key}`}
                  className="h-10 bg-white"
                >
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
