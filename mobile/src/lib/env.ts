export const ENV = {
  supabaseUrl: (process.env.EXPO_PUBLIC_SUPABASE_URL ?? "").trim(),
  supabaseAnonKey: (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "").trim(),
  apiBaseUrl: (process.env.EXPO_PUBLIC_API_BASE_URL ?? "").trim().replace(/\/+$/, "")
};


export function assertEnv() {
  const missing: string[] = [];
  // Only the API base URL is required. Supabase is optional (legacy / not used in all builds).
  if (!ENV.apiBaseUrl || !ENV.apiBaseUrl.startsWith("http")) missing.push("EXPO_PUBLIC_API_BASE_URL");
  
  if (missing.length) {
    throw new Error(`Invalid or missing configuration: ${missing.join(", ")}`);
  }
}


