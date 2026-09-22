// LEKAKU device setup — mirrors main's ZIMRA card's TEST/PRODUCTION toggle
// and subscription header, but uses RSL LEKAKU endpoints.
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { LEKAKU_TEST_GATEWAY, LEKAKU_PROD_GATEWAY, getLekakuGatewayUrl } from "@shared/lekaku";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Server, Loader2, Pencil, RefreshCw, Zap, ShieldCheck } from "lucide-react";
import { getZimraErrorMessage } from "@/lib/zimra-errors";
import { useBranchContext } from "@/lib/branch-context";

function cleanDeviceId(value: unknown) {
  const text = String(value || "").trim();
  return text && !text.includes("@") ? text : "";
}

export function LekakuDeviceConfig({ company }: { company: any }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { selectedBranch } = useBranchContext();
  const activeDeviceId = cleanDeviceId(selectedBranch?.fdmsDeviceId) || cleanDeviceId(company.fdmsDeviceId);
  const activeActivationKey = selectedBranch?.fdmsApiKey || company.fdmsApiKey || "";
  const activeSerialNo = selectedBranch?.fdmsDeviceSerialNo || company.fdmsDeviceSerialNo || "";
  const [deviceId, setDeviceId] = useState(activeDeviceId);
  const [activationKey, setActivationKey] = useState(activeActivationKey);
  const [deviceSerialNo, setDeviceSerialNo] = useState(activeSerialNo);
  const [verificationResult, setVerificationResult] = useState<any>(null);
  const [isEditing, setIsEditing] = useState(false);

  const isRegistered = !!activeDeviceId && !!(selectedBranch?.zimraCertificate || company.zimraCertificate);
  const savedSerial = activeSerialNo;

  useEffect(() => {
    if (!isEditing) {
      setDeviceId(activeDeviceId);
      setActivationKey(activeActivationKey);
      setDeviceSerialNo(activeSerialNo);
    }
  }, [activeDeviceId, activeActivationKey, activeSerialNo, isEditing]);

  const verifyTaxpayerMutation = useMutation({
    mutationFn: async () => {
      const base = (company.lekakuGatewayUrl || getLekakuGatewayUrl(company.zimraEnvironment)).trim();
      const res = await apiFetch(`/api/companies/${company.id}/lekaku/verify-taxpayer`, {
        method: "POST",
        body: JSON.stringify({ deviceId, activationKey, deviceSerialNo, gatewayUrl: base }),
      });
      if (!res.ok) throw await res.json();
      return await res.json();
    },
    onSuccess: (data) => {
      setVerificationResult(data);
      toast({ title: "Taxpayer Verified", description: `Name: ${data.taxPayerName}, TIN: ${data.taxPayerTIN}` });
    },
    onError: (err: any) => {
      const zimraErr = getZimraErrorMessage(err.zimraErrorCode, undefined, "RSL");
      toast({ title: zimraErr.title, description: err.message || zimraErr.message, variant: "destructive" });
    },
  });

  const registerDeviceMutation = useMutation({
    mutationFn: async () => {
      const base = (company.lekakuGatewayUrl || getLekakuGatewayUrl(company.zimraEnvironment)).trim();
      const res = await apiFetch(`/api/companies/${company.id}/lekaku/register`, {
        method: "POST",
        body: JSON.stringify({ deviceId, activationKey, deviceSerialNo, gatewayUrl: base }),
      });
      if (!res.ok) throw await res.json();
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      setIsEditing(false);
      toast({ title: "Device Registered Successfully!", className: "bg-green-100 text-green-900" });
    },
    onError: (err: any) => {
      const zimraErr = getZimraErrorMessage(err.zimraErrorCode, undefined, "RSL");
      toast({ title: zimraErr.title, description: err.message || zimraErr.message, variant: "destructive" });
    },
  });

  const switchEnvironmentMutation = useMutation({
    mutationFn: async (env: string) => {
      const res = await apiFetch(`/api/companies/${company.id}/lekaku/environment`, {
        method: "POST",
        body: JSON.stringify({ environment: env }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to switch environment");
      }
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      const env = data.currentEnvironment || "unknown";
      toast({ title: "Environment Switched", description: `Now using RSL ${env.toUpperCase()} endpoint.`, className: "bg-blue-600 text-white" });
    },
    onError: (err: Error) => {
      toast({ title: "Switch Failed", description: err.message, variant: "destructive" });
    },
  });

  const syncConfigMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch(`/api/companies/${company.id}/lekaku/config/sync`, { method: "POST" });
      if (!res.ok) throw await res.json();
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      const parts = [`${data.added ?? 0} added`, `${data.updated ?? 0} updated`];
      if (data.remap) parts.push(`${data.remap.remappedProducts ?? 0} products remapped`);
      if (data.remap?.unmapped?.length) parts.push(`${data.remap.unmapped.length} need attention`);
      toast({ title: "RSL Tax Config Synced", description: `${parts.join(" • ")} (${data.environment || "test"})`, className: "bg-green-100 text-green-900" });
    },
    onError: (err: any) => {
      const zimraErr = getZimraErrorMessage(err.zimraErrorCode, undefined, "RSL");
      toast({ title: "Sync Failed", description: err.message || zimraErr.message, variant: "destructive" });
    },
  });

  const { data: subscriptions = [] } = useQuery({
    queryKey: [`/api/companies/${company.id}/subscriptions`],
    queryFn: async () => {
      const res = await apiFetch(`/api/companies/${company.id}/subscriptions`);
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
  });
  const macAddress = company.registeredMacAddress || "";
  const hasActiveSubForThisMachine = (Array.isArray(subscriptions) ? subscriptions : []).some((s: any) => s.status === "paid" && s.deviceMacAddress === macAddress && new Date(s.endDate) > new Date());
  const effectiveGateway = (company.lekakuGatewayUrl || getLekakuGatewayUrl(company.zimraEnvironment)).trim();

  return (
    <div className="space-y-6">
      {/* Environment Toggle — exactly like main */}
      <div className="bg-slate-100 p-1 rounded-lg flex items-center w-fit mb-6">
        <Button variant={company.zimraEnvironment === "test" ? "default" : "ghost"} size="sm" className="rounded-md px-4 h-8 text-xs font-bold" onClick={() => switchEnvironmentMutation.mutate("test")} disabled={switchEnvironmentMutation.isPending || company.zimraEnvironment === "test"}>TEST</Button>
        <Button variant={company.zimraEnvironment === "production" ? "destructive" : "ghost"} size="sm" className={`rounded-md px-4 h-8 text-xs font-bold ${company.zimraEnvironment === "production" ? "bg-red-600 hover:bg-red-700" : ""}`} onClick={() => { if (!hasActiveSubForThisMachine && company.subscriptionStatus !== "active") { toast({ title: "Subscription Required", description: "An active subscription is required to switch to Production mode.", variant: "destructive" }); return; } if (confirm("⚠️ CAUTION: You are about to switch to the RSL PRODUCTION environment. Real fiscal data will be submitted. Are you sure?")) switchEnvironmentMutation.mutate("production"); }} disabled={switchEnvironmentMutation.isPending || company.zimraEnvironment === "production"}>PRODUCTION</Button>
      </div>

      <div className="flex items-center justify-between mb-2 p-2 bg-emerald-50 border border-emerald-200 rounded-lg">
        <span className="text-xs font-mono text-emerald-800">RSL gateway: {effectiveGateway}</span>
        <span className="text-[10px] text-emerald-600">{company.zimraEnvironment === "production" ? LEKAKU_PROD_GATEWAY : LEKAKU_TEST_GATEWAY}</span>
      </div>

      <div className="flex items-center justify-between mb-6 p-3 bg-slate-50 border rounded-lg">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-full ${company.subscriptionStatus === "active" ? "bg-green-100" : "bg-slate-100"}`}><Zap className={`w-4 h-4 ${company.subscriptionStatus === "active" ? "text-green-600" : "text-slate-400"}`} /></div>
          <div>
            <p className="text-xs font-semibold text-slate-700">Device Subscription</p>
            <div className="flex items-center gap-2">
              {company.subscriptionStatus === "active" ? (<Badge variant="outline" className="text-[10px] h-4 bg-green-50 text-green-700 border-green-200"><ShieldCheck className="w-2.5 h-2.5 mr-1" />ACTIVE</Badge>) : (<Badge variant="outline" className="text-[10px] h-4 bg-slate-50 text-slate-500">INACTIVE</Badge>)}
              {company.subscriptionEndDate && (<span className="text-[10px] text-slate-400">Exp: {new Date(company.subscriptionEndDate).toLocaleDateString()}</span>)}
            </div>
          </div>
        </div>
        <Link href="/subscription"><Button variant="outline" size="sm" className="h-8 text-xs">Manage</Button></Link>
      </div>

      <Card className="card-depth border-none h-fit">
        <CardHeader>
          <CardTitle className="flex items-center"><Server className="w-5 h-5 mr-2 text-emerald-700" />RSL Fiscal Device</CardTitle>
          <CardDescription>Configure your RSL device — pointed at {effectiveGateway}/Public/v1/&lt;deviceID&gt;/RegisterDevice</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Device ID</Label><Input value={deviceId} onChange={(e) => setDeviceId(cleanDeviceId(e.target.value))} placeholder="Device ID" disabled={isRegistered && !isEditing} /></div>
            <div className="space-y-2"><Label>Activation Key</Label><Input value={activationKey} onChange={(e) => setActivationKey(e.target.value)} placeholder="Activation Key" disabled={isRegistered && !isEditing} /></div>
            <div className="space-y-2 md:col-span-2"><Label>Device Serial Number</Label><Input value={deviceSerialNo} onChange={(e) => setDeviceSerialNo(e.target.value)} placeholder={savedSerial || "Device serial number"} /></div>
          </div>
          {verificationResult && (<div className="bg-slate-50 p-4 rounded-md border space-y-1"><p><strong>TaxPayer:</strong> {verificationResult.taxPayerName}</p><p><strong>TIN:</strong> {verificationResult.taxPayerTIN}</p></div>)}
          <div className="flex items-center gap-4 pt-2">
            {!isRegistered || isEditing ? (
              <>
                <Button variant="outline" onClick={() => verifyTaxpayerMutation.mutate()} disabled={verifyTaxpayerMutation.isPending || !deviceId || !activationKey || !deviceSerialNo}>{verifyTaxpayerMutation.isPending ? "Verifying..." : "1. Verify Taxpayer"}</Button>
                <Button onClick={() => registerDeviceMutation.mutate()} disabled={registerDeviceMutation.isPending || !deviceId || !activationKey} className="bg-emerald-700 hover:bg-emerald-800 text-white">{registerDeviceMutation.isPending ? "Registering..." : isRegistered ? "Update & Re-Register" : "2. Register Device"}</Button>
                {isEditing && (<Button variant="ghost" onClick={() => { setIsEditing(false); setDeviceId(activeDeviceId); setActivationKey(activeActivationKey); setDeviceSerialNo(activeSerialNo); }}>Cancel</Button>)}
              </>
            ) : (
              <div className="flex items-center gap-2 px-4 py-2 rounded-md w-full border bg-slate-50"><span className="text-sm font-semibold">Registered • SN: {company.fdmsDeviceSerialNo || "Pending"}</span><Button variant="ghost" size="sm" className="ml-auto" onClick={() => setIsEditing(true)}><Pencil className="w-4 h-4 mr-2" />Edit Configuration</Button></div>
            )}
          </div>
          {isRegistered && !isEditing && (
            <div className="pt-4 border-t">
              <p className="text-xs font-semibold text-slate-500 mb-2">RSL tax reference data</p>
              <Button variant="outline" size="sm" onClick={() => syncConfigMutation.mutate()} disabled={syncConfigMutation.isPending}>
                <RefreshCw className={`w-4 h-4 mr-2 ${syncConfigMutation.isPending ? "animate-spin" : ""}`} />
                {syncConfigMutation.isPending ? "Syncing..." : "3. Sync Tax Config"}
              </Button>
              <p className="text-[11px] text-slate-400 mt-1.5">Pulls RSL applicableTaxes, updates rates/IDs for this environment, remaps products. Run after registration and after every TEST↔PRODUCTION switch (taxIDs differ per gateway).</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
