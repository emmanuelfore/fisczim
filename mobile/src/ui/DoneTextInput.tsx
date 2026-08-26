import React, { forwardRef, useMemo } from "react";
import {
  InputAccessoryView,
  Keyboard,
  Platform,
  Text,
  TextInput as RNTextInput,
  TouchableOpacity,
  View,
} from "react-native";
import type { TextInputProps } from "react-native";

const ACTION_KEYBOARDS = new Set(["decimal-pad", "number-pad", "numeric", "phone-pad"]);

type Props = TextInputProps & {
  onAccessoryDone?: () => void;
};

export const DoneTextInput = forwardRef<RNTextInput, Props>(function DoneTextInput(
  { keyboardType, onAccessoryDone, onSubmitEditing, returnKeyType, blurOnSubmit, ...props },
  ref
) {
  const needsAccessory = typeof keyboardType === "string" && ACTION_KEYBOARDS.has(keyboardType);
  const accessoryId = useMemo(
    () => `done-input-${Math.random().toString(36).slice(2)}`,
    []
  );

  const done = () => {
    Keyboard.dismiss();
    onAccessoryDone?.();
  };

  return (
    <>
      <RNTextInput
        ref={ref}
        {...props}
        keyboardType={keyboardType}
        inputAccessoryViewID={needsAccessory && Platform.OS === "ios" ? accessoryId : props.inputAccessoryViewID}
        returnKeyType={returnKeyType ?? (needsAccessory ? "done" : undefined)}
        blurOnSubmit={blurOnSubmit ?? (needsAccessory ? true : undefined)}
        onSubmitEditing={(event) => {
          onSubmitEditing?.(event);
          if (needsAccessory) Keyboard.dismiss();
        }}
      />
      {needsAccessory && Platform.OS === "ios" && (
        <InputAccessoryView nativeID={accessoryId}>
          <View style={{
            minHeight: 46,
            backgroundColor: "#111318",
            borderTopWidth: 1,
            borderTopColor: "#1E2128",
            alignItems: "flex-end",
            justifyContent: "center",
            paddingHorizontal: 12,
          }}>
            <TouchableOpacity
              onPress={done}
              style={{
                minHeight: 34,
                minWidth: 72,
                borderRadius: 8,
                backgroundColor: "#F0A500",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: "#000", fontSize: 14, fontWeight: "900" }}>Done</Text>
            </TouchableOpacity>
          </View>
        </InputAccessoryView>
      )}
    </>
  );
});
