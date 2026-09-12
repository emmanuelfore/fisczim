import { Layout } from "@/components/layout";
import { useCompanies } from "@/hooks/use-companies";
import { useProducts } from "@/hooks/use-products";
import { useTaxConfig } from "@/hooks/use-tax-config";

import { ManageTaxTypeDialog } from "@/components/settings/manage-tax-type-dialog";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Calculator, Smartphone, Pencil, RefreshCw, CheckCircle, XCircle, AlertTriangle } from "lucide-react";

import { apiFetch } from "@/lib/api";

import { useActiveCompany } from "@/hooks/use-active-company";
import { useFiscalAuthority } from "@/hooks/use-fiscal-authority";
import { useState } from "react";

export default function TaxConfigPage() {
  const {
    activeCompany,
    activeCompanyId,
    isLoading: isLoadingActive,
  } = useActiveCompany();
  const { isLesotho } = useFiscalAuthority();
  const currentCompany = activeCompany;
  const isLoadingCompanies = isLoadingActive;
  const companyId = activeCompanyId;

  const [health, setHealth] = useState<any>(null);
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [healthError, setHealthError] = useState("");
  const [lekakuHealth, setLekakuHealth] = useState<any>(null);

  const runLekakuHealthCheck = async () => {
    if (!companyId) return;
    setCheckingHealth(true);
    setHealthError("");
    setLekakuHealth(null);
    try {
      const res = await apiFetch(`/api/companies/${companyId}/lekaku/tax-health`, {
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        setHealthError(err?.message || "Health check failed");
      } else {
        setLekakuHealth(await res.json());
      }
    } catch (err: any) {
      setHealthError(err?.message || "Health check failed");
    } finally {
      setCheckingHealth(false);
    }
  };

  const runHealthCheck = async () => {
    if (!companyId) return;
    if (isLesotho) return runLekakuHealthCheck();
    setCheckingHealth(true);
    setHealthError("");
    setHealth(null);
    try {
      const res = await apiFetch(`/api/companies/${companyId}/zimra/tax-health`, {
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        setHealthError(err?.message || "Health check failed");
      } else {
        setHealth(await res.json());
      }
    } catch (err: any) {
      setHealthError(err?.message || "Health check failed");
    } finally {
      setCheckingHealth(false);
    }
  };

  const healthStatusStyles: Record<string, string> = {
    ok: "bg-green-50 text-green-700 border-green-200",
    mismatch: "bg-red-50 text-red-700 border-red-200",
    missing: "bg-red-50 text-red-700 border-red-200",
    ambiguous: "bg-amber-50 text-amber-700 border-amber-200",
    unmapped: "bg-slate-100 text-slate-600 border-slate-200",
    "no-live": "bg-slate-100 text-slate-600 border-slate-200",
  };

  const { data: products } = useProducts(companyId || 0);
  const { taxTypes, taxCategories } = useTaxConfig(companyId || undefined);

  if (isLoadingCompanies)
    return (
      <Layout>
        <div className="p-8">Loading companies...</div>
      </Layout>
    );
  if (!currentCompany)
    return (
      <Layout>
        <div className="p-8">No company found. Please create one.</div>
      </Layout>
    );

  // Helper to get category name
  const getCategoryName = (catId: number) => {
    if (!taxCategories.data) return "—";
    const cat = taxCategories.data.find((c: any) => c.id === catId);
    return cat ? cat.name : "—";
  };

  return (
    <Layout>
      {!currentCompany.vatRegistered && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
          <Calculator className="w-5 h-5 text-amber-600 mt-0.5" />
          <div>
            <p className="font-bold text-amber-900">
              Non-VAT Registered Company
            </p>
            <p className=" text-amber-800 leading-relaxed">
              Your company is currently marked as{" "}
              <strong>not registered for VAT</strong>. VAT will be automatically
              disabled (set to 0%) for all invoices to ensure compliance with
              {isLesotho ? "RSL" : "ZIMRA"} regulations for non-VAT taxpayers.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: ZIMRA Settings */}
        <div className="lg:col-span-1 space-y-8">
          <Card className="card-depth border-none">
            <CardHeader>
              <CardTitle className="flex items-center text-emerald-700">
                <ShieldCheck className="w-5 h-5 mr-2" />
                Fiscal Connection
              </CardTitle>
              <CardDescription>{isLesotho ? "RSL LEKAKU Configuration" : "ZIMRA FDMS Configuration"}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form
                id="zimra-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);
                  const data = {
                    tin: formData.get("tin") as string,
                    fdmsDeviceId: formData.get("fdmsDeviceId") as string,
                  };
                  try {
                    const res = await apiFetch(`/api/companies/${companyId}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(data),
                    });
                    if (res.ok) {
                      alert(isLesotho ? "RSL settings updated." : "ZIMRA settings updated.");
                      window.location.reload();
                    } else {
                      alert("Failed to update settings");
                    }
                  } catch (err) {
                    console.error(err);
                    alert("Error saving settings");
                  }
                }}
              >
                <div className="p-3 bg-emerald-50 text-emerald-800  rounded-lg border border-emerald-100 flex items-center mb-4">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 mr-2 animate-pulse" />
                  <span>Fiscal Device Online</span>
                </div>

                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label>{isLesotho ? "RSL TIN" : "TIN (Taxpayer ID)"}</Label>
                    <Input
                      name="tin"
                      defaultValue={currentCompany.tin || ""}
                      className="font-mono bg-white"
                      placeholder={isLesotho ? "200153280-9" : "2000000000"}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>{isLesotho ? "RSL Device ID" : "Fiscal Device ID"}</Label>
                    <Input
                      name="fdmsDeviceId"
                      defaultValue={currentCompany.fdmsDeviceId || ""}
                      className="font-mono bg-white"
                      placeholder={isLesotho ? "Device ID issued by RSL" : "HTML-12345"}
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full mt-4 bg-emerald-600 hover:bg-emerald-700"
                >
                  {isLesotho ? "Save RSL Settings" : "Save ZIMRA Settings"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Tax Categories & Mapping */}
        <div className="lg:col-span-2 space-y-8">
          {/* Tax Types / Rates Configuration */}
          <Card className="card-depth border-none">
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="flex items-center text-blue-700">
                    <Calculator className="w-5 h-5 mr-2" />
                    {isLesotho ? "Tax Rates & RSL Types" : "Tax Rates & ZIMRA Types"}
                  </CardTitle>
                  <CardDescription>
                    {isLesotho
                      ? "RSL-issued taxes for this environment — read-only. Rates and IDs come from Sync, never typed by hand."
                      : "Manage master tax rates used by categories"}
                  </CardDescription>
                </div>
                <ManageTaxTypeDialog />
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-left ">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      <th className="p-3 font-medium text-slate-500">Name</th>
                      <th className="p-3 font-medium text-slate-500">{isLesotho ? "Kind" : "Code"}</th>
                      <th className="p-3 font-medium text-slate-500">{isLesotho ? "RSL ID" : "ID"}</th>
                      <th className="p-3 font-medium text-slate-500 text-right">
                        Rate
                      </th>
                      <th className="p-3 font-medium text-slate-500">
                        {isLesotho ? "Valid Till" : "Valid From"}
                      </th>
                      {isLesotho && <th className="p-3 font-medium text-slate-500">Env</th>}
                      <th className="p-3 font-medium w-[50px]"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(isLesotho ? taxTypes.data?.filter((t: any) => t.lekakuTaxId) : taxTypes.data)?.map((t: any) => (
                      <tr key={t.id} className={`hover:bg-slate-50/50 ${isLesotho && t.isActive === false ? "opacity-60" : ""}`}>
                        <td className="p-3 font-medium text-slate-900">
                          {t.name}
                          <div className="text-xs text-slate-500 font-normal">
                            {t.description}
                          </div>
                        </td>
                        <td className="p-3 text-slate-700 font-mono">
                          {isLesotho ? (t.lekakuTaxType || "—") : t.zimraCode}
                        </td>
                        <td className="p-3 text-slate-700 font-mono">
                          {isLesotho ? (t.lekakuTaxId || "—") : (t.zimraTaxId || "—")}
                        </td>
                        <td className="p-3 text-right font-bold text-slate-900">
                          {isLesotho && t.lekakuTaxType === "Exempt" ? "—" : `${t.rate}%`}
                        </td>
                        <td className="p-3 text-slate-500 text-xs">
                          {isLesotho
                            ? (t.lekakuValidTill || "—")
                            : <>{new Date(t.effectiveFrom).toLocaleDateString()}
                              {t.effectiveTo && ` - ${new Date(t.effectiveTo).toLocaleDateString()}`}</>}
                        </td>
                        {isLesotho && <td className="p-3 font-mono text-xs text-slate-500">{(t.lekakuEnvironment || "test").toUpperCase()}</td>}
                        <td className="p-3 text-right">
                          {isLesotho && t.lekakuTaxId ? (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${t.isActive === false ? "bg-red-50 text-red-700 border-red-200" : "bg-green-50 text-green-700 border-green-200"}`}>
                              {t.isActive === false ? "expired" : "synced"}
                            </span>
                          ) : (
                            <ManageTaxTypeDialog
                              taxType={t}
                              trigger={
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0"
                                >
                                  <Pencil className="w-4 h-4 text-slate-500" />
                                </Button>
                              }
                            />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Tax Mapping Health — authority-aware */}
          <Card className="card-depth border-none">
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="flex items-center text-purple-700">
                    <Smartphone className="w-5 h-5 mr-2" />
                    {isLesotho ? "RSL Tax Mapping Health" : "ZIMRA Tax Mapping Health"}
                  </CardTitle>
                  <CardDescription>
                    {isLesotho
                      ? "Validates your tax types against the live RSL gateway config for this environment — catches unmapped products, stale rates, expired taxes and wrong-environment IDs that cause RCPT025 rejections."
                      : "Validates your tax types against the live ZIMRA device config — catches duplicate rates, wrong tax IDs and percent mismatches that cause Red invoices."}
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  onClick={runHealthCheck}
                  disabled={checkingHealth}
                >
                  <RefreshCw className={`mr-2 h-4 w-4 ${checkingHealth ? "animate-spin" : ""}`} />
                  {isLesotho ? "Check Against RSL" : "Check Against ZIMRA"}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {healthError && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  {healthError}
                </div>
              )}

              {isLesotho && lekakuHealth && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-mono text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                      {(lekakuHealth.environment || "test").toUpperCase()}
                    </span>
                    <span className="text-slate-500">
                      {lekakuHealth.liveAvailable
                        ? `${lekakuHealth.liveTaxes.length} live RSL taxes`
                        : "Gateway unreachable — local checks only"}
                    </span>
                  </div>
                  {lekakuHealth.issues.length > 0 ? (
                    <div className="space-y-2">
                      {lekakuHealth.issues.map((issue: any, i: number) => (
                        <div
                          key={i}
                          className={`flex items-start gap-2 p-3 rounded-lg border text-sm ${
                            issue.severity === "error"
                              ? "bg-red-50 border-red-200 text-red-800"
                              : "bg-amber-50 border-amber-200 text-amber-800"
                          }`}
                        >
                          {issue.severity === "error" ? (
                            <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
                          ) : (
                            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                          )}
                          <span>
                            <span className="font-mono text-xs mr-2 opacity-70">
                              {issue.code}
                            </span>
                            {issue.message}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
                      <CheckCircle className="w-4 h-4 shrink-0" />
                      All products map cleanly to current-environment RSL taxes.
                    </div>
                  )}

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 border-b border-slate-100">
                        <tr>
                          <th className="p-2.5 font-medium text-slate-500">Local Tax</th>
                          <th className="p-2.5 font-medium text-slate-500 text-right">Rate</th>
                          <th className="p-2.5 font-medium text-slate-500">RSL ID</th>
                          <th className="p-2.5 font-medium text-slate-500">Kind</th>
                          <th className="p-2.5 font-medium text-slate-500">Valid Till</th>
                          <th className="p-2.5 font-medium text-slate-500">Env</th>
                          <th className="p-2.5 font-medium text-slate-500">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {lekakuHealth.localTaxes.map((t: any) => (
                          <tr key={t.id} className="hover:bg-slate-50/50">
                            <td className="p-2.5 font-medium text-slate-900">{t.name}</td>
                            <td className="p-2.5 text-right font-bold text-slate-900">{t.lekakuTaxType === "Exempt" ? "—" : `${t.rate}%`}</td>
                            <td className="p-2.5 font-mono text-slate-700">{t.lekakuTaxId}</td>
                            <td className="p-2.5 text-slate-700">{t.lekakuTaxType}</td>
                            <td className="p-2.5 text-slate-500 text-xs">{t.lekakuValidTill || "—"}</td>
                            <td className="p-2.5 font-mono text-xs text-slate-500">{(t.lekakuEnvironment || "test").toUpperCase()}</td>
                            <td className="p-2.5">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${t.isActive === false ? "bg-red-50 text-red-700 border-red-200" : "bg-green-50 text-green-700 border-green-200"}`}>
                                {t.isActive === false ? "expired" : "active"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {!isLesotho && health && (
                <div className="space-y-4">
                  {health.issues.length > 0 ? (
                    <div className="space-y-2">
                      {health.issues.map((issue: any, i: number) => (
                        <div
                          key={i}
                          className={`flex items-start gap-2 p-3 rounded-lg border text-sm ${
                            issue.severity === "error"
                              ? "bg-red-50 border-red-200 text-red-800"
                              : "bg-amber-50 border-amber-200 text-amber-800"
                          }`}
                        >
                          {issue.severity === "error" ? (
                            <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
                          ) : (
                            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                          )}
                          <span>
                            <span className="font-mono text-xs mr-2 opacity-70">
                              {issue.code}
                            </span>
                            {issue.message}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
                      <CheckCircle className="w-4 h-4 shrink-0" />
                      All tax types map cleanly to the ZIMRA device.
                    </div>
                  )}

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 border-b border-slate-100">
                        <tr>
                          <th className="p-2.5 font-medium text-slate-500">Local Tax Type</th>
                          <th className="p-2.5 font-medium text-slate-500 text-right">Rate</th>
                          <th className="p-2.5 font-medium text-slate-500">ZIMRA ID</th>
                          <th className="p-2.5 font-medium text-slate-500">Maps To (Live)</th>
                          <th className="p-2.5 font-medium text-slate-500">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {health.localTaxes.map((t: any) => (
                          <tr key={t.taxTypeId} className="hover:bg-slate-50/50">
                            <td className="p-2.5 font-medium text-slate-900">
                              {t.name}
                              <div className="text-xs text-slate-500 font-normal font-mono">{t.code}</div>
                            </td>
                            <td className="p-2.5 text-right font-bold text-slate-900">{t.rate}%</td>
                            <td className="p-2.5 font-mono text-slate-700">{t.zimraTaxId || "—"}</td>
                            <td className="p-2.5 font-mono text-slate-700">
                              {t.resolvedTaxId ? `${t.resolvedTaxId} (${t.resolvedTaxName || "?"})` : "—"}
                            </td>
                            <td className="p-2.5">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${healthStatusStyles[t.status] || ""}`}>
                                {t.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {!health && !lekakuHealth && !healthError && (
                <p className="text-sm text-muted-foreground">
                  {isLesotho
                    ? "Run a check to see how each product maps to the current-environment RSL taxes and whether any configuration will produce RCPT025 rejections."
                    : "Run a check to see how each of your tax types maps to the ZIMRA device and whether any configuration will produce invalid receipts."}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
