import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowLeft, ArrowRight, Eye, EyeOff, Lock, Mail, User } from "lucide-react-native";
import { StatusBar } from "expo-status-bar";
import { supabase } from "../lib/supabase";
import { PremiumColors as C } from "../ui/PremiumColors";

type Props = {
  onBack: () => void;
  onSignedUp: () => void;
};

export function SignUpScreen({ onBack, onSignedUp }: Props) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusedInput, setFocusedInput] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    return !!name.trim() && !!email.trim() && password.length >= 6 && password === confirmPassword;
  }, [confirmPassword, email, name, password]);

  const submit = async () => {
    if (!canSubmit || busy) return;
    setError(null);
    setBusy(true);
    try {
      const { error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: name.trim(),
            name: name.trim(),
          },
        },
      });
      if (signUpError) throw signUpError;

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) throw signInError;

      onSignedUp();
    } catch (e: any) {
      setError(e?.message ?? "Could not create account");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <LinearGradient colors={["#0a0a0a", "#1a1000", "#0a0a0a"]} style={StyleSheet.absoluteFill} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingTop: Math.max(insets.top + 20, 40) }]}
          keyboardShouldPersistTaps="handled"
          bounces={false}
        >
          <TouchableOpacity style={styles.backButton} onPress={onBack}>
            <ArrowLeft size={20} color={C.text.secondary} />
            <Text style={styles.backText}>Back to login</Text>
          </TouchableOpacity>

          <View style={styles.header}>
            <Text style={styles.brandText}>Create Account</Text>
            <Text style={styles.subtitle}>Set up your admin login, then add your business details.</Text>
          </View>

          <View style={styles.card}>
            <InputField
              label="Full name"
              icon={User}
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              focused={focusedInput === "name"}
              onFocus={() => setFocusedInput("name")}
              onBlur={() => setFocusedInput(null)}
            />

            <InputField
              label="Email address"
              icon={Mail}
              value={email}
              onChangeText={setEmail}
              placeholder="name@company.com"
              keyboardType="email-address"
              autoCapitalize="none"
              focused={focusedInput === "email"}
              onFocus={() => setFocusedInput("email")}
              onBlur={() => setFocusedInput(null)}
            />

            <PasswordField
              label="Password"
              value={password}
              onChangeText={setPassword}
              showPassword={showPassword}
              onToggleShow={() => setShowPassword((value) => !value)}
              focused={focusedInput === "password"}
              onFocus={() => setFocusedInput("password")}
              onBlur={() => setFocusedInput(null)}
            />

            <PasswordField
              label="Confirm password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              showPassword={showPassword}
              onToggleShow={() => setShowPassword((value) => !value)}
              focused={focusedInput === "confirm"}
              onFocus={() => setFocusedInput("confirm")}
              onBlur={() => setFocusedInput(null)}
            />

            {password.length > 0 && password.length < 6 && (
              <Text style={styles.helperText}>Password must be at least 6 characters.</Text>
            )}
            {confirmPassword.length > 0 && password !== confirmPassword && (
              <Text style={styles.helperText}>Passwords do not match.</Text>
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
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={canSubmit ? [C.amber.primary, "#D97000"] : ["#2a2a2a", "#1e1e1e"]}
                style={StyleSheet.absoluteFill}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              />
              {busy ? (
                <ActivityIndicator color="#000" />
              ) : (
                <>
                  <Text style={styles.submitText}>Create account</Text>
                  <ArrowRight size={18} color="#000" />
                </>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function InputField({ label, icon: Icon, focused, ...props }: any) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputContainer, focused && styles.inputFocused]}>
        <Icon size={18} color={focused ? C.amber.primary : C.text.secondary} />
        <TextInput {...props} placeholderTextColor={C.text.secondary} style={styles.input} />
      </View>
    </View>
  );
}

function PasswordField({ label, value, onChangeText, showPassword, onToggleShow, focused, onFocus, onBlur }: any) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputContainer, focused && styles.inputFocused]}>
        <Lock size={18} color={focused ? C.amber.primary : C.text.secondary} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder="Password"
          placeholderTextColor={C.text.secondary}
          secureTextEntry={!showPassword}
          style={styles.input}
          onFocus={onFocus}
          onBlur={onBlur}
        />
        <TouchableOpacity onPress={onToggleShow} style={styles.eyeButton}>
          {showPassword ? <EyeOff size={18} color={C.text.secondary} /> : <Eye size={18} color={C.text.secondary} />}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  scrollContent: { paddingHorizontal: 24, paddingBottom: 40, flexGrow: 1, justifyContent: "center" },
  backButton: { flexDirection: "row", alignItems: "center", marginBottom: 36, gap: 8 },
  backText: { color: C.text.secondary, fontSize: 14, fontWeight: "700" },
  header: { alignItems: "center", marginBottom: 28 },
  brandText: { color: "#fff", fontSize: 32, fontWeight: "900" },
  subtitle: { color: C.text.secondary, fontSize: 14, fontWeight: "600", marginTop: 8, textAlign: "center", lineHeight: 20 },
  card: { backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 28, padding: 22, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  field: { marginBottom: 16 },
  label: { color: C.text.secondary, fontSize: 12, fontWeight: "800", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 },
  inputContainer: { flexDirection: "row", alignItems: "center", height: 56, borderRadius: 16, paddingHorizontal: 16, backgroundColor: "rgba(0,0,0,0.3)", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" },
  inputFocused: { borderColor: C.amber.primary, backgroundColor: "rgba(255,149,0,0.03)" },
  input: { flex: 1, color: "#fff", fontSize: 16, fontWeight: "600", marginLeft: 12 },
  eyeButton: { padding: 8 },
  helperText: { color: "#f87171", fontSize: 12, fontWeight: "700", marginBottom: 10 },
  errorContainer: { backgroundColor: "rgba(255,71,87,0.1)", padding: 12, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: "rgba(255,71,87,0.2)" },
  errorText: { color: "#ff4757", fontSize: 13, fontWeight: "700", textAlign: "center" },
  submitBtn: { height: 60, borderRadius: 18, overflow: "hidden", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 12, marginTop: 8 },
  submitBtnDisabled: { opacity: 0.55 },
  submitText: { color: "#000", fontSize: 16, fontWeight: "900", textTransform: "uppercase", letterSpacing: 1 },
});
