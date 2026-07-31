import { useState } from "react";
import { Settings2, Calculator, Briefcase, DollarSign, MinusCircle, Scale } from "lucide-react";
import { HRLayout } from "./layout";
import { cn } from "@/lib/utils";
import { TaxTablesTab } from "./tax-setup";
import { PayGradesTab } from "./pay-grades";
import { IncomesTab } from "./incomes-setup";
import { DeductionsTab } from "./deductions-setup";
import { StatutoryTab } from "./statutory-setup";

const TABS = [
  { id: "taxes", label: "Tax Tables", description: "PAYE brackets, NSSA limits, AIDS levy", icon: Calculator },
  { id: "pay-grades", label: "Pay Grades", description: "Salary bands and structures", icon: Briefcase },
  { id: "incomes", label: "Earnings", description: "Earning types and income categories", icon: DollarSign },
  { id: "deductions", label: "Deductions", description: "Company and voluntary deductions", icon: MinusCircle },
  { id: "statutory", label: "Statutory", description: "Statutory rates and logic rules", icon: Scale },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function HRSetup() {
  const [tab, setTab] = useState<TabId>("taxes");

  return (
    <HRLayout>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-3">
            <Settings2 className="w-8 h-8 text-blue-600" />
            Payroll Settings
          </h1>
          <p className="text-muted-foreground mt-1">
            One place to configure everything the payroll engine uses: tax tables, pay grades,
            earnings, deductions, and statutory rates.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 overflow-x-auto pb-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex-1 text-left rounded-xl border px-4 py-3 transition-all duration-200",
                tab === t.id
                  ? "bg-blue-50/70 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800 shadow-sm"
                  : "bg-white/50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50"
              )}
            >
              <div className="flex items-center gap-2">
                <t.icon className={cn("h-4 w-4 shrink-0", tab === t.id ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground")} />
                <span className={cn("font-medium text-sm", tab === t.id ? "text-blue-700 dark:text-blue-300" : "text-foreground")}>
                  {t.label}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1 hidden sm:block">{t.description}</p>
            </button>
          ))}
        </div>

        <div key={tab} className="animate-in fade-in slide-in-from-bottom-2 duration-300">
          {tab === "taxes" && <TaxTablesTab />}
          {tab === "pay-grades" && <PayGradesTab />}
          {tab === "incomes" && <IncomesTab />}
          {tab === "deductions" && <DeductionsTab />}
          {tab === "statutory" && <StatutoryTab />}
        </div>
      </div>
    </HRLayout>
  );
}
