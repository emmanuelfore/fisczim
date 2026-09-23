import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Eye, EyeOff, Lock, Pause, Play, ShieldCheck, User, Wifi, WifiOff, X } from "lucide-react-native";
import { apiFetch } from "../lib/api";
import { getPausedState, PausedState, setPausedState } from "../lib/storage";
import { auth } from "../lib/auth";
import { PremiumColors as C } from "../ui/PremiumColors";
import { DoneTextInput as TextInput } from "../ui/DoneTextInput";
import { Button } from "../ui/Button";
import * as SecureStore from "expo-secure-store";

type Props = {
  companyId: number | null;
  onChangeCompany: () => void;
  onSignOut: () => void;
};

type ApiUser = {
  id: string;
  email: string;
  name?: string | null;
};

export function PauseScreen({ companyId, onChangeCompany, onSignOut }: Props) {
  const insets = useSafeAreaInsets();
  const [pausedState, setPausedStateLocal] = useState<PausedState>({ paused: false, pausedAt: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<ApiUser | null>(null);
  const [online, setOnline] = useState<boolean>(true);

  const [showUnlock, setShowUnlock] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [unlockBusy, setUnlockBusy] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);

  const refresh = async () => {
    setError(null);
    setBusy(true);
    try {
      const local = await getPausedState();
      setPausedStateLocal(local);

      const health = await apiFetch("/api/health").catch(() => null);
      setOnline(!!health && health.ok);

      // Use cached user info if available (works offline)
      const cachedUser = auth.getUser();
      if (cachedUser) {
        setUser({ id: cachedUser.id, email: cachedUser.email, name: cachedUser.name });
      } else {
        // Try to fetch from server if online
        const res = await apiFetch("/api/user").catch(() => null);
        if (res?.ok) {
          const data = await res.json();
          setUser(data?.user ?? null);
        }
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to refresh");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const title = useMemo(() => (pausedState.paused ? "Paused" : "Active"), [pausedState.paused]);
  const subtitle = useMemo(() => {
    if (pausedState.paused && pausedState.pausedAt) {
      try {
        const t = new Date(pausedState.pausedAt);
        return `Paused at ${t.toLocaleTimeString()}`;
      } catch {
        return "Paused";
      }
    }
    return "Terminal is active";
  }, [pausedState.paused, pausedState.pausedAt]);

  const pauseNow = async () => {
    setError(null);
    setBusy(true);
    try {
      const next: PausedState = { paused: true, pausedAt: new Date().toISOString() };
      await setPausedState(next);
      setPausedStateLocal(next);
    } catch (e: any) {
      setError(e?.message ?? "Failed to pause");
    } finally {
      setBusy(false);
    }
  };

  const requestResume = () => {
    setPassword("");
    setUnlockError(null);
    setShowUnlock(true);
  };

  /**
   * Resume using password — works both online and offline.
   * Online: calls the login endpoint to verify.
   * Offline: verifies against the locally cached credentials in SecureStore.
   */
  const resumeWithPassword = async () => {
    if (!password.trim()) return;
    setUnlockError(null);
    setUnlockBusy(true);
    try {
      const cachedEmail = await SecureStore.getItemAsync("cached_email");
      if (!cachedEmail) {
        setUnlockError("No cached credentials. Please log out and log back in while online first.");
        return;
      }

      if (online) {
        // Online: verify via server login (most secure)
        await auth.login(cachedEmail, password);
      } else {
        // Offline: verify against locally cached password
        const cachedPassword = await SecureStore.getItemAsync("cached_password");
        if (!cachedPassword) {
          setUnlockError("No cached credentials available for offline unlock.");
          return;
        }
        if (password !== cachedPassword) {
          setUnlockError("Incorrect password. Please try again.");
          return;
        }
      }

      const next: PausedState = { paused: false, pausedAt: null };
      await setPausedState(next);
      setPausedStateLocal(next);
      setShowUnlock(false);
    } catch (e: any) {
      setUnlockError(e?.message ?? "Incorrect password. Please try again.");
    } finally {
      setUnlockBusy(false);
    }
  };

  const signOut = async () => {
    await auth.logout().catch(() => {});
    onSignOut();
  };

  return (
    <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: Math.max(insets.top, 18) }}>
      {/* Header */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <View>
          <Text style={{ color: C.text.primary, fontSize: 26, fontWeight: "900", letterSpacing: -0.5 }}>
            Pause Control
          </Text>
          <Text style={{ color: C.text.secondary, marginTop: 6, fontSize: 12, fontWeight: "700" }}>
            {user?.name || user?.email || "Signed in"}
          </Text>
        </View>

        <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
          <View
            style={{
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 999,
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: online ? `${C.status.success}1F` : `${C.status.error}1F`,
              borderWidth: 1,
              borderColor: online ? `${C.status.success}38` : `${C.status.error}38`
            }}
          >
            {online ? <Wifi size={12} color={C.status.success} /> : <WifiOff size={12} color={C.status.error} />}
            <Text style={{ marginLeft: 6, fontSize: 10, fontWeight: "900", color: online ? C.status.success : C.status.error }}>
              {online ? "ONLINE" : "OFFLINE"}
            </Text>
          </View>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={signOut}
            style={{
              width: 42,
              height: 42,
              borderRadius: 21,
              backgroundColor: C.bg.hover,
              borderWidth: 1,
              borderColor: C.border.default,
              alignItems: "center",
              justifyContent: "center"
            }}
          >
            <User size={18} color={C.text.primary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Card */}
      <View style={{ borderRadius: 28, overflow: "hidden", borderWidth: 1, borderColor: C.border.default }}>
        <LinearGradient
          colors={pausedState.paused ? ["#2c1800", "#1e1000"] : ["#1a1208", "#130e05"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ padding: 18, borderRadius: 28 }}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View>
              <Text style={{ color: C.text.primary, fontSize: 22, fontWeight: "900" }}>{title}</Text>
              <Text style={{ color: C.text.secondary, marginTop: 6, fontSize: 12, fontWeight: "700" }}>
                {subtitle}
              </Text>
            </View>

            <View
              style={{
                width: 62,
                height: 62,
                borderRadius: 22,
                backgroundColor: pausedState.paused ? C.amber.glowLg : C.bg.hover,
                borderWidth: 1,
                borderColor: pausedState.paused ? C.amber.primarySoft : C.border.default,
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              {pausedState.paused ? <Pause size={26} color={C.amber.light} /> : <Play size={26} color={C.text.secondary} />}
            </View>
          </View>

          {error && (
            <Text style={{ color: C.status.error, fontSize: 12, fontWeight: "800", marginTop: 12 }}>
              {error}
            </Text>
          )}

          <View style={{ height: 16 }} />

          <View style={{ flexDirection: "row", gap: 10 }}>
            {pausedState.paused ? (
              <Button
                title="Resume"
                onPress={requestResume}
                loading={busy}
                style={{ flex: 1 }}
              />
            ) : (
              <Button
                title="Pause"
                onPress={pauseNow}
                loading={busy}
                style={{ flex: 1 }}
              />
            )}

            <Button
              title="Company"
              variant="ghost"
              onPress={onChangeCompany}
              disabled={busy}
              style={{ width: 120 }}
            />
          </View>

          <View style={{ height: 12 }} />

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={refresh}
            style={{
              borderRadius: 18,
              paddingVertical: 12,
              backgroundColor: C.bg.hover,
              borderWidth: 1,
              borderColor: C.border.default,
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "row",
              gap: 8
            }}
          >
            {busy ? (
              <ActivityIndicator color={C.amber.primary} />
            ) : (
              <ShieldCheck size={16} color={C.text.secondary} />
            )}
            <Text style={{ color: C.text.secondary, fontWeight: "900", letterSpacing: 1.2, textTransform: "uppercase", fontSize: 10 }}>
              Refresh status
            </Text>
          </TouchableOpacity>
        </LinearGradient>
      </View>

      {/* Password Unlock Modal */}
      <Modal visible={showUnlock} transparent animationType="fade" onRequestClose={() => setShowUnlock(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.80)", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <View style={{ width: "100%", maxWidth: 420, borderRadius: 28, overflow: "hidden", borderWidth: 1, borderColor: C.border.default }}>
            <LinearGradient colors={[C.bg.card, "#130e05"]} style={{ padding: 24 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <Text style={{ color: C.text.primary, fontSize: 18, fontWeight: "900" }}>Resume Terminal</Text>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setShowUnlock(false)}
                  style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.bg.hover, alignItems: "center", justifyContent: "center" }}
                >
                  <X size={18} color={C.text.primary} />
                </TouchableOpacity>
              </View>

              <Text style={{ color: C.text.secondary, fontSize: 12, fontWeight: "700", marginBottom: 20 }}>
                Enter your password to resume.{!online ? " (Offline mode)" : ""}
              </Text>

              {/* Password input */}
              <View style={{
                backgroundColor: C.bg.hover,
                borderWidth: 1,
                borderColor: C.border.default,
                borderRadius: 18,
                paddingHorizontal: 16,
                flexDirection: "row",
                alignItems: "center",
                height: 56,
                marginBottom: 16,
              }}>
                <Lock size={18} color={C.text.secondary} style={{ marginRight: 10 }} />
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  placeholder="Your password"
                  placeholderTextColor={C.text.secondary}
                  style={{ flex: 1, color: C.text.primary, fontSize: 16, fontWeight: "600" }}
                  returnKeyType="done"
                  onSubmitEditing={resumeWithPassword}
                  autoFocus
                />
                <TouchableOpacity onPress={() => setShowPassword(p => !p)} style={{ padding: 6 }}>
                  {showPassword ? <EyeOff size={18} color={C.text.secondary} /> : <Eye size={18} color={C.text.secondary} />}
                </TouchableOpacity>
              </View>

              {unlockError && (
                <Text style={{ color: C.status.error, fontSize: 12, fontWeight: "800", marginBottom: 14, textAlign: "center" }}>
                  {unlockError}
                </Text>
              )}

              <Button title="Unlock" onPress={resumeWithPassword} loading={unlockBusy} disabled={!password.trim()} />
            </LinearGradient>
          </View>
        </View>
      </Modal>
    </View>
  );
}
