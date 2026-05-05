import React, { useState, useEffect } from "react";
import { Modal, View, Text, TouchableOpacity, ScrollView, TextInput, ActivityIndicator, Alert, Platform, StyleSheet } from "react-native";
import { X, Bluetooth, Printer as PrinterIcon } from "lucide-react-native";
import { useTheme, hexAlpha } from "./PremiumColors";
import { Button } from "./Button";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PrinterConfig, usePrinter } from "../hooks/usePrinter";

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function PrinterSettingsModal({ visible, onClose }: Props) {
  const { theme: C, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { config, updateConfig, scanForPrinters, isScanning, executePrint } = usePrinter();

  const [draft, setDraft] = useState<PrinterConfig>(config);
  const [discoveredDevices, setDiscoveredDevices] = useState<{ deviceName: string, macAddress: string }[]>([]);

  useEffect(() => {
    if (visible) {
      setDraft(config);
      setDiscoveredDevices([]);
    }
  }, [visible, config]);

  const handleScan = async () => {
    setDiscoveredDevices([]);
    try {
      const devices = await scanForPrinters();
      setDiscoveredDevices(devices);
      if (devices.length === 0) {
        Alert.alert("No Devices Found", "Make sure your bluetooth printer is turned on and paired with this device.");
      }
    } catch (error) {
      Alert.alert("Scan Failed", "Could not scan for bluetooth devices.");
    }
  };

  const handleSave = () => {
    updateConfig(draft);
    onClose();
  };

  const handleTestPrintWithExecute = async () => {
    const testData = {
      invoice: {
        invoiceNumber: "TEST-001",
        total: "0.00",
        items: [],
        createdAt: new Date().toISOString(),
        receiptCounter: "001",
        receiptGlobalNo: "001",
        fiscalDayNo: "1",
        currency: "USD"
      },
      company: draft.enabled ? draft : { name: "Test Printing" },
      items: [],
      cashierName: "Admin"
    };

    try {
      await updateConfig(draft);
      await executePrint(testData as any);
      Alert.alert("Success", "Test print sent!");
    } catch (error: any) {
      Alert.alert("Print Failed", error.message || "Test print failed. Check your printer connection.");
    }
  };

  if (!visible) return null;

  const styles = makeStyles(C, isDark, insets);

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Printer Settings</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={24} color={C.text.secondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>General Behavior</Text>
              <ToggleRow
                label="Enable Printing"
                value={draft.enabled}
                onToggle={() => setDraft(p => {
                  const next = !p.enabled;
                  return { ...p, enabled: next, autoPrint: next ? p.autoPrint : false, silentPrint: next ? p.silentPrint : false };
                })}
                C={C}
              />
              <ToggleRow
                label="Auto Print Receipt"
                value={draft.autoPrint}
                disabled={!draft.enabled}
                onToggle={() => setDraft(p => ({ ...p, autoPrint: !p.autoPrint }))}
                C={C}
              />
              <ToggleRow
                label="Show Success Modal"
                value={draft.autoShowModal}
                onToggle={() => setDraft(p => ({ ...p, autoShowModal: !p.autoShowModal }))}
                C={C}
              />
              <ToggleRow
                label="Silent AirPrint"
                value={draft.silentPrint}
                disabled={!draft.enabled}
                onToggle={() => setDraft(p => ({ ...p, silentPrint: !p.silentPrint }))}
                C={C}
              />
            </View>

            <View style={[styles.section, { borderColor: C.amber.primary, borderWidth: 1.5 }]}>
              <View style={styles.sectionHeader}>
                <PrinterIcon size={20} color={C.amber.primary} />
                <Text style={[styles.sectionTitle, { color: C.amber.primary, marginBottom: 0 }]}>Activate Terminal Mode</Text>
              </View>
              <Text style={styles.sectionDescription}>
                Enable this if you are running on an Android POS terminal with a built-in thermal printer.
              </Text>
              <ToggleRow
                label="Use Generic Built-in Bluetooth Printer"
                value={draft.isInternal}
                disabled={!draft.enabled || draft.isZ100}
                onToggle={() => setDraft(p => ({ ...p, isInternal: !p.isInternal, isZ100: false, paperWidth: !p.isInternal ? 58 : p.paperWidth }))}
                C={C}
              />
              <ToggleRow
                label="Use Z100 Native SDK Printer"
                value={draft.isZ100}
                disabled={!draft.enabled}
                onToggle={() => setDraft(p => ({ ...p, isZ100: !p.isZ100, isInternal: false, paperWidth: !p.isZ100 ? 58 : p.paperWidth }))}
                C={C}
                highlight
              />
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Bluetooth size={20} color={C.amber.primary} />
                <Text style={styles.sectionTitle}>Bluetooth Thermal Printer</Text>
              </View>
              <Text style={styles.sectionDescription}>Select a paired printer from the list, or type its MAC address manually.</Text>

              <Button
                title={isScanning ? "Scanning..." : "Scan for Bluetooth Printers"}
                onPress={handleScan}
                variant={isScanning ? "ghost" : "primary"}
                style={{ marginBottom: 16 }}
              />

              {isScanning && <ActivityIndicator color={C.amber.primary} style={{ marginBottom: 16 }} />}

              {discoveredDevices.length > 0 && (
                <View style={styles.deviceList}>
                  {discoveredDevices.map((dev, i) => (
                    <TouchableOpacity
                      key={i}
                      onPress={() => setDraft(p => ({ ...p, macAddress: dev.macAddress }))}
                      style={[styles.deviceItem, draft.macAddress === dev.macAddress && styles.deviceItemActive]}
                    >
                      <View>
                        <Text style={[styles.deviceText, draft.macAddress === dev.macAddress && { color: C.amber.primary }]}>{dev.deviceName || "Unknown Device"}</Text>
                        <Text style={styles.deviceMac}>{dev.macAddress}</Text>
                      </View>
                      {draft.macAddress === dev.macAddress && <View style={styles.deviceDot} />}
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <Text style={styles.inputLabel}>Manual MAC Address:</Text>
              <TextInput
                style={styles.input}
                value={draft.macAddress}
                onChangeText={(t) => setDraft(p => ({ ...p, macAddress: t }))}
                placeholder="e.g. 00:11:22:33:44:55"
                placeholderTextColor={C.text.secondary}
                autoCapitalize="characters"
              />

              <Text style={styles.inputLabel}>Paper Width:</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {[58, 80].map(w => (
                  <TouchableOpacity
                    key={w}
                    onPress={() => setDraft(p => ({ ...p, paperWidth: w }))}
                    style={[styles.widthBtn, draft.paperWidth === w && styles.widthBtnActive]}
                  >
                    <Text style={[styles.widthBtnText, draft.paperWidth === w && { color: C.amber.primary }]}>{w}mm</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <PrinterIcon size={20} color={C.text.primary} />
                <Text style={styles.sectionTitle}>System / Network Printer</Text>
              </View>
              <Text style={styles.sectionDescription}>If you are not using Bluetooth, enter the system printer exact URL (AirPrint/CUPS).</Text>
              <TextInput
                style={styles.input}
                value={draft.targetPrinter}
                onChangeText={(t) => setDraft(p => ({ ...p, targetPrinter: t }))}
                placeholder="e.g. ipp://printer.local..."
                placeholderTextColor={C.text.secondary}
                autoCapitalize="none"
              />
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <Button title="Test Print" variant="ghost" style={{ flex: 1 }} onPress={handleTestPrintWithExecute} />
            <Button title="Save Settings" style={{ flex: 2 }} onPress={handleSave} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ToggleRow({ label, value, onToggle, disabled, C, highlight }: any) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
      <Text style={{ color: C.text.primary, fontWeight: highlight ? "800" : "600", fontSize: highlight ? 15 : 14 }}>{label}</Text>
      <TouchableOpacity
        activeOpacity={0.8}
        disabled={disabled}
        onPress={onToggle}
        style={{ width: 44, height: 24, borderRadius: 12, backgroundColor: value ? C.amber.primary : (disabled ? hexAlpha(C.text.secondary, 0.1) : hexAlpha(C.text.secondary, 0.2)), justifyContent: "center", paddingHorizontal: 2, opacity: disabled ? 0.4 : 1 }}
      >
        <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: "white", alignSelf: value ? "flex-end" : "flex-start", shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 2, elevation: 1 }} />
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (C: any, isDark: boolean, insets: any) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.8)", justifyContent: "flex-end" },
  content: { backgroundColor: C.bg.base, borderTopLeftRadius: 32, borderTopRightRadius: 32, height: "92%", paddingTop: 8, borderTopWidth: 1, borderColor: C.bg.glassBorder },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 24, paddingVertical: 20, borderBottomWidth: 1, borderColor: C.bg.glassBorder },
  headerTitle: { color: C.text.primary, fontSize: 22, fontWeight: "900", letterSpacing: -0.5 },
  closeBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: C.bg.panel, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.bg.glassBorder },
  section: { marginBottom: 24, padding: 20, backgroundColor: C.bg.panel, borderRadius: 24, borderWidth: 1, borderColor: C.bg.glassBorder },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
  sectionTitle: { color: C.text.primary, fontWeight: "900", fontSize: 16, letterSpacing: -0.2 },
  sectionDescription: { color: C.text.secondary, fontSize: 14, marginBottom: 20, lineHeight: 20, fontWeight: "500" },
  inputLabel: { color: C.text.primary, fontSize: 13, fontWeight: "700", marginBottom: 8, marginTop: 16, opacity: 0.8 },
  input: { backgroundColor: C.bg.base, color: C.text.primary, borderRadius: 14, paddingHorizontal: 16, height: 50, borderWidth: 1.5, borderColor: C.bg.glassBorder, fontSize: 16, fontWeight: "600" },
  deviceList: { marginBottom: 16, backgroundColor: C.bg.base, borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: C.bg.glassBorder },
  deviceItem: { padding: 16, borderBottomWidth: 1, borderColor: C.bg.glassBorder, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  deviceItemActive: { backgroundColor: hexAlpha(C.amber.primary, 0.08) },
  deviceText: { color: C.text.primary, fontWeight: "700", fontSize: 15 },
  deviceMac: { color: C.text.secondary, fontSize: 12, fontWeight: "600", marginTop: 2 },
  deviceDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.amber.primary },
  widthBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1.5, borderColor: C.bg.glassBorder, backgroundColor: C.bg.base, alignItems: "center" },
  widthBtnActive: { borderColor: C.amber.primary, backgroundColor: hexAlpha(C.amber.primary, 0.08) },
  widthBtnText: { color: C.text.primary, fontWeight: "800", fontSize: 14 },
  footer: { padding: 24, borderTopWidth: 1, borderColor: C.bg.glassBorder, paddingBottom: Math.max(insets.bottom, 24), flexDirection: "row", gap: 12 },
});
