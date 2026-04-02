
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { useCreateCompany } from "@/hooks/use-companies";
import { useLocation } from "wouter";
import { Loader2, Building2, User, Lock, Mail, ImagePlus, ArrowRight, ArrowLeft, UploadCloud, CheckCircle, AlertCircle, Zap, ShieldCheck, Clock } from "lucide-react";
import { insertCompanySchema } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useBranding } from "@/hooks/use-branding";

// Company Onboarding Schema
const companySchema = insertCompanySchema.pick({
    name: true,
    tin: true,
    phone: true,
    email: true,
    address: true,
    city: true,
    vatNumber: true,
    currency: true,
}).extend({
    // Make BP Number optional explicitly
    bpNumber: z.string().optional(),
    logoUrl: z.string().optional(),
    tradingName: z.string().optional(),
    fdmsDeviceId: z.string().optional(),
    fdmsApiKey: z.string().optional(),
});

type CompanyFormValues = z.infer<typeof companySchema>;

export default function OnboardingPage() {
    const [, setLocation] = useLocation();
    const { toast } = useToast();
    const { user } = useAuth();
    const createCompany = useCreateCompany();
    const { brand } = useBranding();

    // Steps: 1 = Company Basics, 2 = Tax Details
    const [currentStep, setCurrentStep] = useState(1);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isUploading, setIsUploading] = useState(false);

    // Form setup (omitted for brevity, assume unchanged logic)
    const companyForm = useForm<CompanyFormValues>({
        resolver: zodResolver(companySchema),
        defaultValues: {
            name: "",
            tin: "",
            vatNumber: "",
            bpNumber: "",
            phone: "",
            email: "",
            address: "",
            city: "Harare",
            logoUrl: "",
            currency: "USD",
        }
    });

    // ... handleFileUpload and useQuery logic ...

    const StepIndicator = ({ step, label, current }: { step: number; label: string; current: number }) => (
        <div className="flex flex-col items-center gap-2 flex-1">
            <div className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center font-bold border-2 transition-all duration-500",
                step === current ? "bg-violet-600 text-white border-violet-600 shadow-xl scale-110" :
                    step < current ? "bg-emerald-500 border-emerald-500 text-white" : "border-slate-200 text-slate-400 bg-white"
            )}>
                {step < current ? <CheckCircle className="w-5 h-5" /> : step}
            </div>
            <span className={cn(
                "text-[10px] font-black uppercase tracking-[0.2em]",
                step === current ? "text-violet-600" : "text-slate-400"
            )}>{label}</span>
        </div>
    );

    return (
        <div className="min-h-screen bg-slate-50 flex overflow-hidden font-jakarta">
            {/* Left: Guidance Sidebar (Desktop only) */}
            <div className="hidden lg:flex w-[420px] bg-slate-900 p-12 flex-col relative overflow-hidden shrink-0">
                <div className="absolute top-0 right-0 w-full h-full bg-gradient-to-br from-violet-600/20 to-blue-600/20" />
                <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-violet-500/20 rounded-full blur-[100px]" />
                
                <div className="relative z-10 space-y-12">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-lg">
                            <Building2 className="w-6 h-6 text-slate-900" />
                        </div>
                        <span className="text-xl font-black text-white italic tracking-tight">ZimInvoice Pro</span>
                    </div>

                    <div className="space-y-6">
                        <h2 className="text-3xl font-black text-white leading-tight">
                            Build your business on a <span className="text-sky-400">compliant</span> foundation.
                        </h2>
                        <p className="text-lg text-slate-400 leading-relaxed">
                            Welcome to the future of Zimbabwe's fiscal management. We're here to help you navigate ZIMRA regulations with ease.
                        </p>
                    </div>

                    <div className="space-y-4 pt-12">
                        {[
                            { title: "ZIMRA Registered", desc: "Official verification for tax records", icon: ShieldCheck },
                            { title: "VAT Compliant", desc: "Automatic rate calculations", icon: Zap },
                            { title: "Secure Data", desc: "Military-grade encryption", icon: Lock }
                        ].map((item, i) => (
                            <div key={i} className="flex gap-4 p-4 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
                                <item.icon className="w-5 h-5 text-violet-400 shrink-0" />
                                <div>
                                    <h4 className="text-sm font-bold text-white">{item.title}</h4>
                                    <p className="text-xs text-slate-500">{item.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="mt-auto relative z-10 pt-12">
                    <p className="text-xs text-slate-500 border-t border-white/10 pt-8">
                        &copy; 2026 ZimInvoice Pro. All ZIMRA compliance standards enforced.
                    </p>
                </div>
            </div>

            {/* Right: Actual Form */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-12 lg:p-20 flex items-center justify-center bg-white">
                <div className="max-w-xl w-full space-y-10 py-12">
                    {/* Header */}
                    <div className="space-y-3">
                        <h2 className="text-3xl font-black text-slate-900 tracking-tight">Complete Organization Profile</h2>
                        <p className="text-slate-500 font-medium">Step {currentStep} of 2 &mdash; {currentStep === 1 ? "Organization Basics" : "Tax & Compliance"}</p>
                    </div>

                    {/* Progress Bar */}
                    <div className="flex items-center gap-2 max-w-sm">
                        <StepIndicator step={1} label="Company" current={currentStep} />
                        <div className="h-0.5 w-12 bg-slate-100 relative top-[-10px]">
                            <div className={cn("h-full bg-violet-600 transition-all duration-500", currentStep > 1 ? "w-full" : "w-0")} />
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
                                                    <img src={companyForm.watch("logoUrl")} className="w-full h-full object-cover" />
                                                ) : (
                                                    <ImagePlus className="w-8 h-8 text-slate-300 group-hover:text-violet-500 transition-colors" />
                                                )}
                                                <input type="file" onChange={handleFileUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
                                            </div>
                                            <div className="absolute -bottom-2 -right-2 bg-white p-1 rounded-lg border shadow-sm group-hover:scale-110 transition-transform">
                                                <UploadCloud className="w-3.5 h-3.5 text-slate-400" />
                                            </div>
                                        </div>
                                        <div className="space-y-1">
                                            <h4 className="text-sm font-bold text-slate-900">Brand Identity</h4>
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
                                                    <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400">Registered Name</FormLabel>
                                                    <FormControl>
                                                        <Input placeholder="Acme (Pvt) Ltd" {...field} className="h-12 bg-slate-50/50 border-slate-100 focus:bg-white focus:ring-4 focus:ring-violet-500/10 transition-all rounded-xl font-bold" />
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
                                                    <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400">Business Email</FormLabel>
                                                    <FormControl>
                                                        <Input placeholder="office@acme.com" {...field} className="h-12 bg-slate-50/50 border-slate-100 rounded-xl font-bold" />
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
                                                <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400">Physical Address</FormLabel>
                                                <FormControl>
                                                    <Textarea placeholder="No. 12 Street Name, Harare" {...field} className="min-h-[100px] bg-slate-50/50 border-slate-100 rounded-xl font-bold p-4 focus:bg-white" />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <FormField
                                            control={companyForm.control}
                                            name="city"
                                            render={({ field }) => (
                                                <FormItem className="space-y-2">
                                                    <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400">City</FormLabel>
                                                    <FormControl>
                                                        <Input placeholder="Harare" {...field} className="h-12 bg-slate-50/50 border-slate-100 rounded-xl font-bold" />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={companyForm.control}
                                            name="phone"
                                            render={({ field }) => (
                                                <FormItem className="space-y-2">
                                                    <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400">Phone</FormLabel>
                                                    <FormControl>
                                                        <Input placeholder="+263 ..." {...field} className="h-12 bg-slate-50/50 border-slate-100 rounded-xl font-bold" />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>
                                </div>

                                <div className="pt-6 border-t border-slate-100">
                                    <Button
                                        type="button"
                                        className="btn-gradient w-full h-14 text-sm font-black uppercase tracking-widest rounded-2xl active:scale-95 shadow-xl shadow-transparent hover:shadow-violet-600/20 transition-all"
                                        onClick={async () => {
                                            const isValid = await companyForm.trigger(["name", "email", "phone", "address", "city"]);
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
                            <form onSubmit={companyForm.handleSubmit(onFinalSubmit)} className="space-y-10 animate-in fade-in slide-in-from-right-4 duration-500">
                                <div className="space-y-6">
                                    <div className="p-6 bg-slate-900 rounded-[2rem] text-white space-y-2 shadow-2xl relative overflow-hidden group">
                                        <div className="absolute top-0 right-0 w-32 h-32 bg-violet-600/20 translate-x-10 -translate-y-10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700" />
                                        <div className="flex items-center gap-3 relative z-10">
                                            <AlertCircle className="w-5 h-5 text-violet-400" />
                                            <h4 className="text-base font-bold">Tax Compliance Info</h4>
                                        </div>
                                        <p className="text-xs text-slate-400 leading-relaxed relative z-10">
                                            Please verify these details from your <span className="text-white font-bold italic">ZIMRA Registration Certificate</span>. Mismatched details can lead to submission errors.
                                        </p>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                        <FormField
                                            control={companyForm.control}
                                            name="tin"
                                            render={({ field }) => (
                                                <FormItem className="space-y-2 flex-1">
                                                    <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400">Taxpayer ID (TIN)</FormLabel>
                                                    <FormControl>
                                                        <Input placeholder="10XXXXXX" {...field} className="h-12 bg-slate-50/50 border-slate-100 rounded-xl font-bold font-mono tracking-widest" />
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
                                                    <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400">VAT Number</FormLabel>
                                                    <FormControl>
                                                        <Input placeholder="9XXXXXX" {...field} className="h-12 bg-slate-50/50 border-slate-100 rounded-xl font-bold font-mono tracking-widest" />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                        <FormField
                                            control={companyForm.control}
                                            name="bpNumber"
                                            render={({ field }) => (
                                                <FormItem className="space-y-2 flex-1">
                                                    <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400">BP Number</FormLabel>
                                                    <FormControl>
                                                        <Input placeholder="10XXXXXX" {...field} className="h-12 bg-slate-50/50 border-slate-100 rounded-xl font-bold font-mono tracking-widest" />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={companyForm.control}
                                            name="currency"
                                            render={({ field }) => (
                                                <FormItem className="space-y-2 flex-1">
                                                  <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400">Reporting Currency</FormLabel>
                                                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                    <FormControl>
                                                      <SelectTrigger className="h-12 bg-slate-50/50 border-slate-100 rounded-xl font-bold">
                                                        <SelectValue placeholder="Base Currency" />
                                                      </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                      <SelectItem value="USD">USD - US Dollar</SelectItem>
                                                      <SelectItem value="ZWG">ZWG - Zimbabwe Gold</SelectItem>
                                                    </SelectContent>
                                                  </Select>
                                                  <FormMessage />
                                                </FormItem>
                                            )}
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
                                        className="btn-gradient flex-1 h-14 text-sm font-black uppercase tracking-widest rounded-2xl shadow-2xl active:scale-95 transition-all"
                                        disabled={isSubmitting}
                                    >
                                        {isSubmitting ? (
                                            <><Loader2 className="w-5 h-5 mr-3 animate-spin"/> Finalizing...</>
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
        </div>
    );
}
