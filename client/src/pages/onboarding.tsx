import { useForm } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useCreateCompany } from "@/hooks/use-companies";
import { useLocation } from "wouter";
import {
  Loader2,
  Building2,
  User,
  Lock,
  Mail,
  ImagePlus,
  ArrowRight,
  ArrowLeft,
  UploadCloud,
  CheckCircle,
  AlertCircle,
  Zap,
  ShieldCheck,
  Clock,
} from "lucide-react";
import { insertCompanyBaseSchema } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useBranding } from "@/hooks/use-branding";
import { useFiscalAuthority } from "@/hooks/use-fiscal-authority";

// Tax-number rules differ per country/fiscal authority:
// Zimbabwe (ZIMRA): TIN exactly 10 digits, VAT 9 or 10 digits.
// Lesotho (RSL/LEKAKU): single-currency LSL, TIN format 9 digits +
// hyphen + check digit (e.g. 200153280-9), VAT registration number is a
// free field (format validation deferred).
const COMPANY_TAX_RULES: Record<
  string,
  {
    tin: RegExp | null;
    tinMessage: string;
    vat: RegExp | null;
    vatMessage: string;
    currency: string;
    singleCurrency: boolean;
  }
> = {
  Zimbabwe: {
    tin: /^\d{10}$/,
    tinMessage: "TIN must be exactly 10 digits",
    vat: /^\d{9,10}$/,
    vatMessage: "VAT number must be 9 or 10 digits",
    currency: "USD",
    singleCurrency: false,
  },
  Lesotho: {
    tin: /^\d{9}-\d$/,
    tinMessage: "RSL TIN must look like 200153280-9 (9 digits, hyphen, check digit)",
    vat: null,
    vatMessage: "",
    currency: "LSL",
    singleCurrency: true,
  },
};

const taxRulesFor = (country?: string) =>
  COMPANY_TAX_RULES[country || ""] || COMPANY_TAX_RULES.Zimbabwe;

const LEKAKU_GREEN = "#0E7A4F";
const LEKAKU_GREEN_DARK = "#0A5C3C";
const LEKAKU_PAPER = "#FAF8F2";
const LEKAKU_STONE = "#EDE9DD";
const LEKAKU_INK = "#10231A";
const LEKAKU_BLUE = "#1B4F9C";

function LekakuBlanketStripe() {
  return (
    <div aria-hidden style={{ height: 8, background: `linear-gradient(90deg, ${LEKAKU_GREEN} 0 22%, #fff 22% 26%, ${LEKAKU_BLUE} 26% 48%, #111 48% 52%, ${LEKAKU_BLUE} 52% 74%, #fff 74% 78%, ${LEKAKU_GREEN} 78% 100%)` }} />
  );
}

// Company Onboarding Schema
const companySchema = insertCompanyBaseSchema
  .pick({
    name: true,
    tin: true,
    phone: true,
    email: true,
    address: true,
    city: true,
    vatNumber: true,
    currency: true,
    country: true,
  })
  .extend({
    // Enforce requirements for onboarding specifically
    name: z.string().min(1, "Company Name is required"),
    address: z.string().min(1, "Physical Address is required"),
    city: z.string().min(1, "City is required"),
    phone: z.string().min(1, "Phone number is required"),
    email: z.string().email("Invalid email address"),
    country: z.string().default("Lesotho"),
    // Free-form at field level (Lesotho TIN contains a hyphen, VAT is a
    // free field); exact formats enforced per country in superRefine.
    tin: z.string().optional(),
    // Optional or specialized fields
    bpNumber: z.string().optional(),
    vatNumber: z.string().optional(),
    vatRegistered: z.boolean().default(false),
    logoUrl: z.string().optional(),
    tradingName: z.string().optional(),
    fdmsDeviceId: z.string().optional(),
    fdmsApiKey: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const rules = taxRulesFor(data.country);
    // Length/format rules are country-specific (ZIMRA vs RSL formats).
    // A null rule means free field (validated later).
    if (data.tin && rules.tin && !rules.tin.test(data.tin)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tin"],
        message: rules.tinMessage,
      });
    }
    if (data.vatNumber && rules.vat && !rules.vat.test(data.vatNumber)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["vatNumber"],
        message: rules.vatMessage,
      });
    }
    if (!data.vatRegistered) return;
    if (!data.tin) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tin"],
        message: "TIN is required for VAT registered companies",
      });
    }
    if (!data.vatNumber) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["vatNumber"],
        message: "VAT number is required for VAT registered companies",
      });
    }
  });

