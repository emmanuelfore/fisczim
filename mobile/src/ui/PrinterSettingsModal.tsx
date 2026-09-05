import React, { useMemo,  useState, useEffect } from "react";
import { Modal, View, Text, TouchableOpacity, ScrollView, TextInput, ActivityIndicator, Alert, Platform, StyleSheet, Share } from "react-native";
import { X, Bluetooth, Printer as PrinterIcon, Activity, RefreshCw, Trash2, Share2, Download } from "lucide-react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
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
  const { config, updateConfig, scanForPrinters, isScanning, executePrint, getDebugLogs, getPrinterDiagnostics, clearDebugLogs } = usePrinter();

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
        total: "1.00",
        items: [
          {
            name: "Z100 PRINT TEST",
            description: "Z100 PRINT TEST",
            quantity: 1,
            price: 1,
            lineTotal: 1
          }
        ],
        createdAt: new Date().toISOString(),
        receiptCounter: "001",
        receiptGlobalNo: "001",
        fiscalDayNo: "1",
        currency: "USD"
      },
      company: {
        name: "FieldPOS Z100 Test",
        tin: "TEST-TIN",
        vatNumber: "TEST-VAT",
        posSettings: { receiptFooter: "Printer diagnostics test" }
      },
      items: [
        {
          name: "Z100 PRINT TEST",
          description: "Z100 PRINT TEST",
          quantity: 1,
          price: 1,
          lineTotal: 1
        }
      ],
      cashierName: "Admin"
    };
    
    // Auto-save settings before test
    await updateConfig(draft);

    try {
      console.log(`[PrinterSettings] Test Print triggered with MAC: ${draft.macAddress}`);
      // Pass the draft directly as forceConfig since state hasn't updated yet in this macro-task
      await executePrint(testData as any, draft);
      Alert.alert("Success", "Test print sent!");
    } catch (error: any) {
      console.error("[PrinterSettings] Test print failed:", error);
      Alert.alert("Print Failed", error.message || "Test print failed. Check your printer connection.");
    }
  };

  const [showDebug, setShowDebug] = useState(false);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [debugReport, setDebugReport] = useState("");
  const [loadingLogs, setLoadingLogs] = useState(false);

  const buildReport = async () => {
    setLoadingLogs(true);
    try {
      const diagnostics = await getPrinterDiagnostics();
      const logs = await getDebugLogs();
      const report = diagnostics.join("\n") + "\n\n=== RAW APP LOG VIEW ===\n" + logs.join("\n");
      setDebugLogs(logs);
      setDebugReport(report);
    } catch (e) {
      const fallback = `Failed to fetch diagnostics: ${e}`;
      setDebugLogs([fallback]);
      setDebugReport(fallback);
    } finally {
      setLoadingLogs(false);
    }
  };

  const handleOpenDebug = async () => {
    setShowDebug(true);
    await buildReport();
  };

  const handleClearLogs = async () => {
    const success = await clearDebugLogs();
    if (success) {
      setDebugLogs(["Logs cleared"]);
      setDebugReport("Logs cleared");
    }
  };

  const handleShareReport = async () => {
    if (!debugReport.trim()) {
      await buildReport();
    }
    const message = debugReport.trim() || "No printer diagnostics captured.";
    await Share.share({ message, title: "Z100 Printer Diagnostics" });
  };

  const handleExportLogFile = async () => {
    try {
      let report = debugReport.trim();
      if (!report) {
        setLoadingLogs(true);
        const diagnostics = await getPrinterDiagnostics();
        const logs = await getDebugLogs();
        report = diagnostics.join("\n") + "\n\n=== RAW APP LOG VIEW ===\n" + logs.join("\n");
        setDebugLogs(logs);
        setDebugReport(report);
      }

      const safeTimestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const fileUri = `${FileSystem.cacheDirectory}z100-printer-log-${safeTimestamp}.txt`;
      await FileSystem.writeAsStringAsync(fileUri, report || "No printer diagnostics captured.", {
        encoding: FileSystem.EncodingType.UTF8,
      });

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, {
          mimeType: "text/plain",
          dialogTitle: "Export Z100 Printer Log",
          UTI: "public.plain-text",
        });
      } else {
        await Share.share({ message: report || "No printer diagnostics captured.", title: "Z100 Printer Diagnostics" });
      }
    } catch (e: any) {
      Alert.alert("Export Failed", e?.message || "Could not export the printer log file.");
    } finally {
      setLoadingLogs(false);
    }
  };

  const handleSaveLogToDevice = async () => {
    try {
      const mod = require("../../modules/z100-printer").default;
      if (typeof mod.saveLogsToDevice !== "function") {
        Alert.alert("Not Available", "This APK does not include direct log saving yet.");
        return;
      }
      const path = await mod.saveLogsToDevice();
      if (String(path).startsWith("ERROR:")) {
        Alert.alert("Save Failed", path);
        return;
      }
      Alert.alert("Log Saved", `${path}\n\nADB:\nadb pull /sdcard/Android/data/com.emmanuelff.fieldpos/files/Documents/z100-printer-log.txt`);
    } catch (e: any) {
      Alert.alert("Save Failed", e?.message || "Could not save the printer log to device storage.");
    }
  };

  const handleSdkSamplePrint = async () => {
    setLoadingLogs(true);
    try {
      const mod = require("../../modules/z100-printer").default;
      if (typeof mod.printSdkSample !== "function") {
        Alert.alert("Not Available", "This APK does not include the SDK sample print yet.");
        return;
      }
      const ok = await mod.printSdkSample();
      await buildReport();
      Alert.alert(ok ? "SDK Sample Sent" : "SDK Sample Failed", ok ? "The vendor SDK sample returned success." : "The vendor SDK sample failed. Save/export the log.");
    } catch (e: any) {
      Alert.alert("SDK Sample Failed", e?.message || "Could not run the SDK sample print.");
    } finally {
      setLoadingLogs(false);
    }
  };

  const styles = useMemo(() => makeStyles(C, isDark, insets), [C, isDark, insets]);

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.content}>
          <View style={styles.header}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Text style={styles.headerTitle}>Printer Settings</Text>
              {Platform.OS === 'android' && (
                <TouchableOpacity 
                   onPress={handleOpenDebug}
                   style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: hexAlpha(C.amber.primary, 0.1), alignItems: "center", justifyContent: "center" }}
                >
                  <Activity size={18} color={C.amber.primary} />
                </TouchableOpacity>
              )}
            </View>
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
                  return {
                    ...p,
                    enabled: next,
                    autoPrint: next ? (p.isZ100 ? true : p.autoPrint) : false,
                    silentPrint: next ? (p.isZ100 ? true : p.silentPrint) : false,
                    autoShowModal: p.isZ100 ? false : p.autoShowModal,
                  };
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
                label="Use Sunmi Built-in Printer"
                value={draft.isSunmi}
                disabled={false}
                onToggle={() => setDraft(p => {
                  const next = !p.isSunmi;
                  return {
                    ...p,
                    enabled: next ? true : p.enabled,
                    isSunmi: next,
                    isZ100: next ? false : p.isZ100,
                    isInternal: next ? true : false,
                    autoPrint: next ? true : p.autoPrint,
                    silentPrint: next ? true : p.silentPrint,
                    autoShowModal: next ? false : p.autoShowModal,
                    paperWidth: next ? 58 : p.paperWidth,
                    printerWidth: next ? 48 : p.printerWidth,
                    sunmiDefaultsApplied: next ? true : p.sunmiDefaultsApplied,
                  };
                })}
                C={C}
                highlight
              />
              <ToggleRow
                label="Use Z100 Native SDK Printer"
                value={draft.isZ100}
                disabled={false}
                onToggle={() => setDraft(p => {
                  const next = !p.isZ100;
                  return {
                    ...p,
                    enabled: next ? true : p.enabled,
                    isZ100: next,
                    isSunmi: next ? false : p.isSunmi,
                    isInternal: false,
                    autoPrint: next ? true : p.autoPrint,
                    silentPrint: next ? true : p.silentPrint,
                    autoShowModal: next ? false : p.autoShowModal,
                    paperWidth: next ? 58 : p.paperWidth,
                    z100DefaultsApplied: next ? true : p.z100DefaultsApplied,
                  };
                })}
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
                    onPress={() => setDraft(p => ({ ...p, paperWidth: w, printerWidth: w === 80 ? 42 : 32 }))}
                    style={[styles.widthBtn, draft.paperWidth === w && styles.widthBtnActive]}
                  >
                    <Text style={[styles.widthBtnText, draft.paperWidth === w && { color: C.amber.primary }]}>{w}mm</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputLabel}>ESC/POS Character Width:</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {[
                  { w: 32, label: "32ch · 58mm" },
                  { w: 42, label: "42ch · 80mm" },
                  { w: 48, label: "48ch" },
                ].map(({ w, label }) => (
                  <TouchableOpacity
                    key={w}
                    onPress={() => setDraft(p => ({ ...p, printerWidth: w, paperWidth: w === 32 ? 58 : p.paperWidth }))}
                    style={[styles.widthBtn, draft.printerWidth === w && styles.widthBtnActive]}
                  >
                    <Text style={[styles.widthBtnText, draft.printerWidth === w && { color: C.amber.primary }]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={{ marginTop: 18 }}>
                <ToggleRow
                  label="Auto-Cut"
                  value={draft.autoCut}
                  disabled={!draft.enabled}
                  onToggle={() => setDraft(p => ({ ...p, autoCut: !p.autoCut }))}
                  C={C}
                />
                <ToggleRow
                  label="Open Cash Drawer"
                  value={draft.openDrawerOnPrint}
                  disabled={!draft.enabled}
                  onToggle={() => setDraft(p => ({ ...p, openDrawerOnPrint: !p.openDrawerOnPrint }))}
                  C={C}
                />
                <ToggleRow
                  label="Large Header"
                  value={draft.doubleHeightHeader}
                  disabled={!draft.enabled}
                  onToggle={() => setDraft(p => ({ ...p, doubleHeightHeader: !p.doubleHeightHeader }))}
                  C={C}
                />
                <ToggleRow
                  label="Print Logo"
                  value={draft.receiptShowLogo}
                  disabled={!draft.enabled}
                  onToggle={() => setDraft(p => ({ ...p, receiptShowLogo: !p.receiptShowLogo }))}
                  C={C}
                />
              </View>

              <Text style={styles.inputLabel}>Feed Lines:</Text>
              <TextInput
                style={styles.input}
                value={String(draft.feedLines ?? 1)}
                onChangeText={(t) => setDraft(p => ({ ...p, feedLines: Math.max(0, parseInt(t || "0", 10) || 0) }))}
                placeholder="1"
                placeholderTextColor={C.text.secondary}
                keyboardType="number-pad"
              />
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

      <Modal visible={showDebug} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.9)", padding: 24, justifyContent: "center" }}>
          <View style={{ backgroundColor: C.bg.base, borderRadius: 24, padding: 20, maxHeight: "80%" }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.text.primary, fontSize: 18, fontWeight: "800" }}>Z100 Diagnostics</Text>
                <Text style={{ color: C.text.secondary, fontSize: 12, fontWeight: "600", marginTop: 4 }}>
                  Long-press the report text to select/copy, or use Share.
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowDebug(false)}>
                <X size={24} color={C.text.secondary} />
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              <TouchableOpacity onPress={buildReport} disabled={loadingLogs} style={[styles.debugAction, { backgroundColor: hexAlpha(C.amber.primary, 0.12) }]}>
                <RefreshCw size={14} color={C.amber.primary} />
                <Text style={[styles.debugActionText, { color: C.amber.primary }]}>Refresh</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleShareReport} disabled={loadingLogs} style={[styles.debugAction, { backgroundColor: hexAlpha(C.text.primary, 0.08) }]}>
                <Share2 size={14} color={C.text.primary} />
                <Text style={[styles.debugActionText, { color: C.text.primary }]}>Share</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleExportLogFile} disabled={loadingLogs} style={[styles.debugAction, { backgroundColor: hexAlpha(C.status.success, 0.12) }]}>
                <Download size={14} color={C.status.success} />
                <Text style={[styles.debugActionText, { color: C.status.success }]}>Export</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSaveLogToDevice} disabled={loadingLogs} style={[styles.debugAction, { backgroundColor: hexAlpha(C.status.info, 0.12) }]}>
                <Download size={14} color={C.status.info} />
                <Text style={[styles.debugActionText, { color: C.status.info }]}>Save</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSdkSamplePrint} disabled={loadingLogs} style={[styles.debugAction, { backgroundColor: hexAlpha(C.amber.primary, 0.16) }]}>
                <PrinterIcon size={14} color={C.amber.primary} />
                <Text style={[styles.debugActionText, { color: C.amber.primary }]}>SDK Sample</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleClearLogs} disabled={loadingLogs} style={[styles.debugAction, { backgroundColor: hexAlpha(C.status.error, 0.1) }]}>
                <Trash2 size={14} color={C.status.error} />
                <Text style={[styles.debugActionText, { color: C.status.error }]}>Clear</Text>
              </TouchableOpacity>
            </View>
            
            {loadingLogs ? (
               <ActivityIndicator color={C.amber.primary} />
            ) : (
              <TextInput
                value={debugReport || (debugLogs.length ? debugLogs.join("\n") : "No diagnostics captured. Tap Refresh.")}
                editable={false}
                multiline
                scrollEnabled
                selectTextOnFocus
                style={styles.debugReport}
                textAlignVertical="top"
              />
            )}
          </View>
        </View>
      </Modal>
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
  debugAction: { flex: 1, minHeight: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 },
  debugActionText: { fontSize: 11, fontWeight: "900" },
  debugReport: { minHeight: 360, maxHeight: 460, backgroundColor: C.bg.panel, color: C.text.primary, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: C.bg.glassBorder, fontSize: 11, fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }), lineHeight: 16 },
});
