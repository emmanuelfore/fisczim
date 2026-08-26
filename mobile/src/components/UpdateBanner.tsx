import React, { useState } from "react";
import {
  Animated,
  Easing,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { PremiumColors } from "../ui/PremiumColors";
import type { UpdateInfo } from "../lib/updateChecker";

interface Props {
  info: UpdateInfo;
  onDismiss: () => void;
}

export function UpdateBanner({ info, onDismiss }: Props) {
  const [opacity] = useState(() => new Animated.Value(1));
  const [visible, setVisible] = useState(true);

  const handleDismiss = () => {
    Animated.timing(opacity, {
      toValue: 0,
      duration: 250,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start(() => {
      setVisible(false);
      onDismiss();
    });
  };

  const handleDownload = async () => {
    try {
      const supported = await Linking.canOpenURL(info.downloadUrl);
      if (supported) {
        await Linking.openURL(info.downloadUrl);
      }
    } catch (e) {
      console.warn("[UpdateBanner] Failed to open download URL:", e);
    }
  };

  if (!visible) return null;

  return (
    <Animated.View style={[styles.container, { opacity }]}>
      <View style={styles.inner}>
        {/* Icon + text */}
        <View style={styles.textBlock}>
          <Text style={styles.icon}>⬆</Text>
          <View>
            <Text style={styles.title}>Update Available — v{info.latestVersion}</Text>
            {!!info.releaseNotes && (
              <Text style={styles.notes} numberOfLines={2}>
                {info.releaseNotes}
              </Text>
            )}
          </View>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <Pressable
            style={({ pressed }) => [styles.downloadBtn, pressed && styles.downloadBtnPressed]}
            onPress={handleDownload}
            accessibilityLabel="Download update"
            accessibilityRole="button"
          >
            <Text style={styles.downloadText}>Download</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.dismissBtn, pressed && styles.dismissBtnPressed]}
            onPress={handleDismiss}
            accessibilityLabel="Dismiss update banner"
            accessibilityRole="button"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.dismissText}>✕</Text>
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}

const C = PremiumColors;

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: Platform.OS === "android" ? 0 : 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    paddingTop: Platform.OS === "android" ? 32 : 44, // status bar clearance
    paddingHorizontal: 12,
    paddingBottom: 0,
  },
  inner: {
    backgroundColor: C.amber.brown,
    borderWidth: 1,
    borderColor: C.amber.primary,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    // subtle glow
    shadowColor: C.amber.primary,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  textBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  icon: {
    fontSize: 20,
    color: C.amber.primary,
  },
  title: {
    color: C.text.primary,
    fontWeight: "700",
    fontSize: 13,
    letterSpacing: 0.1,
  },
  notes: {
    color: C.text.secondary,
    fontSize: 11,
    marginTop: 2,
    lineHeight: 16,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  downloadBtn: {
    backgroundColor: C.amber.primary,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  downloadBtnPressed: {
    backgroundColor: C.amber.primaryPressed,
  },
  downloadText: {
    color: "#000",
    fontWeight: "800",
    fontSize: 12,
  },
  dismissBtn: {
    padding: 4,
  },
  dismissBtnPressed: {
    opacity: 0.5,
  },
  dismissText: {
    color: C.text.secondary,
    fontSize: 14,
    fontWeight: "700",
  },
});
