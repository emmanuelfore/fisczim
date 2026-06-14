import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useCompanies } from "@/hooks/use-companies";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { Redirect } from "wouter";
import { Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useBranding } from "@/hooks/use-branding";
import { isElectron } from "@/lib/utils";
import { isStorageBroken } from "@/lib/offline-db";

export default function AuthPage() {
  const { user, isLoading, loginWithPassword, registerWithPassword } =
    useAuth();
  const { toast } = useToast();
  const { brand } = useBranding();
  // Gate on !!user so this never fires when unauthenticated
  const {
    data: companies,
    isLoading: isLoadingCompanies,
    isError: isCompaniesError,
  } = useCompanies(!!user, user?.id ?? null);
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
  const [signupData, setSignupData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isBrokenStorage, setIsBrokenStorage] = useState(false);

  useEffect(() => {
    if (isStorageBroken()) {
      setIsBrokenStorage(true);
      setError(
        "Local storage is corrupted. Some offline features and login caching may not work.",
      );
    }
  }, []);

  const handleFixStorage = async () => {
    if (!window.electronAPI?.clearStorage) return;
    try {
      if (
        confirm(
          "This will clear your local terminal data to fix corruption. You will need to sign in again. Continue?",
        )
      ) {
        await window.electronAPI.clearStorage();
        window.location.reload();
      }
    } catch (err: any) {
      setError("Failed to reset storage: " + err.message);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setError(null);
      setIsLoggingIn(true);
      await loginWithPassword({
        email: loginData.email,
        password: loginData.password,
      });
      setIsLoggingIn(false);
    } catch (error: any) {
      console.error("Login failed:", error);
      setError(error.message || "Invalid email or password");
      setIsLoggingIn(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    if (signupData.password !== signupData.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    try {
      setError(null);
      setIsLoggingIn(true);
      await registerWithPassword({
        email: signupData.email,
        password: signupData.password,
        name: signupData.name,
      });
      setSuccessMsg("Account created! Logging you in...");
      setIsLoggingIn(false);
    } catch (error: any) {
      console.error("Signup failed:", error);
      setError(error.message || "Registration failed");
      setIsLoggingIn(false);
    }
  };

  useEffect(() => {
    if (!isLoading) setIsLoggingIn(false);
  }, [isLoading, user]);

  useEffect(() => {
    if (user && !isLoading && !isLoadingCompanies) {
      console.log("[Auth] Redirect check:", {
        hasUser: !!user,
        isError: isCompaniesError,
        companiesCount: companies?.length,
        isArray: Array.isArray(companies),
      });

      if (isCompaniesError) {
        toast({
          title: "Connection Issue",
          description: "Failed to load your organizations. Going to POS mode.",
          variant: "destructive",
        });
        setLocation("/pos");
        return;
      }

      if (Array.isArray(companies)) {
        if (companies.length > 0) {
          setLocation("/dashboard");
        } else {
          console.log("[Auth] No companies found, redirecting to onboarding");
          setLocation("/onboarding");
        }
      }
    }
  }, [
    user,
    companies,
    isLoading,
    isLoadingCompanies,
    isCompaniesError,
    setLocation,
    toast,
  ]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user && (isLoadingCompanies || !Array.isArray(companies))) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 flex-col gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-slate-400  animate-pulse">
          Syncing organization profile...
        </p>
      </div>
    );
  }

  if (user) {
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 relative p-4 lg:p-8">
      <div className="absolute top-0 left-0 w-full h-full bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03] pointer-events-none" />
      
      <div className="w-full max-w-[440px] relative z-10 flex flex-col items-center">
        <div className="mb-8">
          <img
            src="/fiscalstack-full-logo.png"
            alt="FiscalStack logo"
            className="h-9 w-auto object-contain drop-shadow-sm opacity-90 hover:opacity-100 transition-opacity"
          />
        </div>

        <Card className="w-full card-depth border border-slate-200/70 shadow-[0_24px_60px_-24px_rgba(2,6,23,0.15)] bg-white">
          <CardHeader className="text-center pb-4 pt-8">
            <CardTitle className="font-display text-[22px] font-bold text-slate-900 tracking-tight">
              {mode === "login" ? "Access your workspace" : "Sign Up"}
            </CardTitle>
            <CardDescription className="text-slate-500 text-[15px] mt-2">
              {mode === "login"
                ? "Sign in to continue managing invoices and compliance."
                : "Create an account to get started."}
            </CardDescription>
          </CardHeader>
          <CardContent className="px-8 pb-8">
            {error && (
              <div className="mb-4 p-3 rounded-md bg-red-50 text-red-500 border border-red-100 text-sm">
                {error}
              </div>
            )}

            {successMsg && (
              <div className="mb-4 p-3 rounded-md bg-emerald-50 text-emerald-600 border border-emerald-100 text-sm">
                {successMsg}
              </div>
            )}

            {isElectron() && isBrokenStorage && (
              <div className="mb-6 p-4 rounded-lg bg-amber-50 border border-amber-200">
                <p className="text-amber-800 text-xs font-medium mb-3">
                  Local database access failed. This is often caused by
                  unexpected app closure.
                </p>
                <Button
                  onClick={handleFixStorage}
                  variant="outline"
                  className="w-full border-amber-400 text-amber-700 hover:bg-amber-100 h-9 text-xs"
                >
                  ⚠ Fix Terminal Data (Storage Reset)
                </Button>
              </div>
            )}

            {mode === "login" ? (
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Work Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="name@company.com"
                    value={loginData.email}
                    onChange={(e) =>
                      setLoginData({ ...loginData, email: e.target.value })
                    }
                    required
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    <Link href="/forgot-password">
                      <Button
                        variant="link"
                        className="p-0 h-auto text-xs text-primary font-medium"
                        type="button"
                      >
                        Forgot password?
                      </Button>
                    </Link>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    value={loginData.password}
                    onChange={(e) =>
                      setLoginData({ ...loginData, password: e.target.value })
                    }
                    required
                    className="h-11"
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full h-11 text-[15px] font-semibold mt-2"
                  disabled={isLoggingIn}
                >
                  {isLoggingIn ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : null}
                  Sign In
                </Button>

                <div className="text-center text-slate-500 text-sm mt-6">
                  Don't have an account?{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setMode("signup");
                      setError(null);
                    }}
                    className="text-primary font-semibold hover:underline"
                  >
                    Sign Up
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleSignup} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name</Label>
                  <Input
                    id="name"
                    placeholder="John Doe"
                    value={signupData.name}
                    onChange={(e) =>
                      setSignupData({ ...signupData, name: e.target.value })
                    }
                    required
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Work Email</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    placeholder="name@company.com"
                    value={signupData.email}
                    onChange={(e) =>
                      setSignupData({ ...signupData, email: e.target.value })
                    }
                    required
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Password</Label>
                  <Input
                    id="signup-password"
                    type="password"
                    value={signupData.password}
                    onChange={(e) =>
                      setSignupData({ ...signupData, password: e.target.value })
                    }
                    required
                    minLength={6}
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm Password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    value={signupData.confirmPassword}
                    onChange={(e) =>
                      setSignupData({
                        ...signupData,
                        confirmPassword: e.target.value,
                      })
                    }
                    required
                    minLength={6}
                    className="h-11"
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full h-11 text-[15px] font-semibold mt-2"
                  disabled={isLoggingIn}
                >
                  {isLoggingIn ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : null}
                  Create Account
                </Button>

                <div className="text-center text-slate-500 text-sm mt-6">
                  Already have access?{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setMode("login");
                      setError(null);
                    }}
                    className="text-primary font-semibold hover:underline"
                  >
                    Sign In
                  </button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
