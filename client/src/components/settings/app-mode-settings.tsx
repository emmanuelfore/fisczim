import { APP_MODES, normalizeAppMode, type AppMode } from "@shared/app-mode";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bus, MonitorCheck, Utensils } from "lucide-react";
import { useState, type Dispatch, type SetStateAction } from "react";

interface Props {
  formData: any;
  setFormData: Dispatch<SetStateAction<any>>;
  onSave?: (data: any) => Promise<void>;
}

const icons: Record<AppMode, any> = {
  pos: MonitorCheck,
  restaurant: Utensils,
  bus_ticketing: Bus,
};

export function AppModeSettings({ formData, setFormData, onSave }: Props) {
  const selected = normalizeAppMode(formData.appMode);
  const [savingMode, setSavingMode] = useState<AppMode | null>(null);

  const setMode = (mode: AppMode) => {
    const nextData = { ...formData, appMode: mode };
    if (mode === "bus_ticketing") {
      nextData.busSettings = { ...(formData.busSettings || {}), enabled: true };
    }
    if (mode === "restaurant") {
      nextData.restaurantSettings = {
        ...(formData.restaurantSettings || {}),
        enabled: true,
      };
    }
    setFormData(nextData);
    if (onSave) {
      setSavingMode(mode);
      Promise.resolve()
        .then(() => onSave(nextData))
        .finally(() => setSavingMode(null));
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-[#0F172A]">App Mode</h2>
        <p className="mt-1  text-[#64748B]">
          Choose the operating mode for this company so admin and mobile menus
          stay focused.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {APP_MODES.map((mode) => {
          const Icon = icons[mode.key];
          const active = selected === mode.key;
          return (
            <button
              key={mode.key}
              type="button"
              onClick={() => setMode(mode.key)}
              className="text-left"
            >
              <Card
                className={`h-full border transition ${active ? "border-[#2563EB] bg-[#EFF6FF] shadow-sm" : "border-[#E5E7EB] hover:border-[#CBD5E1]"}`}
              >
                <CardContent className="p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div
                      className={`flex h-11 w-11 items-center justify-center rounded-lg ${active ? "bg-[#2563EB] text-white" : "bg-[#F8FAFC] text-[#64748B]"}`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    {active && (
                      <Badge className="rounded-md">
                        {savingMode === mode.key ? "Saving" : "Active"}
                      </Badge>
                    )}
                  </div>
                  <h3 className="mt-4 text-base font-bold text-[#0F172A]">
                    {mode.label}
                  </h3>
                  <p className="mt-2  leading-5 text-[#64748B]">
                    {mode.description}
                  </p>
                </CardContent>
              </Card>
            </button>
          );
        })}
      </div>
    </div>
  );
}
