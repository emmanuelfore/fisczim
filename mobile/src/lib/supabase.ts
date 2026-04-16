import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { ENV } from "./env";

// Custom storage adapter for Supabase that uses expo-secure-store for 
// sensitive tokens while allowing AsyncStorage for non-sensitive cache.
const SecureStorageAdapter = {
  getItem: async (key: string) => {
    // 1. Try SecureStore first
    const secureValue = await SecureStore.getItemAsync(key);
    if (secureValue) return secureValue;

    // 2. Fallback to AsyncStorage for migration
    const legacyValue = await AsyncStorage.getItem(key);
    if (legacyValue) {
      console.log(`[Auth] Migrating ${key} to SecureStore...`);
      await SecureStore.setItemAsync(key, legacyValue);
      await AsyncStorage.removeItem(key).catch(() => {});
      return legacyValue;
    }

    return null;
  },
  setItem: async (key: string, value: string) => {
    return SecureStore.setItemAsync(key, value);
  },
  removeItem: async (key: string) => {
    return SecureStore.deleteItemAsync(key);
  },
};

let supabaseInstance: SupabaseClient | null = null;

try {
  if (ENV.supabaseUrl && ENV.supabaseAnonKey) {
    supabaseInstance = createClient(ENV.supabaseUrl, ENV.supabaseAnonKey, {
      auth: {
        storage: SecureStorageAdapter,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        flowType: 'pkce'
      }
    });
  } else {
    console.warn("[Supabase] Missing environment variables for initialization.");
  }
} catch (e) {
  console.error("[Supabase] Fatal initialization error:", e);
}

export const supabase = supabaseInstance as SupabaseClient;


