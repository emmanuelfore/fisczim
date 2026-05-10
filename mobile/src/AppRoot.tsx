import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, AppState, AppStateStatus, Platform, ScrollView, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { assertEnv, ENV } from "./lib/env";
import { supabase } from "./lib/supabase";
import { apiJson } from "./lib/api";
import { PremiumColors } from "./ui/PremiumColors";
import { LoginScreen } from "./screens/LoginScreen";
import { ForgotPasswordScreen } from "./screens/ForgotPasswordScreen";
import { SignUpScreen } from "./screens/SignUpScreen";


import { CompanySelectScreen } from "./screens/CompanySelectScreen";
import { POSScreen } from "./screens/POSScreen";
import { DashboardScreen } from "./screens/DashboardScreen";
import { ReportsScreen } from "./screens/ReportsScreen";
import { ProfileScreen } from "./screens/ProfileScreen";
import { InventoryScreen } from "./screens/InventoryScreen";
import { StockInScreen } from "./screens/StockInScreen";
import { StockOperationsScreen } from "./screens/StockOperationsScreen";
import { CustomersScreen } from "./screens/CustomersScreen";
import { SuppliersScreen } from "./screens/SuppliersScreen";
import { ExpensesScreen } from "./screens/ExpensesScreen";
import { CashiersScreen } from "./screens/CashiersScreen";
import { OnboardingScreen } from "./screens/OnboardingScreen";
import { StockTakeScreen } from "./screens/StockTakeScreen";
import { AppDrawer } from "./ui/AppDrawer";
import { BottomTabs } from "./ui/BottomTabs";
import { Button } from "./ui/Button";
import { getSelectedCompanyId, setSelectedCompanyId } from "./lib/storage";
import { PrinterProvider } from "./contexts/PrinterContext";

type Stage = "boot" | "login" | "signup" | "forgot-password" | "onboarding" | "company" | "main";

type ScreenName = "dashboard" | "pos" | "reports" | "profile" | "inventory" | "stockin" | "stockops" | "customers" | "suppliers" | "expenses" | "cashiers" | "stocktake";

