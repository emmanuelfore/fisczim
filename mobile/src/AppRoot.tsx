import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { assertEnv } from "./lib/env";
import { supabase } from "./lib/supabase";
import { apiJson } from "./lib/api";
import { PremiumColors } from "./ui/PremiumColors";
import { LoginScreen } from "./screens/LoginScreen";
import { ForgotPasswordScreen } from "./screens/ForgotPasswordScreen";

import { CompanySelectScreen } from "./screens/CompanySelectScreen";
import { POSScreen } from "./screens/POSScreen";
import { ReportsScreen } from "./screens/ReportsScreen";
import { ProfileScreen } from "./screens/ProfileScreen";
import { InventoryScreen } from "./screens/InventoryScreen";
import { StockInScreen } from "./screens/StockInScreen";
import { CustomersScreen } from "./screens/CustomersScreen";
import { SuppliersScreen } from "./screens/SuppliersScreen";
import { ExpensesScreen } from "./screens/ExpensesScreen";
import { OnboardingScreen } from "./screens/OnboardingScreen";
import { StockTakeScreen } from "./screens/StockTakeScreen";
import { AppDrawer } from "./ui/AppDrawer";
import { BottomTabs } from "./ui/BottomTabs";
import { Button } from "./ui/Button";
import { getSelectedCompanyId, setSelectedCompanyId } from "./lib/storage";
import { PrinterProvider } from "./contexts/PrinterContext";

type Stage = "boot" | "login" | "forgot-password" | "onboarding" | "company" | "main";

type ScreenName = "pos" | "reports" | "profile" | "inventory" | "stockin" | "customers" | "suppliers" | "expenses" | "stocktake";

