import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/lib/i18n";
import { 
  ClipboardList, 
  Truck, 
  Package, 
  Factory, 
  Calculator, 
  Briefcase, 
  Users, 
  ShieldCheck 
} from "lucide-react";
import type { Dispatch, SetStateAction } from "react";

interface Props {
  formData: any;
  setFormData: Dispatch<SetStateAction<any>>;
}

export function FeatureSettings({ formData, setFormData }: Props) {
  const { t } = useI18n();
  const features = formData.featureSettings || {};

  const toggleFeature = (key: string, value: boolean) => {
    setFormData((prev: any) => ({
      ...prev,
      featureSettings: {
        ...(prev.featureSettings || {}),
        [key]: value
      }
    }));
  };

  const modules = [
    {
      key: "procurement",
      label: t("Procurement"),
      description: t("Purchase orders, goods received, and supplier management."),
      icon: ClipboardList
    },
    {
      key: "freight",
      label: t("Freight & Logistics"),
      description: t("Consignments, freight forwarders, and receiving workflows."),
      icon: Truck
    },
    {
      key: "inventory",
      label: t("Inventory"),
      description: t("Stock tracking, adjustments, transfers, and locations."),
      icon: Package
    },
    {
      key: "manufacturing",
      label: t("Manufacturing"),
      description: t("BOMs, production runs, work centers, and MRP analysis."),
      icon: Factory
    },
    {
      key: "finance",
      label: t("Finance & Accounting"),
      description: t("Journals, cashbook, trial balance, and financial reports."),
      icon: Calculator
    },
    {
      key: "fixedAssets",
      label: t("Fixed Assets"),
      description: t("Asset registry and depreciation records."),
      icon: Briefcase
    },
    {
      key: "hr",
      label: t("HR & Payroll"),
      description: t("Employees, payroll processing, leave, and loans."),
      icon: Users
    },
    {
      key: "tax",
      label: t("Tax & Compliance"),
      description: t("ZIMRA integration logs, VAT returns, and audit trails."),
      icon: ShieldCheck
    }
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-[#0F172A]">{t("Modules & Features")}</h2>
        <p className="mt-1 text-sm text-[#64748B]">
          {t("Enable or disable specific modules for your organization. Disabled modules will be hidden from the sidebar.")}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {modules.map((mod) => {
          const Icon = mod.icon;
          // By default, if a feature is not explicitly set to false, we consider it enabled.
          const isEnabled = features[mod.key] !== false;

          return (
            <Card key={mod.key} className="border border-[#E5E7EB] shadow-sm">
              <CardContent className="p-5 flex items-start gap-4">
                <div className={`mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${isEnabled ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-400"}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <h3 className={`text-base font-semibold ${isEnabled ? "text-slate-900" : "text-slate-500"}`}>
                      {mod.label}
                    </h3>
                    <Switch
                      checked={isEnabled}
                      onCheckedChange={(checked) => toggleFeature(mod.key, checked)}
                    />
                  </div>
                  <p className="text-sm text-slate-500 leading-relaxed">
                    {mod.description}
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
