import React from "react";
import { ActivityIndicator, Text, TouchableOpacity, ViewStyle, Platform } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { PremiumColors as C } from "./PremiumColors";

type Props = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  variant?: "primary" | "ghost";
};

export function Button({ title, onPress, disabled, loading, style, variant = "primary" }: Props) {
  const content = (
    <>
      {loading ? (
        <ActivityIndicator color={variant === "ghost" ? C.amber.primary : "black"} />
      ) : (
        <Text
          style={{
            color: variant === "ghost" ? C.text.primary : "black",
            fontWeight: "900",
            letterSpacing: 1.2,
            textTransform: "uppercase",
            fontSize: 12
          }}
        >
          {title}
        </Text>
      )}
    </>
  );

  if (variant === "ghost") {
    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onPress}
        disabled={disabled || loading}
        style={[
          {
            borderRadius: 18,
            paddingVertical: 14,
            paddingHorizontal: 16,
            backgroundColor: C.bg.card,
            alignItems: "center",
            justifyContent: "center",
            shadowColor: "#000",
            shadowOpacity: 0.15,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 4 },
            elevation: 6
          },
          style
        ]}
      >
        {content}
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={onPress}
      disabled={disabled || loading}
      style={[{ 
        borderRadius: 22,
        shadowColor: C.amber.primary,
        shadowOpacity: disabled ? 0 : 0.35,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 6 },
        elevation: disabled ? 0 : 8
      }, style]}
    >
      <LinearGradient
        colors={disabled ? [C.bg.hover, C.bg.card] : [C.amber.primary, C.amber.light]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{
          borderRadius: 22,
          paddingVertical: 16,
          paddingHorizontal: 18,
          alignItems: "center",
          justifyContent: "center"
        }}
      >
        {content}
      </LinearGradient>
    </TouchableOpacity>
  );
}