export function AppRoot() {
  const [stage, setStage] = useState<Stage>("boot");
  const [bootError, setBootError] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [currentScreen, setCurrentScreen] = useState<ScreenName>("dashboard");
  const [openCashCollectionSignal, setOpenCashCollectionSignal] = useState(0);
  const [showDrawer, setShowDrawer] = useState(false);
  const [userName, setUserName] = useState("Cashier");
  const [userRole, setUserRole] = useState("member");
  const [userId, setUserId] = useState<string | null>(null);
  const [companies, setCompanies] = useState<any[]>([]);

  const [retryCount, setRetryCount] = useState(0);
  const [bootStartTime] = useState(Date.now());
  const [showSlowMessage, setShowSlowMessage] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean | null>(true);
  const [diagResults, setDiagResults] = useState<string[] | null>(null);
  const [diagRunning, setDiagRunning] = useState(false);

  const runDiagnostics = async () => {
    setDiagRunning(true);
    const results: string[] = [];
    results.push(`📱 Platform: Android ${Platform.Version}`);
    results.push(`🌐 NetInfo online: ${isOnline}`);
    results.push(`🔗 API URL: ${ENV.apiBaseUrl}`);
    results.push(`🔗 Supabase URL: ${ENV.supabaseUrl}`);

    // Test 1: Can we reach Google (basic internet)?
    try {
      const r = await fetch('https://www.google.com', { method: 'HEAD' });
      results.push(`✅ Google: reachable (${r.status})`);
    } catch (e: any) {
      results.push(`❌ Google: ${e.message}`);
    }

    // Test 2: Can we reach Supabase?
    try {
      const r = await fetch(`${ENV.supabaseUrl}/rest/v1/`, { method: 'HEAD', headers: { apikey: ENV.supabaseAnonKey } });
      results.push(`✅ Supabase: reachable (${r.status})`);
    } catch (e: any) {
      results.push(`❌ Supabase: ${e.message}`);
    }

    // Test 3: Can we reach the API server health endpoint?
    try {
      const r = await fetch(`${ENV.apiBaseUrl}/api/health`, { method: 'GET' });
      const body = await r.text().catch(() => '');
      results.push(`✅ API Health: ${r.status} ${body.slice(0, 50)}`);
    } catch (e: any) {
      results.push(`❌ API Health: ${e.message}`);
    }

    // Test 4: Can we reach the API companies endpoint (authenticated)?
    try {
      const session = await supabase.auth.getSession();
      const token = session?.data?.session?.access_token;
      results.push(`🔑 Auth token: ${token ? 'present' : 'MISSING'}`);
      if (token) {
        const r = await fetch(`${ENV.apiBaseUrl}/api/companies`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const body = await r.text().catch(() => '');
        results.push(`✅ API Companies: ${r.status} (${body.length} bytes)`);
      }
    } catch (e: any) {
      results.push(`❌ API Companies: ${e.message}`);
    }

    // Test 5: TLS version check via httpbin
    try {
      const r = await fetch('https://httpbin.org/get');
      results.push(`✅ httpbin (TLS test): ${r.status}`);
    } catch (e: any) {
      results.push(`❌ httpbin (TLS test): ${e.message}`);
    }

    setDiagResults(results);
    setDiagRunning(false);
  };
  
  const lastOnlineState = useRef<boolean | null | undefined>(undefined);

  // Monitor connectivity status
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      if (state.isConnected !== lastOnlineState.current) {
         console.log("[Network] Connection type:", state.type, "Connected:", state.isConnected);
         lastOnlineState.current = state.isConnected;
         setIsOnline(state.isConnected);
      }
    });
    return () => unsubscribe();
  }, []);

  // Monitor app state (Foreground/Background)
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState: AppStateStatus) => {
      if (nextAppState === "active" && stage === "main") {
        console.log("[Sync] App returned to foreground, performing silent refresh...");
        fetchUser(false).catch(() => {});
      }
    });

    return () => subscription.remove();
  }, [stage]);

  useEffect(() => {
    if (stage === "boot") {
      const timer = setTimeout(() => setShowSlowMessage(true), 7000);
      return () => clearTimeout(timer);
    } else {
      setShowSlowMessage(false);
    }
  }, [stage, retryCount]);

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

    // If we know we are offline, don't even try the network
    if (isOnline === false) {
      console.log("[Boot] Device is offline, skipping network fetch.");
      return cachedData.length > 0 ? cachedData : [];
    }

    // 2. Fetch user metadata and companies in parallel for speed
    try {
      const metadataTimeout = isBoot ? 4000 : 8000;
      const apiTimeout = isBoot ? 8000 : 15000;

      const [metadataResult, freshCompanies] = await Promise.all([
        Promise.race([
          supabase.auth.getUser(),
          new Promise<{ data: { user: null } }>((resolve) => 
            setTimeout(() => resolve({ data: { user: null } }), metadataTimeout)
          )
        ]).catch(() => ({ data: { user: null } })),
        
        apiJson<any[]>('/api/companies', { timeout: apiTimeout }).catch((e) => {
          console.warn("[API] Fresh companies fetch failed:", e);
          return null;
        })
      ]);

      const user = metadataResult?.data?.user;
      if (user) {
        setUserName(
          user.user_metadata?.full_name ||
          user.user_metadata?.name ||
          user.email?.split("@")[0] ||
          "Cashier"
        );
        setUserId(user.id);
      }

      if (Array.isArray(freshCompanies)) {
        await AsyncStorage.setItem('cached_companies', JSON.stringify(freshCompanies));
        setCompanies(freshCompanies);
        return freshCompanies;
      }

      // If network fetch failed, return cached data if available.
      // We return null if there's no cache, so the caller can distinguish between 
      // "No companies" ([]) and "Network error" (null).
      return cachedData.length > 0 ? cachedData : null;
    } catch (e: any) {
      console.error("[Boot] Parallel fetch failed:", e);
      if (cachedData.length > 0) return cachedData;
      
      if (isBoot) {
        // During boot we throw so the boot screen shows the error
        throw new Error(`Initialization failed: ${e.message || "Connection error"}.`);
      }
      return null;
    }
  };

  useEffect(() => {
    let cancelled = false;
    let initialized = false;
    let isBooting = true; 

    const initialize = async () => {
      if (initialized) return;
      initialized = true;

      try {
        setBootError(null);
        assertEnv();

        if (!supabase) {
          throw new Error("Supabase client not initialized.");
        }

        // Check network state before starting
        const networkState = await NetInfo.fetch();
        setIsOnline(networkState.isConnected);

        // Get cached company ID and check session in parallel
        const [cachedCompanyId, sessionResult] = await Promise.all([
          getSelectedCompanyId().catch(() => null),
          Promise.race([
            supabase.auth.getSession(),
            new Promise<{ data: { session: null }, error: any }>((resolve) => 
              setTimeout(() => resolve({ data: { session: null }, error: null }), 8000)
            )
          ]).catch(e => ({ data: { session: null }, error: e }))
        ]);

        if (cancelled) return;
        setCompanyId(cachedCompanyId);

        const session = sessionResult.data.session;
        const sessionError = sessionResult.error;
        
        // DETERMINING AUTH STATUS:
        // We consider the user "authed" if they have a session OR if they have a session that failed to refresh
        // but hasn't been explicitly revoked (e.g. they are offline).
        let authed = !!session?.access_token;
        
        // If we are offline and have an error/no session but we HAVE evidence of a previous session,
        // we should try to look at what's actually in storage directly as a last resort.
        if (!authed && isOnline === false) {
          // This is a "Basement" scenario. We check if there's *any* token string in storage.
          // Since we use the SecureStorageAdapter, we can't easily peek, but Supabase usually 
          // returns the expired session in getSession() even if it fails to refresh.
          if (session) authed = true; 
        }

        // Handle explicitly revoked sessions (Only happens when online)
        const isRevoked = sessionError?.message?.includes("Refresh Token Not Found") || 
                         sessionError?.message?.includes("invalid refresh token");

        if (isRevoked) {
          console.warn("[Auth] Session explicitly revoked by server, resetting...");
          await supabase.auth.signOut().catch(() => {});
          setStage("login");
          isBooting = false;
          return;
        }
        
        if (!authed && !session) {
          setStage("login");
          isBooting = false;
        } else {
          try {
            // If we are offline, fetchUser will automatically return cached data.
            const companiesList = await fetchUser(true);
            if (cancelled) return;

            // If companiesList is null, the fetch failed and we have no cache.
            if (companiesList === null) {
               if (isOnline === false) {
                 // If offline with no cache, we should still allow them to go to main if they have a company ID.
                 const cachedId = await getSelectedCompanyId().catch(() => null);
                 if (cachedId) {
                   setCompanyId(cachedId);
                   setStage("main");
                   return;
                 }
               }
               // Otherwise, we cannot proceed effectively.
               throw new Error("Unable to load organization data. Please check your network connection.");
            }

            const list = companiesList;
            const cachedId = await getSelectedCompanyId().catch(() => null);
            const validCompany = list.find(c => (c && c.id === cachedId));

            if (validCompany) {
              if (validCompany.role) setUserRole(validCompany.role);
              setCompanyId(cachedId);
              setStage("main");
            } else if (list.length > 0) {
              setStage("company");
            } else {
              setStage("onboarding");
            }
          } catch (e: any) {
             console.warn("[Auth] Initialization fetch failed, but proceeding as authed:", e.message);
             // Last resort: If we are authed, go to main. fetchUser already showed cached data.
             setStage("main");
          } finally {
            isBooting = false;
          }
        }
      } catch (e: any) {
        console.error("[Auth] Initialization error:", e);
        if (!cancelled) {
          setBootError(e?.message || "Unknown error during initialization");
          setStage("boot");
        }
        isBooting = false;
      }
    };

    initialize();

    if (!supabase) return;

    const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (cancelled || isBooting) return;
      
      try {
        const authed = !!session?.access_token;
        if (!authed) {
          setStage("login");
          setCompanyId(null);
        } else if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
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
    setBootError(null); 
  };

  const content = useMemo(() => {
    if (bootError) {
      return (
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24, backgroundColor: PremiumColors.bg.primary }}>
          <Text style={{ color: "#ff4757", fontWeight: "900", fontSize: 20, marginBottom: 12, textAlign: "center" }}>
            Connection Error
          </Text>
          <Text style={{ color: PremiumColors.text.primary, textAlign: "center", marginBottom: 24, fontSize: 14, lineHeight: 20 }}>
            {bootError}
          </Text>
          
          <Button 
            title="Try Again" 
            onPress={() => {
              setDiagResults(null);
              setRetryCount(prev => prev + 1);
            }} 
            style={{ width: "100%", marginBottom: 12 }}
          />

          <Button 
            title={diagRunning ? "Running Diagnostics..." : "Run Diagnostics"} 
            variant="ghost" 
            onPress={runDiagnostics} 
            style={{ width: "100%", marginBottom: 12 }}
          />

          {diagResults && (
            <View style={{ backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 12, padding: 12, marginBottom: 16 }}>
              <Text style={{ color: PremiumColors.amber.primary, fontWeight: "800", fontSize: 12, marginBottom: 8 }}>DIAGNOSTICS</Text>
              {diagResults.map((line, i) => (
                <Text key={i} style={{ color: PremiumColors.text.primary, fontSize: 11, lineHeight: 18, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}>
                  {line}
                </Text>
              ))}
            </View>
          )}

          <Button 
            title="Sign Out" 
            variant="ghost" 
            onPress={handleLogout} 
            style={{ width: "100%" }}
          />
        </ScrollView>
      );
    }

    if (stage === "boot") {
      return (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
          <ActivityIndicator color={PremiumColors.amber.primary} size="large" />
          
          {showSlowMessage && (
            <View style={{ marginTop: 32, alignItems: "center" }}>
              <Text style={{ color: PremiumColors.text.secondary, textAlign: "center", marginBottom: 20, fontSize: 14, fontWeight: "600" }}>
                This is taking longer than usual{"\n"}Check your connection?
              </Text>
              <Button 
                title="Retry Connection" 
                variant="ghost"
                onPress={() => setRetryCount(prev => prev + 1)} 
                style={{ height: 44, paddingHorizontal: 24 }}
              />
            </View>
          )}
        </View>
      );
    }

    if (stage === "login") {
      return (
        <LoginScreen
          onSignUp={() => setStage("signup")}
          onForgotPassword={() => setStage("forgot-password")}
          onLoggedIn={async () => {
            setStage("boot");
            try {
              const companies = await fetchUser(true);
              if (companies === null) {
                 setBootError("Failed to load your organizations. Please check your connection.");
                 setStage("boot");
                 return;
              }

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

    if (stage === "signup") {
      return (
        <SignUpScreen
          onBack={() => setStage("login")}
          onSignedUp={async () => {
            await fetchUser(false).catch(() => null);
            setCompanyId(null);
            setStage("onboarding");
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
        {currentScreen === "dashboard" && (
          <DashboardScreen
            companyId={companyId}
            userName={userName}
            onOpenDrawer={() => setShowDrawer(true)}
            onNavigate={(screen, options) => {
              if (screen === "pos" && options?.openCashCollection) {
                setOpenCashCollectionSignal((value) => value + 1);
              }
              setCurrentScreen(screen);
            }}
          />
        )}
        {currentScreen === "pos" && (
          <POSScreen 
            companyId={companyId} 
            userName={userName}
            onOpenDrawer={() => setShowDrawer(true)} 
            openCashCollectionSignal={openCashCollectionSignal}
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
        {currentScreen === "stockops" && (
          <StockOperationsScreen
            onOpenDrawer={() => setShowDrawer(true)}
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
        {currentScreen === "cashiers" && (
          <CashiersScreen
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
  }, [bootError, stage, companyId, currentScreen, openCashCollectionSignal, showDrawer, userName, userRole, companies, diagResults, diagRunning]);

  return (
    <PrinterProvider>
      <View style={{ flex: 1, backgroundColor: PremiumColors.bg.base }}>
        {content}
      </View>
    </PrinterProvider>
  );
}

