import React, { useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import NetInfo from "@react-native-community/netinfo";
import { Lock, Mail, ArrowRight, Eye, EyeOff, Moon, Sun, WifiOff } from "lucide-react-native";
import { auth } from "../lib/auth";
import { useTheme } from "../ui/PremiumColors";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";

type Props = {
  onLoggedIn: () => void;
  onForgotPassword?: () => void;
  onSignUp?: () => void;
};

export function LoginScreen({ onLoggedIn, onForgotPassword, onSignUp }: Props) {
  const insets = useSafeAreaInsets();
  const { theme: C, isDark, toggleTheme } = useTheme();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [focusedInput, setFocusedInput] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [loginMode, setLoginMode] = useState<"password" | "pin">("password");
  const [offlineUsers, setOfflineUsers] = useState<any[]>([]);
  const [offlineNote, setOfflineNote] = useState<string | null>(null);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((s) => setIsOnline(!!s.isConnected));
    NetInfo.fetch().then((s) => setIsOnline(!!s.isConnected)).catch(() => {});
    auth.getOfflineUsers().then((users) => {
      setOfflineUsers(users || []);
      if (users?.length > 0) setEmail((prev) => prev || users[0].email || "");
    }).catch(() => {});
    return () => unsub();
  }, []);

  const canSubmit = useMemo(
    () => (loginMode === "pin" ? !!email.trim() && pin.length >= 4 : !!email.trim() && !!password),
    [email, password, pin, loginMode]
  );

  const submit = async () => {
    if (!canSubmit || busy) return;
    setError(null);
    setOfflineNote(null);
    setBusy(true);
    try {
      if (loginMode === "pin") {
        await auth.loginWithPin(email.trim(), pin.replace(/\D/g, "").slice(0, 8));
      } else {
        await auth.login(email.trim(), password);
      }
      if (auth.isOfflineSession()) {
        setOfflineNote("Logged in offline — sales will queue and sync when you reconnect.");
      }
      await onLoggedIn();
    } catch (e: any) {
      setError(e?.message ?? "Authentication failed");
    } finally {
      setBusy(false);
    }
  };

  const styles = useMemo(() => makeStyles(C), [C]);
  const { width: screenWidth, height: screenHeight } = Dimensions.get("window");

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* --- Atmospheric Background --- */}
      <View style={StyleSheet.absoluteFill}>
        <LinearGradient
           colors={[C.bg.base, C.bg.primary, C.bg.base]}
           style={StyleSheet.absoluteFill}
        />
        
        {/* Glow Orbs */}
        <View style={[styles.orb, { 
          width: screenWidth * 1.2, 
          height: screenWidth * 1.2, 
          borderRadius: screenWidth * 0.6,
          top: -screenWidth * 0.5,
          right: -screenWidth * 0.4,
          backgroundColor: C.amber.glowLg,
          opacity: 0.6
        }]} />
        
        <View style={[styles.orb, { 
          width: screenWidth * 0.8, 
          height: screenWidth * 0.8, 
          borderRadius: screenWidth * 0.4,
          bottom: -screenWidth * 0.2,
          left: -screenWidth * 0.3,
          backgroundColor: C.amber.glowExtreme,
          opacity: 0.4
        }]} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          bounces={false}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingTop: Math.max(insets.top + 20, 60),
              paddingBottom: Math.max(insets.bottom + 24, 40),
            },
          ]}
        >
          {/* --- Login Card --- */}
          <View style={styles.card}>
            {/* BRANDING INSIDE CARD */}
            <View style={styles.cardBranding}>
              <Text style={styles.brandText}>
                Field<Text style={styles.brandAccent}>POS</Text>
              </Text>
              <Text style={styles.tagline}>Intelligent Sales. Clean Workspace.</Text>
            </View>

            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Sign in to your account</Text>
              <TouchableOpacity onPress={toggleTheme} style={styles.themeToggle}>
                {isDark ? <Sun size={16} color={C.amber.primary} /> : <Moon size={16} color={C.amber.primary} />}
              </TouchableOpacity>
            </View>

            {!isOnline && (
              <View style={styles.offlineBadge}>
                <WifiOff size={14} color="#FFB045" />
                <Text style={styles.offlineBadgeText}>Offline mode — password or PIN login</Text>
              </View>
            )}

            {offlineUsers.length > 0 && (
              <View style={styles.modeToggle}>
                <TouchableOpacity
                  style={[styles.modeBtn, loginMode === "password" && styles.modeBtnActive]}
                  onPress={() => setLoginMode("password")}
                >
                  <Text style={[styles.modeBtnText, loginMode === "password" && styles.modeBtnTextActive]}>Password</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modeBtn, loginMode === "pin" && styles.modeBtnActive]}
                  onPress={() => setLoginMode("pin")}
                >
                  <Text style={[styles.modeBtnText, loginMode === "pin" && styles.modeBtnTextActive]}>Offline PIN</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.inputWrapper}>
              <Text style={styles.label}>Email address</Text>
              <View style={[styles.inputContainer, focusedInput === "email" && styles.inputFocused]}>
                <Mail size={18} color={focusedInput === "email" ? C.amber.primary : C.text.secondary} />
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="name@company.com"
                  placeholderTextColor={C.text.secondary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  style={styles.input}
                  onFocus={() => setFocusedInput("email")}
                  onBlur={() => setFocusedInput(null)}
                  returnKeyType="next"
                />
              </View>
              {offlineUsers.length > 1 && (
                <View style={styles.cachedUsers}>
                  {offlineUsers.slice(0, 3).map((u) => (
                    <TouchableOpacity key={u.email} onPress={() => setEmail(u.email)} style={styles.cachedUserChip}>
                      <Text style={styles.cachedUserText}>{u.name || u.email}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            {loginMode === "password" ? (
              <View style={styles.inputWrapper}>
                <View style={styles.labelRow}>
                  <Text style={styles.label}>Password</Text>
                  {onForgotPassword && (
                    <TouchableOpacity onPress={onForgotPassword}>
                      <Text style={styles.forgotText}>Forgot password?</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <View style={[styles.inputContainer, focusedInput === "password" && styles.inputFocused]}>
                  <Lock size={18} color={focusedInput === "password" ? C.amber.primary : C.text.secondary} />
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    placeholder="••••••••"
                    placeholderTextColor={C.text.secondary}
                    secureTextEntry={!showPassword}
                    style={styles.input}
                    onFocus={() => setFocusedInput("password")}
                    onBlur={() => setFocusedInput(null)}
                    returnKeyType="done"
                    onSubmitEditing={submit}
                  />
                  <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeButton}>
                    {showPassword ? <EyeOff size={18} color={C.text.secondary} /> : <Eye size={18} color={C.text.secondary} />}
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.inputWrapper}>
                <Text style={styles.label}>4-digit PIN (works offline)</Text>
                <View style={[styles.inputContainer, focusedInput === "pin" && styles.inputFocused]}>
                  <Lock size={18} color={focusedInput === "pin" ? C.amber.primary : C.text.secondary} />
                  <TextInput
                    value={pin}
                    onChangeText={(t) => setPin(t.replace(/\D/g, "").slice(0, 8))}
                    placeholder="••••"
                    placeholderTextColor={C.text.secondary}
                    secureTextEntry
                    keyboardType="numeric"
                    style={styles.input}
                    onFocus={() => setFocusedInput("pin")}
                    onBlur={() => setFocusedInput(null)}
                    returnKeyType="done"
                    onSubmitEditing={submit}
                  />
                </View>
              </View>
            )}

            {offlineNote && (
              <View style={styles.offlineNote}>
                <Text style={styles.offlineNoteText}>{offlineNote}</Text>
              </View>
            )}

            {error && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
              onPress={submit}
              disabled={!canSubmit || busy}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={["#FFB045", C.amber.primary]}
                style={StyleSheet.absoluteFill}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              />
              {busy ? (
                <ActivityIndicator color={C.amber.iconOnPrimary} />
              ) : (
                <View style={styles.submitBtnContent}>
                  <Text style={styles.submitBtnText}>Sign In</Text>
                  <ArrowRight size={20} color={C.amber.iconOnPrimary} strokeWidth={3} />
                </View>
              )}
            </TouchableOpacity>

            {onSignUp && (
              <TouchableOpacity style={styles.footer} onPress={onSignUp} activeOpacity={0.8}>
                <Text style={styles.footerText}>Need an account? <Text style={styles.footerLink}>Sign up</Text></Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const makeStyles = (C: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg.base,
  },
  scrollContent: {
    paddingHorizontal: 24,
    flexGrow: 1,
    justifyContent: "center",
  },
  orb: {
    position: "absolute",
  },
  card: {
    backgroundColor: C.bg.panel,
    borderRadius: 36,
    padding: 24,
    borderWidth: 1.5,
    borderColor: C.bg.glassBorder,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 20 },
    elevation: 8,
  },
  cardBranding: {
    alignItems: "center",
    marginBottom: 32,
    marginTop: 8,
  },
  brandText: {
    color: C.text.primary,
    fontSize: 38,
    fontWeight: "900",
    letterSpacing: -1.5,
  },
  brandAccent: {
    color: C.amber.primary,
  },
  tagline: {
    color: C.text.secondary,
    fontSize: 13,
    fontWeight: "600",
    marginTop: 4,
    opacity: 0.7,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
    paddingHorizontal: 4,
  },
  cardTitle: {
    color: C.text.primary,
    fontSize: 15,
    fontWeight: "700",
    opacity: 0.8,
  },
  themeToggle: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: C.bg.panel2,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: C.bg.glassBorder,
  },
  inputWrapper: {
    marginBottom: 18,
  },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  label: {
    color: C.text.primary,
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 8,
    opacity: 0.6,
  },
  forgotText: {
    color: C.amber.primary,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 8,
  },
  inputContainer: {
    backgroundColor: C.bg.panel2,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: C.bg.glassBorder, // Always visible now
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    height: 58,
  },
  inputFocused: {
    borderColor: C.amber.primary,
    backgroundColor: "rgba(255, 145, 0, 0.06)",
  },
  input: {
    flex: 1,
    color: C.text.primary,
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 14,
  },
  eyeButton: {
    padding: 8,
  },
  offlineBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "rgba(255, 176, 69, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(255, 176, 69, 0.3)",
    borderRadius: 12,
    paddingVertical: 8,
    marginBottom: 16,
  },
  offlineBadgeText: {
    color: "#FFB045",
    fontSize: 12,
    fontWeight: "700",
  },
  modeToggle: {
    flexDirection: "row",
    backgroundColor: C.bg.panel2,
    borderRadius: 14,
    padding: 4,
    marginBottom: 16,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
  },
  modeBtnActive: {
    backgroundColor: C.amber.primary,
  },
  modeBtnText: {
    color: C.text.secondary,
    fontSize: 13,
    fontWeight: "700",
  },
  modeBtnTextActive: {
    color: "#1a1a1a",
  },
  cachedUsers: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  cachedUserChip: {
    backgroundColor: C.bg.panel2,
    borderWidth: 1,
    borderColor: C.bg.glassBorder,
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  cachedUserText: {
    color: C.text.primary,
    fontSize: 12,
    fontWeight: "600",
  },
  offlineNote: {
    backgroundColor: "rgba(255, 176, 69, 0.1)",
    padding: 12,
    borderRadius: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 176, 69, 0.25)",
  },
  offlineNoteText: {
    color: "#FFB045",
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },
  errorContainer: {
    backgroundColor: "rgba(248, 113, 113, 0.1)",
    padding: 14,
    borderRadius: 16,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "rgba(248, 113, 113, 0.2)",
  },
  errorText: {
    color: C.status.error,
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
  },
  submitBtn: {
    height: 64,
    borderRadius: 20,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
    shadowColor: C.amber.primary,
    shadowOpacity: 0.4,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  submitBtnDisabled: {
    opacity: 0.6,
    shadowOpacity: 0,
  },
  submitBtnContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  submitBtnText: {
    color: C.amber.iconOnPrimary,
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  footer: {
    marginTop: 22,
    alignItems: "center",
  },
  footerText: {
    color: C.text.secondary,
    fontSize: 13,
    fontWeight: "600",
  },
  footerLink: {
    color: C.amber.primary,
    fontWeight: "800",
  },
});
