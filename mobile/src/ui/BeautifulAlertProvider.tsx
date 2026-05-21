import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
  type AlertButton,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { hexAlpha, useTheme } from "./PremiumColors";

type AlertOptions = {
  cancelable?: boolean;
  onDismiss?: () => void;
};

type AlertRequest = {
  title?: string;
  message?: string;
  buttons: AlertButton[];
  options?: AlertOptions;
};

type BeautifulAlertContextValue = {
  showAlert: (title?: string, message?: string, buttons?: AlertButton[], options?: AlertOptions) => void;
};

const BeautifulAlertContext = createContext<BeautifulAlertContextValue | null>(null);
const nativeAlert = Alert.alert.bind(Alert);

function normalizeButtons(buttons?: AlertButton[]): AlertButton[] {
  if (!buttons || buttons.length === 0) return [{ text: "OK" }];
  return buttons;
}

function inferTone(title?: string, message?: string) {
  const text = `${title || ""} ${message || ""}`.toLowerCase();
  if (text.includes("error") || text.includes("failed") || text.includes("cannot") || text.includes("invalid")) return "error";
  if (text.includes("delete") || text.includes("remove") || text.includes("close shift") || text.includes("reject")) return "danger";
  if (text.includes("success") || text.includes("saved") || text.includes("done") || text.includes("approved") || text.includes("complete")) return "success";
  if (text.includes("warning") || text.includes("pending") || text.includes("sync")) return "warning";
  return "info";
}

export function BeautifulAlertProvider({ children }: { children: React.ReactNode }) {
  const { theme: C, isDark } = useTheme();
  const [queue, setQueue] = useState<AlertRequest[]>([]);
  const current = queue[0] ?? null;
  const visible = !!current;

  const showAlert = useCallback((title?: string, message?: string, buttons?: AlertButton[], options?: AlertOptions) => {
    setQueue((prev) => [...prev, { title, message, buttons: normalizeButtons(buttons), options }]);
  }, []);

  useEffect(() => {
    Alert.alert = ((title?: string, message?: string, buttons?: AlertButton[], options?: AlertOptions) => {
      showAlert(title, message, buttons, options);
    }) as typeof Alert.alert;

    return () => {
      Alert.alert = nativeAlert as typeof Alert.alert;
    };
  }, [showAlert]);

  const tone = inferTone(current?.title, current?.message);
  const toneColor = useMemo(() => {
    switch (tone) {
      case "error":
      case "danger":
        return C.status.error;
      case "success":
        return C.status.success;
      case "warning":
        return C.status.warning;
      default:
        return C.status.info;
    }
  }, [C, tone]);

  const iconName = useMemo(() => {
    switch (tone) {
      case "error":
        return "alert-circle-outline";
      case "danger":
        return "trash-can-outline";
      case "success":
        return "check-circle-outline";
      case "warning":
        return "clock-alert-outline";
      default:
        return "information-outline";
    }
  }, [tone]);

  const dismiss = useCallback((button?: AlertButton) => {
    setQueue((prev) => prev.slice(1));
    setTimeout(() => {
      button?.onPress?.();
      if (!button) current?.options?.onDismiss?.();
    }, 120);
  }, [current]);

  const handleBackdrop = () => {
    if (!current?.options?.cancelable) return;
    const cancelButton = current.buttons.find((button) => button.style === "cancel");
    dismiss(cancelButton);
  };

  const styles = makeStyles(C, isDark, toneColor);

  return (
    <BeautifulAlertContext.Provider value={{ showAlert }}>
      {children}
      <Modal visible={visible} transparent animationType="fade" onRequestClose={handleBackdrop}>
        <TouchableWithoutFeedback onPress={handleBackdrop}>
          <View style={styles.overlay}>
            <TouchableWithoutFeedback>
              <View style={styles.card}>
                <View style={styles.iconHalo}>
                  <MaterialCommunityIcons name={iconName as any} size={30} color={toneColor} />
                </View>

                {!!current?.title && <Text style={styles.title}>{current.title}</Text>}
                {!!current?.message && <Text style={styles.message}>{current.message}</Text>}

                <View style={styles.buttonStack}>
                  {current?.buttons.map((button, index) => {
                    const isCancel = button.style === "cancel";
                    const isDestructive = button.style === "destructive";
                    const isPrimary = !isCancel && index === current.buttons.length - 1;

                    if (isPrimary && !isDestructive) {
                      return (
                        <TouchableOpacity key={`${button.text || "OK"}-${index}`} activeOpacity={0.88} onPress={() => dismiss(button)}>
                          <LinearGradient
                            colors={[C.amber.primary, C.amber.light]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.primaryButton}
                          >
                            <Text style={styles.primaryButtonText}>{button.text || "OK"}</Text>
                          </LinearGradient>
                        </TouchableOpacity>
                      );
                    }

                    return (
                      <TouchableOpacity
                        key={`${button.text || "OK"}-${index}`}
                        activeOpacity={0.86}
                        onPress={() => dismiss(button)}
                        style={[
                          styles.secondaryButton,
                          isDestructive && { borderColor: hexAlpha(C.status.error, 0.45), backgroundColor: hexAlpha(C.status.error, 0.08) },
                        ]}
                      >
                        <Text style={[styles.secondaryButtonText, isDestructive && { color: C.status.error }]}>
                          {button.text || "OK"}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </BeautifulAlertContext.Provider>
  );
}

export function useBeautifulAlert() {
  const ctx = useContext(BeautifulAlertContext);
  if (!ctx) throw new Error("useBeautifulAlert must be used within BeautifulAlertProvider");
  return ctx;
}

const makeStyles = (C: any, isDark: boolean, toneColor: string) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.68)",
    alignItems: "center",
    justifyContent: "center",
    padding: 22,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 26,
    backgroundColor: C.bg.card,
    borderWidth: 1,
    borderColor: C.border.default,
    padding: 22,
    shadowColor: "#000",
    shadowOpacity: isDark ? 0.5 : 0.18,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 14 },
    elevation: 18,
  },
  iconHalo: {
    width: 58,
    height: 58,
    borderRadius: 20,
    backgroundColor: hexAlpha(toneColor, 0.12),
    borderWidth: 1,
    borderColor: hexAlpha(toneColor, 0.32),
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  title: {
    color: C.text.primary,
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: 0,
    marginBottom: 8,
  },
  message: {
    color: C.text.secondary,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "600",
  },
  buttonStack: {
    marginTop: 22,
    gap: 10,
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  primaryButtonText: {
    color: "#000",
    fontWeight: "900",
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  secondaryButton: {
    minHeight: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: C.border.default,
    backgroundColor: C.bg.hover,
    paddingHorizontal: 16,
  },
  secondaryButtonText: {
    color: C.text.primary,
    fontWeight: "900",
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
});