export function AppRoot() {
  const [stage, setStage] = useState<Stage>("boot");
  const [bootError, setBootError] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [currentScreen, setCurrentScreen] = useState<ScreenName>("pos");
  const [showDrawer, setShowDrawer] = useState(false);
  const [userName, setUserName] = useState("Cashier");
  const [userRole, setUserRole] = useState("member");
  const [userId, setUserId] = useState<string | null>(null);
  const [companies, setCompanies] = useState<any[]>([]);

  const [retryCount, setRetryCount] = useState(0);

  const fetchUser = async (isBoot: boolean = false) => {
    // 1. Try to load from cache immediately for speed
    let cachedData: any[] = [];
    try {
      const cached = await AsyncStorage.getItem('cached_companies');
      if (cached) {
        cachedData = JSON.parse(cached);
        if (Array.isArray(cachedData) && cachedData.length > 0) {
          setCompanies(cachedData);
        }
      }
    } catch { /* ignore cache errors */ }

    // 2. Fetch user metadata from Supabase
    try {
      const { data } = await Promise.race([
        supabase.auth.getUser(),
        new Promise<{ data: { user: null } }>((resolve) => 
          setTimeout(() => resolve({ data: { user: null } }), 4000)
        )
      ]);
      const user = data?.user;
      if (user) {
        setUserName(
          user.user_metadata?.full_name ||
          user.user_metadata?.name ||
          user.email?.split("@")[0] ||
          "Cashier"
        );
        setUserId(user.id);
      }
    } catch (e) {
      console.warn("[Auth] Failed to fetch user metadata:", e);
    }
    
    // 3. Fetch fresh companies from API
    try {
      // If we are booting and have cache, we can be more aggressive with timeouts
      // apiJson already has a 30s timeout, but we can wrap it or just rely on it.
      const freshCompanies = await apiJson<any[]>('/api/companies');
      
      if (Array.isArray(freshCompanies)) {
        await AsyncStorage.setItem('cached_companies', JSON.stringify(freshCompanies));
        setCompanies(freshCompanies);
        return freshCompanies;
      }
      return cachedData.length > 0 ? cachedData : [];
    } catch (e: any) {
      console.warn("[API] Companies fetch failed:", e);
      
      // If we have cached data, return it instead of failing the boot
      if (cachedData.length > 0) return cachedData;
      
      // If this is a boot and we have absolutely no data, then we must error
      if (isBoot) {
        throw new Error(`Connection error: ${e.message || "Could not reach server"}. Please ensure you have an active internet connection.`);
      }
      return [];
    }
  };

  useEffect(() => {
    let cancelled = false;
    let initialized = false;

    const initialize = async () => {
      if (initialized) return;
      initialized = true;

      try {
        setBootError(null);
        assertEnv();

        if (!supabase) {
          throw new Error("Supabase client not initialized. Check your environment variables.");
        }

        // Get cached company ID early
        const [cachedCompanyId, sessionResult] = await Promise.all([
          getSelectedCompanyId(),
          // Race getSession against a timeout to prevent hanging on boot
          Promise.race([
            supabase.auth.getSession(),
            new Promise<{ data: { session: null } }>((resolve) => 
              setTimeout(() => resolve({ data: { session: null } }), 5000)
            )
          ])
        ]);

        if (cancelled) return;
        setCompanyId(cachedCompanyId);

        const authed = !!sessionResult.data.session?.access_token;
        
        if (!authed) {
          setStage("login");
        } else {
          // Perform the boot fetch
          const companiesList = await fetchUser(true);
          if (cancelled) return;

          const cachedId = await getSelectedCompanyId();
          const validCompany = companiesList.find(c => (c && c.id === cachedId));

          if (validCompany) {
            if (validCompany.role) setUserRole(validCompany.role);
            setCompanyId(cachedId);
            setStage("main");
          } else {
            await setSelectedCompanyId(null);
            setCompanyId(null);
            setStage(companiesList.length > 0 ? "company" : "onboarding");
          }
        }
      } catch (e: any) {
        console.error("[Auth] Initialization error:", e);
        if (!cancelled) {
          setBootError(e?.message || "Unknown error during initialization");
          setStage("boot");
        }
      }
    };

    initialize();

    if (!supabase) return;

    const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (cancelled) return;
      try {
        console.log("[Auth] Event:", event, session ? "Session active" : "No session");
        const authed = !!session?.access_token;
        if (!authed) {
          setStage("login");
          setCompanyId(null);
        } else if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
          // Silent refresh of user data when auth state changes meaningfully
          await fetchUser(false);
        }
      } catch (e) {
        console.error("[Auth] Error on auth change:", e);
      }
    });

    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, [retryCount]);

  const handleLogout = async () => {
    setShowDrawer(false);
    await supabase.auth.signOut();
    await setSelectedCompanyId(null);
    setCompanyId(null);
    setStage("login");
    setBootError(null); // Clear error on logout
  };

  const content = useMemo(() => {
    if (bootError) {
      return (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: PremiumColors.bg.primary }}>
          <Text style={{ color: "#ff4757", fontWeight: "900", fontSize: 20, marginBottom: 12 }}>
            Connection Error
          </Text>
          <Text style={{ color: PremiumColors.text.primary, textAlign: "center", marginBottom: 24, fontSize: 14, lineHeight: 20 }}>
            {bootError}
          </Text>
          
          <Button 
            title="Try Again" 
            onPress={() => {
              setRetryCount(prev => prev + 1);
            }} 
            style={{ width: "100%", marginBottom: 12 }}
          />

          <Button 
            title="Sign Out" 
            variant="ghost" 
            onPress={handleLogout} 
            style={{ width: "100%" }}
          />
        </View>
      );
    }

    if (stage === "boot") {
      return (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={PremiumColors.amber.primary} />
        </View>
      );
    }

    if (stage === "login") {
      return (
        <LoginScreen
          onForgotPassword={() => setStage("forgot-password")}
          onLoggedIn={async () => {
            setStage("boot");
            try {
              const companies = await fetchUser(true);
              const cachedId = await getSelectedCompanyId();
              const validCompany = companies.find((c: any) => c.id === cachedId);

              if (validCompany) {
                if (validCompany.role) setUserRole(validCompany.role);
                setCompanyId(cachedId);
                setStage("main");
              } else {
                await setSelectedCompanyId(null);
                setCompanyId(null);
                setStage(companies.length > 0 ? "company" : "onboarding");
              }
            } catch (e: any) {
              setBootError(e.message || "Failed to initialize after login");
              setStage("boot");
            }
          }}
        />
      );
    }

    if (stage === "forgot-password") {
      return <ForgotPasswordScreen onBack={() => setStage("login")} />;
    }

    if (stage === "onboarding") {

      return (
        <OnboardingScreen
          onComplete={async (id) => {
            await setSelectedCompanyId(id);
            setCompanyId(id);
            setStage("main");
          }}
          onSignOut={handleLogout}
        />
      );
    }

    if (stage === "company") {
      return (
        <CompanySelectScreen
          onSelected={async (id) => {
            if (id === -1) {
              setStage("onboarding");
              return;
            }
            
            // Re-sync role for the newly selected company
            const selected = companies.find(c => c.id === id);
            if (selected?.role) setUserRole(selected.role);
            
            await setSelectedCompanyId(id);
            setCompanyId(id);
            setStage("main");
          }}
          onSignOut={handleLogout}
        />
      );
    }

    if (!companyId) {
      setStage("company");
      return null;
    }

    return (
      <View style={{ flex: 1 }}>
        {currentScreen === "pos" && (
          <POSScreen 
            companyId={companyId} 
            userName={userName}
            onOpenDrawer={() => setShowDrawer(true)} 
          />
        )}
        {currentScreen === "reports" && (
          <ReportsScreen 
            onOpenDrawer={() => setShowDrawer(true)} 
            companyId={companyId}
            userRole={userRole}
            userId={userId || undefined}
            userName={userName}
            onNavigate={(screen) => setCurrentScreen(screen)}
          />
        )}
        {currentScreen === "profile" && (
          <ProfileScreen 
            onOpenDrawer={() => setShowDrawer(true)} 
            userName={userName}
            onLogout={handleLogout}
          />
        )}
        {currentScreen === "inventory" && (
          <InventoryScreen 
            onOpenDrawer={() => setShowDrawer(true)} 
            companyId={companyId}
          />
        )}
        {currentScreen === "stockin" && (
          <StockInScreen 
            onOpenDrawer={() => setShowDrawer(true)} 
            onClose={() => setCurrentScreen("inventory")}
            companyId={companyId}
          />
        )}
        {currentScreen === "customers" && (
          <CustomersScreen 
            onOpenDrawer={() => setShowDrawer(true)} 
            companyId={companyId}
          />
        )}
        {currentScreen === "suppliers" && (
          <SuppliersScreen 
            onOpenDrawer={() => setShowDrawer(true)} 
            companyId={companyId}
          />
        )}
        {currentScreen === "expenses" && (
          <ExpensesScreen 
            onOpenDrawer={() => setShowDrawer(true)} 
            companyId={companyId}
          />
        )}
        {currentScreen === "stocktake" && (
          <StockTakeScreen 
            companyId={companyId}
            onClose={() => setCurrentScreen("reports")}
          />
        )}

        <AppDrawer
          visible={showDrawer}
          onClose={() => setShowDrawer(false)}
          currentScreen={currentScreen}
          onNavigate={(screen) => setCurrentScreen(screen)}
          onLogout={handleLogout}
          userName={userName}
          userRole={userRole}
        />
        
        <BottomTabs
          currentScreen={currentScreen}
          onNavigate={(screen) => setCurrentScreen(screen)}
          onOpenDrawer={() => setShowDrawer(true)}
          userRole={userRole}
          userName={userName}
        />
      </View>
    );
  }, [bootError, stage, companyId, currentScreen, showDrawer, userName, userRole, companies]);

  return (
    <PrinterProvider>
      <View style={{ flex: 1, backgroundColor: PremiumColors.bg.base }}>
        {content}
      </View>
    </PrinterProvider>
  );
}

