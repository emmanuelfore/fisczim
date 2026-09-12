// Lekaku by FiscalStack — Lesotho auth page (lekaku branch only).
// Same login/register logic as the main auth flow, wrapped in a Lesotho
// split-screen layout so the hosted Lesotho site feels fully separate.
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useCompanies } from "@/hooks/use-companies";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Redirect, useLocation, Link } from "wouter";
import { Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { isElectron } from "@/lib/utils";
import { isStorageBroken } from "@/lib/offline-db";
import { useI18n } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/language-switcher";
import { LesothoMark } from "@/components/lesotho-logo";

const GREEN_DARK = "#0A5C3C";
const GREEN = "#0E7A4F";
const INK = "#10231A";

export default function LekakuAuth() {
  const { user, isLoading, loginWithPassword, registerWithPassword } = useAuth();
  const { toast } = useToast();
  const { t } = useI18n();
  const { data: companies, isLoading: isLoadingCompanies, isError: isCompaniesError } =
    useCompanies(!!user, user?.id ?? null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [, setLocation] = useLocation();

  const getInitialMode = () => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      return params.get("mode") === "signup" ? "signup" : "login";
    }
    return "login";
  };

  const [mode, setMode] = useState<"login" | "signup">(getInitialMode);
  const [loginData, setLoginData] = useState({ email: "", password: "" });
  const [signupData, setSignupData] = useState({ name: "", email: "", password: "", confirmPassword: "" });
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isBrokenStorage, setIsBrokenStorage] = useState(false);

  useEffect(() => {
    if (isStorageBroken()) {
      setIsBrokenStorage(true);
      setError(t("Local storage is corrupted. Some offline features and login caching may not work."));
    }
  }, []);

  const handleFixStorage = async () => {
    if (!window.electronAPI?.clearStorage) return;
    try {
      if (confirm(t("This will clear your local terminal data to fix corruption. You will need to sign in again. Continue?"))) {
        await window.electronAPI.clearStorage();
        window.location.reload();
      }
    } catch (err: any) {
      setError(t("Failed to reset storage: ") + err.message);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setError(null);
      setIsLoggingIn(true);
      await loginWithPassword({ email: loginData.email, password: loginData.password });
      setIsLoggingIn(false);
    } catch (error: any) {
      setError(error.message || t("Invalid email or password"));
      setIsLoggingIn(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (signupData.password !== signupData.confirmPassword) {
      setError(t("Passwords do not match"));
      return;
    }
    try {
      setError(null);
      setIsLoggingIn(true);
      const data = await registerWithPassword({
        email: signupData.email,
        password: signupData.password,
        name: signupData.name,
      });
      if (data?.accessToken) {
        setSuccessMsg(t("Account created! Logging you in..."));
      } else {
        setSuccessMsg(t("Account created! Please check your email to verify your account before logging in."));
      }
      setIsLoggingIn(false);
    } catch (error: any) {
      setError(error.message || t("Registration failed"));
      setIsLoggingIn(false);
    }
  };

  useEffect(() => {
    if (!isLoading) setIsLoggingIn(false);
  }, [isLoading, user]);

  useEffect(() => {
    if (user && !isLoading && !isLoadingCompanies) {
      if (isCompaniesError) {
        toast({
          title: t("Connection Issue"),
          description: t("Failed to load your organizations. Going to POS mode."),
          variant: "destructive",
        });
        setLocation("/pos");
        return;
      }
      if (Array.isArray(companies)) {
        setLocation(companies.length > 0 ? "/dashboard" : "/onboarding");
      }
    }
  }, [user, companies, isLoading, isLoadingCompanies, isCompaniesError, setLocation, toast, t]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ background: "#FAF8F2" }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: GREEN }} />
      </div>
    );
  }

  if (user && (isLoadingCompanies || !Array.isArray(companies))) {
    return (
      <div className="flex items-center justify-center min-h-screen flex-col gap-4" style={{ background: "#FAF8F2" }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: GREEN }} />
        <p className="animate-pulse" style={{ color: "#5A6660" }}>{t("Syncing organization profile...")}</p>
      </div>
    );
  }

  if (user) return null;

  return (
    <div className="min-h-screen flex" style={{ background: "#FAF8F2" }}>
      {/* Left — Lesotho brand panel */}
      <div
        className="hidden lg:flex flex-col justify-between"
        style={{ width: "44%", background: GREEN_DARK, color: "#fff", padding: 48, position: "relative", overflow: "hidden" }}
      >
        <div aria-hidden style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 70% 50% at 85% 10%, rgba(27,79,156,0.5) 0%, transparent 65%), radial-gradient(ellipse 60% 50% at 5% 95%, rgba(255,255,255,0.08) 0%, transparent 60%)" }} />
        <div style={{ position: "relative" }}>
          <Link href="/">
            <span style={{ display: "inline-flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <LesothoMark size={38} color="#fff" />
              <span>
                <span style={{ display: "block", fontWeight: 800, fontSize: 20, fontFamily: "Georgia, serif" }}>FiscalStack</span>
                <span style={{ display: "block", fontSize: 10, letterSpacing: "0.16em", opacity: 0.75, fontFamily: "monospace" }}>LESOTHO</span>
              </span>
            </span>
          </Link>
        </div>
        <div style={{ position: "relative" }}>
          <h2 style={{ fontFamily: "Georgia, serif", fontSize: 40, lineHeight: 1.1, margin: "0 0 14px", fontWeight: 700 }}>
            Lumela.<br />Let's get fiscal.
          </h2>
          <p style={{ opacity: 0.75, lineHeight: 1.7, maxWidth: 380 }}>
            RSL LEKAKU-compliant invoicing, loti accounting and offline POS for Basotho businesses.
          </p>
          <ul style={{ listStyle: "none", padding: 0, marginTop: 28, display: "flex", flexDirection: "column", gap: 12 }}>
            {["LEKAKU fiscalized receipts with RSL QR", "LSL-first books · 15% VAT handled", "Cash, card & bank payments", "Offline POS for the highlands"].map((f) => (
              <li key={f} style={{ display: "flex", gap: 10, fontSize: 14, opacity: 0.9 }}>
                <span style={{ color: "#7BE3A8" }}>✓</span>{f}
              </li>
            ))}
          </ul>
        </div>
        <div style={{ position: "relative", fontFamily: "monospace", fontSize: 11, opacity: 0.6 }}>
          Khotso · Pula · Nala — Maseru, Lesotho
        </div>
      </div>

      {/* Right — form */}
      <div className="flex-1 flex items-center justify-center p-4 lg:p-8 relative">
        <div className="absolute top-4 right-4 z-20">
          <LanguageSwitcher />
        </div>
        <div className="w-full max-w-[440px] flex flex-col items-center">
          <Link href="/">
            <span className="lg:hidden mb-6 inline-flex items-center gap-2 cursor-pointer" style={{ color: INK, fontWeight: 800, fontFamily: "Georgia, serif", fontSize: 22 }}>
              <LesothoMark size={30} color={GREEN_DARK} />
              FiscalStack
            </span>
          </Link>

          <Card className="w-full border shadow-[0_24px_60px_-24px_rgba(16,35,26,0.25)]" style={{ borderColor: "#EDE9DD" }}>
            <CardHeader className="text-center pb-4 pt-8">
              <div
                className="mx-auto mb-3"
                style={{ fontFamily: "monospace", fontSize: 10, letterSpacing: "0.16em", color: GREEN, background: "rgba(14,122,79,0.08)", border: "1px solid rgba(14,122,79,0.2)", borderRadius: 999, padding: "4px 12px", display: "inline-block" }}
              >
                RSL · KINGDOM OF LESOTHO
              </div>
              <CardTitle className="text-[22px] font-bold tracking-tight" style={{ color: INK }}>
                {mode === "login" ? t("Welcome back") : t("Create your Lesotho workspace")}
              </CardTitle>
              <CardDescription className="text-[15px] mt-2" style={{ color: "#5A6660" }}>
                {mode === "login"
                  ? t("Sign in to invoice in loti and stay LEKAKU compliant.")
                  : t("Start free — LSL billing, RSL compliant.")}
              </CardDescription>
            </CardHeader>
            <CardContent className="px-8 pb-8">
              {error && (
                <div className="mb-4 p-3 rounded-md bg-red-50 text-red-500 border border-red-100 text-sm">{error}</div>
              )}
              {successMsg && (
                <div className="mb-4 p-3 rounded-md bg-emerald-50 text-emerald-600 border border-emerald-100 text-sm">{successMsg}</div>
              )}
              {isElectron() && isBrokenStorage && (
                <div className="mb-6 p-4 rounded-lg bg-amber-50 border border-amber-200">
                  <p className="text-amber-800 text-xs font-medium mb-3">
                    {t("Local database access failed. This is often caused by unexpected app closure.")}
                  </p>
                  <Button onClick={handleFixStorage} variant="outline" className="w-full border-amber-400 text-amber-700 hover:bg-amber-100 h-9 text-xs">
                    {t("Fix Terminal Data (Storage Reset)")}
                  </Button>
                </div>
              )}

              {mode === "login" ? (
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">{t("Work Email")}</Label>
                    <Input id="email" type="email" placeholder="name@company.co.ls" value={loginData.email}
                      onChange={(e) => setLoginData({ ...loginData, email: e.target.value })} required className="h-11" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password">{t("Password")}</Label>
                      <Link href="/forgot-password">
                        <Button variant="link" className="p-0 h-auto text-xs font-medium" type="button" style={{ color: GREEN }}>
                          {t("Forgot password?")}
                        </Button>
                      </Link>
                    </div>
                    <Input id="password" type="password" value={loginData.password}
                      onChange={(e) => setLoginData({ ...loginData, password: e.target.value })} required className="h-11" />
                  </div>
                  <Button type="submit" className="w-full h-11 text-[15px] font-semibold mt-2 text-white"
                    style={{ background: GREEN_DARK }} disabled={isLoggingIn}>
                    {isLoggingIn ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    {t("Sign In")}
                  </Button>
                  <div className="text-center text-sm mt-6" style={{ color: "#5A6660" }}>
                    {t("Don't have an account?")}{" "}
                    <button type="button" onClick={() => { setMode("signup"); setError(null); }}
                      className="font-semibold hover:underline" style={{ color: GREEN }}>
                      {t("Sign Up")}
                    </button>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleSignup} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">{t("Full Name")}</Label>
                    <Input id="name" placeholder="Lineo Molefe" value={signupData.name}
                      onChange={(e) => setSignupData({ ...signupData, name: e.target.value })} required className="h-11" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">{t("Work Email")}</Label>
                    <Input id="signup-email" type="email" placeholder="name@company.co.ls" value={signupData.email}
                      onChange={(e) => setSignupData({ ...signupData, email: e.target.value })} required className="h-11" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password">{t("Password")}</Label>
                    <Input id="signup-password" type="password" value={signupData.password}
                      onChange={(e) => setSignupData({ ...signupData, password: e.target.value })} required minLength={6} className="h-11" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">{t("Confirm Password")}</Label>
                    <Input id="confirm-password" type="password" value={signupData.confirmPassword}
                      onChange={(e) => setSignupData({ ...signupData, confirmPassword: e.target.value })} required minLength={6} className="h-11" />
                  </div>
                  <Button type="submit" className="w-full h-11 text-[15px] font-semibold mt-2 text-white"
                    style={{ background: GREEN_DARK }} disabled={isLoggingIn}>
                    {isLoggingIn ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    {t("Create Account")}
                  </Button>
                  <div className="text-center text-sm mt-6" style={{ color: "#5A6660" }}>
                    {t("Already have access?")}{" "}
                    <button type="button" onClick={() => { setMode("login"); setError(null); }}
                      className="font-semibold hover:underline" style={{ color: GREEN }}>
                      Sign In
                    </button>
                  </div>
                </form>
              )}
              <p className="text-center mt-6" style={{ fontFamily: "monospace", fontSize: 10, color: "#8A938D" }}>
                Protected LEKAKU session · Maseru · LSL
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
