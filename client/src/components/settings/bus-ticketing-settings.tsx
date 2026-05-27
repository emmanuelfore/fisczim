import { BUS_FEATURES, normalizeBusSettings, type BusFeatureKey } from "@shared/bus-settings";
import type React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Bus, Settings2 } from "lucide-react";

interface Props {
  formData: any;
  setFormData: React.Dispatch<React.SetStateAction<any>>;
}

export function BusTicketingSettings({ formData, setFormData }: Props) {
  const settings = normalizeBusSettings(formData.busSettings);

  const updateEnabled = (enabled: boolean) => {
    setFormData((prev: any) => ({
      ...prev,
      busSettings: {
        ...normalizeBusSettings(prev.busSettings),
        enabled,
      },
    }));
  };

  const updateFeature = (key: BusFeatureKey, enabled: boolean) => {
    setFormData((prev: any) => {
      const current = normalizeBusSettings(prev.busSettings);
      return {
        ...prev,
        busSettings: {
          ...current,
          features: {
            ...current.features,
            [key]: enabled,
          },
        },
      };
    });
  };

  const grouped = BUS_FEATURES.reduce((acc, feature) => {
    acc[feature.group] = [...(acc[feature.group] || []), feature];
    return acc;
  }, {} as Record<string, typeof BUS_FEATURES>);

  return (
    <div className="space-y-5">
      <Card className="border-[#E5E7EB] shadow-sm">
        <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#EFF6FF] text-[#2563EB]">
              <Bus className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#0F172A]">Bus Ticketing Module</h2>
              <p className="mt-1 max-w-2xl text-sm text-[#64748B]">
                Choose which bus-ticketing tools appear in the web admin and conductor APK.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-2">
            <Badge variant={settings.enabled ? "default" : "secondary"} className="rounded-md">
              {settings.enabled ? "Enabled" : "Hidden"}
            </Badge>
            <Switch checked={settings.enabled} onCheckedChange={updateEnabled} />
          </div>
        </CardContent>
      </Card>

      {Object.entries(grouped).map(([group, features]) => (
        <Card key={group} className="border-[#E5E7EB] shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-[#0F172A]">
              <Settings2 className="h-4 w-4 text-[#2563EB]" />
              {group}
            </CardTitle>
            <CardDescription>Turn off anything you do not want users to see yet.</CardDescription>
          </CardHeader>
          <CardContent className="divide-y divide-[#E5E7EB] p-0">
            {features.map((feature) => (
              <div key={feature.key} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="pr-4">
                  <div className="text-sm font-semibold text-[#0F172A]">{feature.label}</div>
                  <div className="mt-1 text-xs text-[#64748B]">{feature.description}</div>
                </div>
                <Switch
                  checked={settings.enabled && settings.features[feature.key]}
                  disabled={!settings.enabled}
                  onCheckedChange={(enabled) => updateFeature(feature.key, enabled)}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