type CompanyFormValues = z.infer<typeof companySchema>;

export default function OnboardingPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const createCompany = useCreateCompany();
  const { brand } = useBranding();
  const { isLesotho: isFiscalLesotho } = useFiscalAuthority();

  // Steps: 1 = Company Basics, 2 = Tax Details
  const [currentStep, setCurrentStep] = useState(1);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const companyForm = useForm<CompanyFormValues>({
    resolver: zodResolver(companySchema),
    defaultValues: {
      name: "",
      tin: "",
      vatNumber: "",
      vatRegistered: false,
      bpNumber: "",
      phone: "",
      email: "",
      address: "",
      city: "Maseru",
      logoUrl: "",
      currency: "LSL",
      country: "Lesotho",
    },
    mode: "onBlur", // Validate as user navigates
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({
        title: "Invalid file",
        description: "Please upload an image (PNG, JPG).",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    const formData = new FormData();
    formData.append("image", file);

    try {
      const res = await apiFetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.message || "Upload failed");
      }

      const data = await res.json();
      companyForm.setValue("logoUrl", data.url);
      toast({
        title: "Logo uploaded",
        description: "Your company logo has been processed.",
      });
    } catch (error: any) {
      toast({
        title: "Upload Failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const onFinalSubmit = async (data: CompanyFormValues) => {
    setIsSubmitting(true);
    try {
      const fiscalProvider = data.country === "Lesotho" ? "LEKAKU" : "ZIMRA";
      const rules = taxRulesFor(data.country);
      const payload = {
        ...data,
        fiscalProvider,
        // Single-currency authorities (Lesotho/LSL): currency is fixed,
        // never user-selected.
        currency: rules.singleCurrency ? rules.currency : data.currency,
        tin: data.vatRegistered ? data.tin || "" : "",
        vatNumber: data.vatRegistered ? data.vatNumber || "" : "",
        vatEnabled: data.vatRegistered,
        vatRegistered: data.vatRegistered,
      };
      await createCompany.mutateAsync(payload);
      toast({
        title: "Organization Created",
        description: "Your business profile is now active.",
      });
      setLocation("/");
    } catch (error: any) {
      toast({
        title: "Registration Failed",
        description: error.message || "Could not complete onboarding.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const StepIndicator = ({
    step,
    label,
    current,
  }: {
    step: number;
    label: string;
    current: number;
  }) => (
    <div className="flex flex-col items-center gap-2 flex-1">
      <div
        className={cn(
          "w-10 h-10 rounded-full flex items-center justify-center font-bold border-2 transition-all duration-500",
          step === current
            ? isFiscalLesotho ? "bg-[#0E7A4F] text-white border-[#0E7A4F] shadow-xl scale-110" : "bg-violet-600 text-white border-violet-600 shadow-xl scale-110"
            : step < current
              ? isFiscalLesotho ? "bg-[#0E7A4F] border-[#0E7A4F] text-white" : "bg-emerald-500 border-emerald-500 text-white"
              : "border-slate-200 text-slate-400 bg-white",
        )}
      >
        {step < current ? <CheckCircle className="w-5 h-5" /> : step}
      </div>
      <span
        className={cn(
          "text-[10px] font-black uppercase tracking-[0.2em]",
          step === current ? (isFiscalLesotho ? "text-[#0E7A4F]" : "text-violet-600") : "text-slate-400",
        )}
      >
        {label}
      </span>
    </div>
  );

  const isVatRegistered = companyForm.watch("vatRegistered");
  const onboardCountry = companyForm.watch("country");
  const isLesotho = onboardCountry === "Lesotho";
  const taxRules = taxRulesFor(onboardCountry);

  return (
    <div className={cn("min-h-screen flex items-center justify-center p-4 sm:p-12 lg:p-20", isFiscalLesotho ? "bg-[#FAF8F2] lekaku-branch" : "bg-slate-50")} style={isFiscalLesotho ? { fontFamily: "'Public Sans', system-ui, sans-serif" } : undefined}>
      {isFiscalLesotho && <div className="fixed top-0 left-0 right-0 z-10"><LekakuBlanketStripe /></div>}
      {/* Simple, Centered Container */}
      <div className={cn("max-w-2xl w-full rounded-[2.5rem] shadow-2xl p-8 sm:p-12 space-y-10 animate-in fade-in zoom-in-95 duration-700", isFiscalLesotho ? "bg-white border border-[#EDE9DD] shadow-slate-200/30" : "bg-white shadow-slate-200/50")}>
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-3 px-4 py-2 rounded-2xl border shadow-sm" style={isFiscalLesotho ? { background: "#fff", borderColor: LEKAKU_STONE } : {}}>
            <Building2 className="w-5 h-5" style={{ color: isFiscalLesotho ? LEKAKU_GREEN : "#7c3aed" }} />
            <span className=" font-black uppercase tracking-widest" style={{ color: isFiscalLesotho ? LEKAKU_INK : "#0f172a" }}>
              {brand.name}
            </span>
          </div>
          <h2 className="text-4xl font-black text-slate-900 tracking-tight">
            Organization Profile
          </h2>
          <p className="text-slate-500 font-medium">
            Step {currentStep} of 2 &mdash;{" "}
            {currentStep === 1 ? "Organization Basics" : "Tax & Compliance"}
          </p>
        </div>

        {/* Progress Bar */}
        <div className="flex items-center gap-2 max-w-sm mx-auto">
          <StepIndicator step={1} label="Company" current={currentStep} />
          <div className="h-0.5 w-12 bg-slate-100 relative top-[-10px]">
            <div
              className={cn(
                "h-full transition-all duration-500",
                isFiscalLesotho ? "bg-[#0E7A4F]" : "bg-violet-600",
                currentStep > 1 ? "w-full" : "w-0",
              )}
            />
          </div>
          <StepIndicator step={2} label="Compliance" current={currentStep} />
        </div>

        {/* Step 1 Form */}
        {currentStep === 1 && (
          <Form {...companyForm}>
            <form className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
              <div className="space-y-6">
                <div className="flex items-center gap-6">
                  {/* Simple Logo Placeholder/Upload */}
                  <div className="relative group shrink-0">
                    <div className="w-24 h-24 rounded-[1.5rem] bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden transition-all group-hover:border-violet-400 cursor-pointer">
                      {companyForm.watch("logoUrl") ? (
                        <img
                          src={companyForm.watch("logoUrl")}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <ImagePlus className="w-8 h-8 text-slate-300 group-hover:text-violet-500 transition-colors" />
                      )}
                      <input
                        type="file"
                        onChange={handleFileUpload}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                      />
                    </div>
                    <div className="absolute -bottom-2 -right-2 bg-white p-1 rounded-lg border shadow-sm group-hover:scale-110 transition-transform">
                      <UploadCloud className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <h4 className=" font-bold text-slate-900">
                      Brand Identity
                    </h4>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Upload your company logo. This will appear on all <br />
                      FISCAL receipts and invoices.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    control={companyForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem className="space-y-2">
                        <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                          Registered Name
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Acme (Pvt) Ltd"
                            {...field}
                            className="h-12 bg-slate-50/50 border-slate-100 focus:bg-white focus:ring-4 focus:ring-violet-500/10 transition-all rounded-xl font-bold"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={companyForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem className="space-y-2">
                        <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                          Business Email
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder="office@acme.com"
                            {...field}
                            className="h-12 bg-slate-50/50 border-slate-100 rounded-xl font-bold"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={companyForm.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem className="space-y-2">
                      <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                        Physical Address
                      </FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="No. 12 Street Name, Harare"
                          {...field}
                          className="min-h-[100px] bg-slate-50/50 border-slate-100 rounded-xl font-bold p-4 focus:bg-white"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <FormField
                    control={companyForm.control}
                    name="city"
                    render={({ field }) => {
                      const country = companyForm.watch("country");
                      const placeholder = country === "Lesotho" ? "Maseru" : "Harare";
                      return (
                        <FormItem className="space-y-2">
                          <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                            City
                          </FormLabel>
                          <FormControl>
                            <Input
                              placeholder={placeholder}
                              {...field}
                              className="h-12 bg-slate-50/50 border-slate-100 rounded-xl font-bold"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      );
                    }}
                  />
                  <FormField
                    control={companyForm.control}
                    name="phone"
                    render={({ field }) => {
                      const country = companyForm.watch("country");
                      const placeholder = country === "Lesotho" ? "+266 ..." : "+263 ...";
                      return (
                        <FormItem className="space-y-2">
                          <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                            Phone
                          </FormLabel>
                          <FormControl>
                            <Input
                              placeholder={placeholder}
                              {...field}
                              className="h-12 bg-slate-50/50 border-slate-100 rounded-xl font-bold"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      );
                    }}
                  />
                  <FormField
                    control={companyForm.control}
                    name="country"
                    render={({ field }) => (
                      <FormItem className="space-y-2">
                        <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                          Country
                        </FormLabel>
                        <Select
                          onValueChange={(value) => {
                            field.onChange(value);
                            // Switching authority resets currency + tax
                            // numbers, since formats differ (ZIMRA vs RSL).
                            const next = taxRulesFor(value);
                            companyForm.setValue("currency", next.currency);
                            companyForm.setValue("tin", "");
                            companyForm.setValue("vatNumber", "");
                            companyForm.clearErrors(["tin", "vatNumber"]);
                            if (value === "Lesotho" && !companyForm.getValues("city")) {
                              companyForm.setValue("city", "Maseru");
                            }
                          }}
                          defaultValue={field.value ?? "Lesotho"}
                        >
                          <FormControl>
                            <SelectTrigger className="h-12 bg-slate-50/50 border-slate-100 rounded-xl font-bold">
                              <SelectValue placeholder="Country" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="Zimbabwe">Zimbabwe</SelectItem>
                            <SelectItem value="Lesotho">Lesotho</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <div className="pt-6 border-t border-slate-100">
                <Button
                  type="button"
                  className={cn("w-full h-14 font-black uppercase tracking-widest rounded-2xl active:scale-95 shadow-xl transition-all", isFiscalLesotho ? "bg-[#0E7A4F] hover:bg-[#0A5C3C] text-white shadow-emerald-900/10" : "btn-gradient shadow-transparent hover:shadow-violet-600/20")}
                  onClick={async () => {
                    const isValid = await companyForm.trigger([
                      "name",
                      "email",
                      "phone",
                      "address",
                      "city",
                    ]);
                    if (isValid) setCurrentStep(2);
                  }}
                >
                  Next: Compliance Details
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </div>
            </form>
          </Form>
        )}

        {/* Step 2 Form (Omitted for brevity, using same logic but enhanced styles) */}
        {currentStep === 2 && (
          <Form {...companyForm}>
            <form
              onSubmit={companyForm.handleSubmit(onFinalSubmit)}
              className="space-y-10 animate-in fade-in slide-in-from-right-4 duration-500"
            >
              <div className="space-y-6">
                <div className="p-6 rounded-[2rem] text-white space-y-2 shadow-2xl relative overflow-hidden group" style={{ background: isFiscalLesotho ? LEKAKU_INK : "#0f172a" }}>
                  <div className="absolute top-0 right-0 w-32 h-32 translate-x-10 -translate-y-10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700" style={{ background: isFiscalLesotho ? "rgba(14,122,79,0.22)" : "rgba(124,58,237,0.2)" }} />
                  <div className="flex items-center gap-3 relative z-10">
                    <AlertCircle className="w-5 h-5" style={{ color: isFiscalLesotho ? "#7BE3A8" : "#a78bfa" }} />
                    <h4 className="text-base font-bold">Tax Compliance Info</h4>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed relative z-10">
                    If your business is not VAT registered yet, leave tax
                    registration off. You can add TIN, VAT, and{" "}
                    {isLesotho ? "RSL device" : "ZIMRA device"} details later
                    from Settings.
                  </p>
                </div>

                <FormField
                  control={companyForm.control}
                  name="vatRegistered"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between gap-4 rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                      <div className="space-y-1">
                        <FormLabel className=" font-black text-slate-900">
                          Company is VAT registered
                        </FormLabel>
                        <FormDescription className="text-xs text-slate-500">
                          Turn this on only if you already have a TIN and VAT
                          registration number.
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={!!field.value}
                          onCheckedChange={(checked) => {
                            field.onChange(checked);
                            if (!checked) {
                              companyForm.setValue("tin", "");
                              companyForm.setValue("vatNumber", "");
                              companyForm.clearErrors(["tin", "vatNumber"]);
                            }
                          }}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <FormField
                    control={companyForm.control}
                    name="tin"
                    render={({ field }) => (
                      <FormItem className="space-y-2 flex-1">
                        <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                          {isLesotho ? "RSL TIN" : "Taxpayer ID (TIN)"}{" "}
                          {isVatRegistered ? "" : "(optional)"}
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder={
                              isVatRegistered
                                ? isLesotho
                                  ? "e.g. 200153280-9"
                                  : "10-digit TIN"
                                : "Not registered yet"
                            }
                            {...field}
                            disabled={!isVatRegistered}
                            className="h-12 bg-slate-50/50 border-slate-100 rounded-xl font-bold font-mono tracking-widest disabled:opacity-60"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={companyForm.control}
                    name="vatNumber"
                    render={({ field }) => (
                      <FormItem className="space-y-2 flex-1">
                        <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                          {isLesotho ? "RSL VAT Number" : "VAT Number"}{" "}
                          {isVatRegistered ? "" : "(optional)"}
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder={
                              isVatRegistered
                                ? isLesotho
                                  ? "As on RSL certificate"
                                  : "9 or 10 digits"
                                : "Not registered yet"
                            }
                            {...field}
                            disabled={!isVatRegistered}
                            className="h-12 bg-slate-50/50 border-slate-100 rounded-xl font-bold font-mono tracking-widest disabled:opacity-60"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {/* BP Number is ZIMRA-specific — hidden for Lesotho. */}
                  {!isLesotho && (
                  <FormField
                    control={companyForm.control}
                    name="bpNumber"
                    render={({ field }) => (
                      <FormItem className="space-y-2 flex-1">
                        <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                          BP Number
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder="10XXXXXX"
                            {...field}
                            className="h-12 bg-slate-50/50 border-slate-100 rounded-xl font-bold font-mono tracking-widest"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  )}
                  <FormField
                    control={companyForm.control}
                    name="currency"
                    render={({ field }) => {
                      const country = companyForm.watch("country");
                      const rules = taxRulesFor(country);
                      // Single-currency authority (Lesotho): no choice needed.
                      if (rules.singleCurrency) {
                        return (
                          <FormItem className="space-y-2 flex-1">
                            <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                              Reporting Currency
                            </FormLabel>
                            <div className="h-12 px-4 flex items-center bg-emerald-50/60 border border-emerald-100 rounded-xl font-bold text-emerald-900">
                              LSL - Lesotho Loti
                              <span className="ml-2 text-[10px] font-medium text-emerald-600">
                                (fixed)
                              </span>
                            </div>
                            <FormMessage />
                          </FormItem>
                        );
                      }
                      return (
                        <FormItem className="space-y-2 flex-1">
                          <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                            Reporting Currency
                          </FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            defaultValue={field.value ?? rules.currency}
                          >
                            <FormControl>
                              <SelectTrigger className="h-12 bg-slate-50/50 border-slate-100 rounded-xl font-bold">
                                <SelectValue placeholder="Base Currency" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="USD">USD - US Dollar</SelectItem>
                              <SelectItem value="ZWG">
                                ZWG - Zimbabwe Gold
                              </SelectItem>
                              <SelectItem value="LSL">LSL - Lesotho Loti</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      );
                    }}
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 pt-6 border-t border-slate-100">
                <Button
                  type="button"
                  variant="ghost"
                  className="h-14 px-8 font-black uppercase tracking-widest text-[10px] text-slate-400 hover:text-slate-900 rounded-2xl"
                  onClick={() => setCurrentStep(1)}
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Go Back
                </Button>
                <Button
                  type="submit"
                  className={cn("flex-1 h-14 font-black uppercase tracking-widest rounded-2xl shadow-2xl active:scale-95 transition-all", isFiscalLesotho ? "bg-[#0E7A4F] hover:bg-[#0A5C3C] text-white" : "btn-gradient")}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-3 animate-spin" />{" "}
                      Finalizing...
                    </>
                  ) : (
                    "Confirm & Register Profile"
                  )}
                </Button>
              </div>
            </form>
          </Form>
        )}
      </div>
    </div>
  );
}
