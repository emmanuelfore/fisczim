import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { usePartners, usePartnershipSettings, useSavePartnershipSettings } from "@/hooks/use-partners";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Handshake, Plus, Pencil, Save } from "lucide-react";
import { DEFAULT_PARTNERSHIP_SETTINGS, type PartnershipSettings } from "@shared/partnership";
import { invoiceTemplates } from "@/lib/invoice-templates";

interface PartnershipManagementProps {
  companyId: number;
}

export function PartnershipManagement({ companyId }: PartnershipManagementProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: partners = [], isLoading } = usePartners(companyId);
  const { data: settingsData } = usePartnershipSettings(companyId);
  const saveSettings = useSavePartnershipSettings(companyId);

  const [settings, setSettings] = useState<PartnershipSettings>(DEFAULT_PARTNERSHIP_SETTINGS);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({
    name: "",
    tradingName: "",
    logoUrl: "",
    tin: "",
    vatNumber: "",
    displayLabel: "In partnership with",
    defaultRevenueSharePercent: "0",
    ownerGroupMatch: "",
    invoiceTemplate: "modern",
    notes: "",
  });

  useEffect(() => {
    if (settingsData) setSettings(settingsData);
  }, [settingsData]);

  const openCreate = () => {
    setEditingId(null);
    setForm({
      name: "",
      tradingName: "",
      logoUrl: "",
      tin: "",
      vatNumber: "",
      displayLabel: "In partnership with",
      defaultRevenueSharePercent: "0",
      ownerGroupMatch: "",
      invoiceTemplate: "modern",
      notes: "",
    });
    setEditorOpen(true);
  };

  const openEdit = (partner: any) => {
    setEditingId(partner.id);
    setForm({
      name: partner.name || "",
      tradingName: partner.tradingName || "",
      logoUrl: partner.logoUrl || "",
      tin: partner.tin || "",
      vatNumber: partner.vatNumber || "",
      displayLabel: partner.displayLabel || "In partnership with",
      defaultRevenueSharePercent: String(partner.defaultRevenueSharePercent || 0),
      ownerGroupMatch: partner.ownerGroupMatch || "",
      invoiceTemplate: partner.invoiceTemplate || "modern",
      notes: partner.notes || "",
    });
    setEditorOpen(true);
  };

  const savePartnerMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        defaultRevenueSharePercent: Number(form.defaultRevenueSharePercent || 0),
      };
      const url = editingId
        ? `/api/companies/${companyId}/partners/${editingId}`
        : `/api/companies/${companyId}/partners`;
      const res = await apiFetch(url, {
        method: editingId ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to save partner");
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-partners", companyId] });
      setEditorOpen(false);
      toast({ title: "Partner saved" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Handshake className="h-5 w-5" />
              Commercial Partners
            </CardTitle>
            <CardDescription>
              Manage partner brands, logos, and default revenue share for co-branded invoices.
            </CardDescription>
          </div>
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Add Partner
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
          ) : partners.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">No partners configured yet.</p>
          ) : (
            <div className="space-y-3">
              {partners.map((partner) => (
                <div key={partner.id} className="flex items-center justify-between rounded-[12px] border border-slate-200 p-4">
                  <div className="flex items-center gap-3">
                    {partner.logoUrl ? (
                      <img src={partner.logoUrl} alt={partner.name} className="h-10 w-20 object-contain" />
                    ) : (
                      <div className="flex h-10 w-20 items-center justify-center rounded bg-slate-100 text-xs text-slate-500">No logo</div>
                    )}
                    <div>
                      <p className="font-semibold text-slate-900">{partner.name}</p>
                      <p className="text-xs text-slate-500">
                        {Number(partner.defaultRevenueSharePercent || 0)}% partner share
                        {partner.ownerGroupMatch ? ` · Auto: ${partner.ownerGroupMatch}` : ""}
                      </p>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => openEdit(partner)}>
                    <Pencil className="mr-1 h-3.5 w-3.5" />
                    Edit
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle>Display Settings</CardTitle>
            <CardDescription>Control how dual logos appear on invoices and receipts.</CardDescription>
          </div>
          <Button onClick={() => saveSettings.mutate(settings)} disabled={saveSettings.isPending}>
            {saveSettings.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Settings
          </Button>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="flex items-center justify-between rounded-lg border p-3 md:col-span-2">
            <div>
              <p className="text-sm font-medium">Enable dual-logo invoices</p>
              <p className="text-xs text-slate-500">Show partner branding alongside your company logo.</p>
            </div>
            <Switch checked={settings.dualLogoEnabled} onCheckedChange={(v) => setSettings((s) => ({ ...s, dualLogoEnabled: v }))} />
          </div>
          <div className="space-y-2">
            <Label>Logo layout</Label>
            <Select value={settings.dualLogoLayout} onValueChange={(v: any) => setSettings((s) => ({ ...s, dualLogoLayout: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="side_by_side">Side by side</SelectItem>
                <SelectItem value="primary_secondary">Primary + secondary</SelectItem>
                <SelectItem value="stacked">Stacked</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Default partner</Label>
            <Select
              value={settings.defaultPartnerId ? String(settings.defaultPartnerId) : "none"}
              onValueChange={(v) => setSettings((s) => ({ ...s, defaultPartnerId: v === "none" ? null : Number(v) }))}
            >
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {partners.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3 md:col-span-2">
            <div>
              <p className="text-sm font-medium">Show partner on POS receipts</p>
            </div>
            <Switch checked={settings.showPartnerOnPosReceipt} onCheckedChange={(v) => setSettings((s) => ({ ...s, showPartnerOnPosReceipt: v }))} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Invoice footnote</Label>
            <Textarea
              value={settings.partnershipFootnote || ""}
              onChange={(e) => setSettings((s) => ({ ...s, partnershipFootnote: e.target.value }))}
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Partner" : "Add Partner"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-2"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="grid gap-2"><Label>Trading name</Label><Input value={form.tradingName} onChange={(e) => setForm({ ...form, tradingName: e.target.value })} /></div>
            <div className="grid gap-2">
              <Label>Logo</Label>
              <div className="flex items-center gap-3">
                {form.logoUrl && (
                  <img src={form.logoUrl} alt="Logo" className="h-10 w-20 object-contain rounded border border-slate-200" />
                )}
                <Input
                  type="file"
                  accept="image/*"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const fd = new FormData();
                    fd.append("image", file);
                    try {
                      const res = await apiFetch("/api/upload", { method: "POST", body: fd });
                      if (!res.ok) {
                        const errorData = await res.json().catch(() => ({}));
                        throw new Error(errorData.error || errorData.message || "Upload failed");
                      }
                      const data = await res.json();
                      setForm({ ...form, logoUrl: data.url });
                    } catch (err: any) {
                      toast({ title: "Upload Error", description: err.message, variant: "destructive" });
                    }
                  }}
                />
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 rounded-md border border-blue-100 bg-blue-50/50 p-3">
              <div className="col-span-2 space-y-1">
                <Label className="text-blue-900 font-semibold">Automatic Split Rules</Label>
                <p className="text-xs text-blue-700">Configure how revenue is automatically split when an invoice is issued with this partner.</p>
              </div>
              <div className="grid gap-2">
                <Label className="text-blue-900">Partner Share %</Label>
                <Input type="number" min={0} max={100} value={form.defaultRevenueSharePercent} onChange={(e) => setForm({ ...form, defaultRevenueSharePercent: e.target.value })} className="bg-white" />
              </div>
              <div className="grid gap-2">
                <Label className="text-blue-900">Owner group match</Label>
                <Input value={form.ownerGroupMatch} onChange={(e) => setForm({ ...form, ownerGroupMatch: e.target.value })} placeholder="e.g. Beauty" className="bg-white" />
              </div>
            </div>
            <div className="grid gap-2"><Label>Display label</Label><Input value={form.displayLabel} onChange={(e) => setForm({ ...form, displayLabel: e.target.value })} /></div>
            <div className="grid gap-2">
              <Label>Invoice Template</Label>
              <Select value={form.invoiceTemplate} onValueChange={(v) => setForm({ ...form, invoiceTemplate: v })}>
                <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {invoiceTemplates.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2"><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorOpen(false)}>Cancel</Button>
            <Button onClick={() => savePartnerMutation.mutate()} disabled={!form.name.trim() || savePartnerMutation.isPending}>
              {savePartnerMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
