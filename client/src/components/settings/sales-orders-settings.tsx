import { useSalesOrderSettings, useUpdateSalesOrderSettings } from "@/hooks/use-sales-orders";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { Save, Loader2, Plane, Ship, Clock, ShoppingCart } from "lucide-react";

export function SalesOrdersSettings({ companyId }: { companyId: number }) {
  const { data: settings, isLoading } = useSalesOrderSettings(companyId);
  const updateSettings = useUpdateSalesOrderSettings();
  const { toast } = useToast();

  const [airPct, setAirPct] = useState("50.00");
  const [seaPct, setSeaPct] = useState("30.00");
  const [laybyPct, setLaybyPct] = useState("10.00");
  const [laybyMonths, setLaybyMonths] = useState(3);

  useEffect(() => {
    if (settings) {
      setAirPct(settings.airPreorderMinDepositPct || "50.00");
      setSeaPct(settings.seaPreorderMinDepositPct || "30.00");
      setLaybyPct(settings.laybyMinDepositPct || "10.00");
      setLaybyMonths(settings.laybyDefaultDurationMonths || 3);
    }
  }, [settings]);

  const handleSave = async () => {
    try {
      await updateSettings.mutateAsync({
        companyId,
        airPreorderMinDepositPct: parseFloat(airPct),
        seaPreorderMinDepositPct: parseFloat(seaPct),
        laybyMinDepositPct: parseFloat(laybyPct),
        laybyDefaultDurationMonths: parseInt(laybyMonths.toString()),
      });
      toast({ title: "Sales Order Settings Saved", description: "Deposit percentages and thresholds updated." });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  if (isLoading) {
    return <div className="p-8 text-center text-slate-500"><Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />Loading settings...</div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Plane className="w-4 h-4 text-sky-600" />
            Preorder Deposit Requirements
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Air Freight Min Deposit %</Label>
              <div className="relative">
                <Input
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  value={airPct}
                  onChange={(e) => setAirPct(e.target.value)}
                  className="pr-8"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">%</span>
              </div>
              <p className="text-xs text-slate-500">Air preorders with deposit below this % will trigger mandatory admin approval.</p>
            </div>

            <div className="space-y-2">
              <Label>Sea Freight Min Deposit %</Label>
              <div className="relative">
                <Input
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  value={seaPct}
                  onChange={(e) => setSeaPct(e.target.value)}
                  className="pr-8"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">%</span>
              </div>
              <p className="text-xs text-slate-500">Sea preorders with deposit below this % will trigger mandatory admin approval.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-4 h-4 text-indigo-600" />
            Lay-by Rules & Default Duration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Minimum Lay-by Initial Deposit %</Label>
              <div className="relative">
                <Input
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  value={laybyPct}
                  onChange={(e) => setLaybyPct(e.target.value)}
                  className="pr-8"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">%</span>
              </div>
              <p className="text-xs text-slate-500">Recommended minimum initial down payment for starting a lay-by agreement.</p>
            </div>

            <div className="space-y-2">
              <Label>Default Duration (Months)</Label>
              <Input
                type="number"
                min="1"
                max="12"
                value={laybyMonths}
                onChange={(e) => setLaybyMonths(parseInt(e.target.value) || 3)}
              />
              <p className="text-xs text-slate-500">Default payment plan length in months (e.g. 3 or 6 months).</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={updateSettings.isPending} className="bg-blue-600 hover:bg-blue-700 text-white">
          {updateSettings.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Save Sales Order Settings
        </Button>
      </div>
    </div>
  );
}
