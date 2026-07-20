import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Building2,
  Upload,
  Image as ImageIcon,
  MapPin,
  Globe,
  Mail,
  Phone,
  RefreshCw,
} from "lucide-react";
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useUpdateCompany } from "@/hooks/use-companies";

interface OrganizationProfileProps {
  company: any;
  formData: any;
  setFormData: (data: any) => void;
}

export function OrganizationProfile({
  company,
  formData,
  setFormData,
}: OrganizationProfileProps) {
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const updateCompany = useUpdateCompany(company.id);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const fd = new FormData();
      fd.append("logo", file);
      const res = await apiFetch(`/api/companies/${company.id}/logo`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Upload failed");
      }
      const data = await res.json();
      await updateCompany.mutateAsync({ logoUrl: data.url });
      toast({ title: "Success", description: "Logo updated successfully" });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="max-w-6xl space-y-4">
        {/* Main Identity & Contact Section */}
        <Card className="overflow-hidden rounded-[14px] border border-[#E5E7EB] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <CardHeader className="border-b border-[#E5E7EB] bg-[#F8FAFC] p-5">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center text-base font-semibold tracking-tight text-[#0F172A]">
                  <div className="mr-3 flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#EFF6FF]">
                    <Building2 className="h-4 w-4 text-[#2563EB]" />
                  </div>
                  Organization Identity
                </CardTitle>
                <CardDescription className="ml-11 mt-0.5  text-[#64748B]">
                  Official business registration and regional parameters
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 p-5">
            {/* Row 1: Legal Names */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs font-medium text-[#64748B]">
                  Legal Company Name
                </Label>
                <Input
                  value={formData.name || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="Official Registered Name"
                  className="h-10 rounded-[10px] border-[#E5E7EB] font-medium transition-all focus:ring-4 focus:ring-blue-500/10"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium text-[#64748B]">
                  Trading Name (DBA)
                </Label>
                <Input
                  value={formData.tradingName || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, tradingName: e.target.value })
                  }
                  placeholder="Doing Business As"
                  className="h-10 rounded-[10px] border-[#E5E7EB] font-medium transition-all focus:ring-4 focus:ring-blue-500/10"
                />
              </div>
            </div>

            {/* Row 2: Contact Info */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-xs font-medium text-[#64748B]">
                  <Mail className="w-3 h-3 text-blue-500" /> Admin Email
                </Label>
                <Input
                  value={formData.email || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  placeholder="admin@company.com"
                  className="h-10 rounded-[10px] border-[#E5E7EB] font-medium transition-all focus:ring-4 focus:ring-blue-500/10"
                />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-xs font-medium text-[#64748B]">
                  <Phone className="w-3 h-3 text-blue-500" /> Phone Contact
                </Label>
                <Input
                  value={formData.phone || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, phone: e.target.value })
                  }
                  placeholder="+263..."
                  className="h-10 rounded-[10px] border-[#E5E7EB] font-medium transition-all focus:ring-4 focus:ring-blue-500/10"
                />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-xs font-medium text-[#64748B]">
                  <Globe className="w-3 h-3 text-blue-500" /> Corporate Web
                </Label>
                <Input
                  value={formData.website || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, website: e.target.value })
                  }
                  placeholder="https://..."
                  className="h-10 rounded-[10px] border-[#E5E7EB] font-medium transition-all focus:ring-4 focus:ring-blue-500/10"
                />
              </div>
            </div>

            {/* Row 3: Address & ZIMRA Branch */}
            <div className="grid grid-cols-1 gap-4 border-t border-[#F1F5F9] pt-5 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-xs font-medium text-[#64748B]">
                  <MapPin className="w-3 h-3 text-blue-500" /> Physical HQ
                  Address
                </Label>
                <div className="grid grid-cols-1 gap-4">
                  <Input
                    value={formData.address || ""}
                    onChange={(e) =>
                      setFormData({ ...formData, address: e.target.value })
                    }
                    placeholder="Street Address"
                    className="h-10 rounded-[10px] border-[#E5E7EB] font-medium transition-all focus:ring-4 focus:ring-blue-500/10"
                  />
                  <Input
                    value={formData.city || ""}
                    onChange={(e) =>
                      setFormData({ ...formData, city: e.target.value })
                    }
                    placeholder="City / Region"
                    className="h-10 rounded-[10px] border-[#E5E7EB] font-medium transition-all focus:ring-4 focus:ring-blue-500/10"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-[#64748B]">
                    Branch Name (Fiscal ID)
                  </Label>
                  <Input
                    value={formData.branchName || ""}
                    onChange={(e) =>
                      setFormData({ ...formData, branchName: e.target.value })
                    }
                    placeholder="e.g. Harare CBD / Bulawayo Hub"
                    className="h-10 rounded-[10px] border-[#E5E7EB] font-medium transition-all focus:ring-4 focus:ring-blue-500/10"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-[#64748B]">
                      Base Currency
                    </Label>
                    <Input
                      value={formData.currency || "USD"}
                      onChange={(e) =>
                        setFormData({ ...formData, currency: e.target.value })
                      }
                      className="h-10 rounded-[10px] border-[#E5E7EB] focus:ring-blue-500/20"
                    />
                  </div>
                  <div className="space-y-2 opacity-60">
                    <Label className="text-xs font-medium text-[#64748B]">
                      System Timezone
                    </Label>
                    <Input
                      value="CAT (UTC+2)"
                      disabled
                      className="h-10 rounded-[10px] border-[#E5E7EB] bg-[#F8FAFC]"
                    />
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Branding & Assets Section - Now Below Information */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card className="overflow-hidden rounded-[14px] border border-[#E5E7EB] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <CardHeader className="border-b border-[#E5E7EB] bg-[#F8FAFC] p-5">
              <CardTitle className="flex items-center gap-2 text-base font-semibold tracking-tight text-[#0F172A]">
                <ImageIcon className="w-5 h-5 text-indigo-500" />
                Corporate Logo
              </CardTitle>
              <CardDescription>
                Primary asset for receipt and invoice headers
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5">
              <div className="flex flex-col items-center gap-5 sm:flex-row">
                <div className="relative group/logo">
                  {company.logoUrl ? (
                    <img
                      src={company.logoUrl}
                      alt="Logo"
                      className="h-24 w-24 rounded-[14px] border border-[#E5E7EB] bg-white object-contain p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-transform group-hover/logo:scale-105"
                    />
                  ) : (
                    <div className="flex h-24 w-24 items-center justify-center rounded-[14px] border border-dashed border-[#CBD5E1] bg-[#F8FAFC] transition-all group-hover/logo:border-[#2563EB]">
                      <ImageIcon className="h-9 w-9 text-slate-300" />
                    </div>
                  )}
                </div>
                <div className="flex-1 space-y-3">
                  <div className="rounded-[12px] border border-[#E5E7EB] bg-[#F8FAFC] p-3">
                    <p className="text-xs leading-relaxed text-[#64748B]">
                      Your logo will be automatically formatted for thermal
                      receipt printers and high-resolution PDF invoices.
                      <span className="mt-1 block font-semibold text-[#0F172A]">
                        Vector SVG or high-res PNG recommended.
                      </span>
                    </p>
                  </div>
                  <div className="relative">
                    <Label
                      htmlFor="logo-upload"
                      className="flex h-10 w-full cursor-pointer items-center justify-center rounded-[10px] border border-[#E5E7EB] bg-white px-4  font-semibold text-[#0F172A] shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors hover:border-[#CBD5E1] hover:bg-[#F8FAFC]"
                    >
                      {isUploading ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin mr-2" />{" "}
                          Uploading...
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4 mr-2" /> Upload Brand Asset
                        </>
                      )}
                    </Label>
                    <input
                      id="logo-upload"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={isUploading}
                      onChange={handleLogoUpload}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden rounded-[14px] border border-[#E5E7EB] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <CardHeader className="border-b border-[#E5E7EB] bg-[#F8FAFC] p-5">
              <CardTitle className="flex items-center gap-2 text-base font-semibold tracking-tight text-[#0F172A]">
                <div
                  className="w-2 h-6 rounded-full"
                  style={{
                    backgroundColor: formData.primaryColor || "#4f46e5",
                  }}
                />
                Platform Theme
              </CardTitle>
              <CardDescription>Custom interface accent colors</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 p-5">
              <div className="flex items-center gap-4">
                <div className="space-y-1.5 flex-1">
                  <Label className="text-xs font-medium text-[#64748B]">
                    Primary Color HexCode
                  </Label>
                  <div className="flex items-center gap-3">
                    <div
                      className="h-10 w-10 rounded-[10px] border border-[#E5E7EB] shadow-inner"
                      style={{
                        backgroundColor: formData.primaryColor || "#4f46e5",
                      }}
                    />
                    <Input
                      value={formData.primaryColor || "#4f46e5"}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          primaryColor: e.target.value,
                        })
                      }
                      className="h-10 rounded-[10px] border-[#E5E7EB] font-mono font-semibold text-[#0F172A]"
                    />
                  </div>
                </div>
                <div className="pt-4">
                  <Input
                    type="color"
                    className="h-10 w-10 cursor-pointer overflow-hidden rounded-full border-none bg-transparent p-0"
                    value={formData.primaryColor || "#4f46e5"}
                    onChange={(e) =>
                      setFormData({ ...formData, primaryColor: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="rounded-[12px] border border-amber-100 bg-amber-50/50 p-3">
                <p className="mb-0 text-xs font-medium leading-normal text-amber-800">
                  <span className="font-bold">PRO-TIP:</span> Using a darker
                  primary color ensures that white text on buttons remains
                  legible throughout the dashboard and POS interface.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
