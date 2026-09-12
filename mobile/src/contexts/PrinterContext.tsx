import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../lib/supabase";
import { TicketData, printReceipt as printStandard, printToBluetooth } from "../lib/printing";
import { getPrintQueue, addPrintToQueue, removePrintFromQueue, QueuedPrint } from "../lib/printQueue";
import { Alert, Platform } from "react-native";

export interface PrinterConfig {
  enabled: boolean;
  macAddress: string;
  autoPrint: boolean;
  autoShowModal: boolean;
  silentPrint: boolean;
  terminalId: string;
  targetPrinter: string;
  paperWidth: number;
  printerWidth: number;
  autoCut: boolean;
  feedLines: number;
  openDrawerOnPrint: boolean;
  doubleHeightHeader: boolean;
  receiptShowLogo: boolean;
  isInternal?: boolean;
  isZ100?: boolean;
  isSunmi?: boolean;
  isIPos?: boolean;
  z100DefaultsApplied?: boolean;
  sunmiDefaultsApplied?: boolean;
  iposDefaultsApplied?: boolean;
}

const DEFAULT_CONFIG: PrinterConfig = {
  enabled: false,
  macAddress: "",
  autoPrint: false,
  autoShowModal: true,
  silentPrint: false,
  terminalId: "POS-01",
  targetPrinter: "",
  paperWidth: 58,
  printerWidth: 32,
  autoCut: true,
  feedLines: 1,
  openDrawerOnPrint: false,
  doubleHeightHeader: true,
  receiptShowLogo: true,
};

const Z100_DEFAULT_CONFIG: PrinterConfig = {
  ...DEFAULT_CONFIG,
  enabled: true,
  autoPrint: true,
  autoShowModal: false,
  silentPrint: true,
  isInternal: false,
  isZ100: true,
  paperWidth: 58,
  z100DefaultsApplied: true,
};

const SUNMI_DEFAULT_CONFIG: PrinterConfig = {
  ...DEFAULT_CONFIG,
  enabled: true,
  autoPrint: true,
  autoShowModal: false,
  silentPrint: true,
  isInternal: true,
  isSunmi: true,
  paperWidth: 58,
  printerWidth: 48,
  sunmiDefaultsApplied: true,
};

const IPOS_DEFAULT_CONFIG: PrinterConfig = {
  ...DEFAULT_CONFIG,
  enabled: true,
  autoPrint: true,
  autoShowModal: false,
  silentPrint: true,
  isInternal: true,
  isIPos: true,
  paperWidth: 58,
  printerWidth: 32,
  iposDefaultsApplied: true,
};

interface PrinterContextType {
  config: PrinterConfig;
  updateConfig: (newConfig: PrinterConfig) => Promise<void>;
  print: (ticketData: TicketData) => Promise<void>;
  executePrint: (ticketData: TicketData, forceConfig?: PrinterConfig) => Promise<void>;
  isPrinting: boolean;
  isScanning: boolean;
  failedPrints: QueuedPrint[];
  retryFailedPrints: () => Promise<void>;
  refreshQueue: () => Promise<void>;
  scanForPrinters: () => Promise<{deviceName: string, macAddress: string}[]>;
  autoConnect: () => Promise<string | null>;
  getDebugLogs: () => Promise<string[]>;
  getPrinterDiagnostics: () => Promise<string[]>;
  clearDebugLogs: () => Promise<boolean>;
}

const PrinterContext = createContext<PrinterContextType | undefined>(undefined);

export function PrinterProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<PrinterConfig>(DEFAULT_CONFIG);
  const [isPrinting, setIsPrinting] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [failedPrints, setFailedPrints] = useState<QueuedPrint[]>([]);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id || null));
  }, []);

  const detectZ100Device = useCallback(async () => {
    if (Platform.OS !== "android") return false;
    try {
      const mod = await import("../../modules/z100-printer");
      if (typeof mod.isZ100Device === "function") {
        return !!(await mod.isZ100Device());
      }
      return typeof mod.getDiagnostics === "function";
    } catch {
      return false;
    }
  }, []);

  const applyZ100DefaultsOnce = useCallback((current: PrinterConfig, isZ100Device: boolean): PrinterConfig => {
    if (!isZ100Device || current.z100DefaultsApplied) return current;
    return {
      ...current,
      enabled: true,
      autoPrint: true,
      autoShowModal: false,
      silentPrint: true,
      isInternal: false,
      isZ100: true,
      paperWidth: 58,
      z100DefaultsApplied: true,
    };
  }, []);

  const detectSunmiDevice = useCallback(async () => {
    if (Platform.OS !== "android") return false;
    try {
      const { isSunmiDevice } = await import("../lib/printing");
      if (typeof isSunmiDevice === "function") {
        return !!(await isSunmiDevice());
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  const applySunmiDefaultsOnce = useCallback((current: PrinterConfig, isSunmiDeviceFound: boolean): PrinterConfig => {
    if (!isSunmiDeviceFound || current.sunmiDefaultsApplied) return current;
    return {
      ...current,
      enabled: true,
      autoPrint: true,
      autoShowModal: false,
      silentPrint: true,
      isInternal: true,
      isSunmi: true,
      paperWidth: 58,
      printerWidth: 48,
      sunmiDefaultsApplied: true,
    };
  }, []);

  const detectIPosDevice = useCallback(async () => {
    if (Platform.OS !== "android") return false;
    try {
      const { isIPosDevice } = await import("../lib/printing");
      if (typeof isIPosDevice === "function") {
        return !!(await isIPosDevice());
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  const loadState = useCallback(async () => {
    const [isZ100Device, isSunmiDeviceFound, isIPosDeviceFound] = await Promise.all([
      detectZ100Device(),
      detectSunmiDevice(),
      detectIPosDevice(),
    ]);

    console.log(`[PrinterContext] Device detection: Z100=${isZ100Device} Sunmi=${isSunmiDeviceFound} IPos=${isIPosDeviceFound}`);

    let nextConfig = isSunmiDeviceFound
      ? SUNMI_DEFAULT_CONFIG
      : isZ100Device
        ? Z100_DEFAULT_CONFIG
        : isIPosDeviceFound
          ? IPOS_DEFAULT_CONFIG
          : DEFAULT_CONFIG;

    if (userId) {
      const val = await AsyncStorage.getItem(`printer_config_${userId}`);
      if (val) {
        try {
          const parsed = JSON.parse(val);
          nextConfig = applySunmiDefaultsOnce(
            applyZ100DefaultsOnce({ ...DEFAULT_CONFIG, ...parsed }, isZ100Device),
            isSunmiDeviceFound
          );
          // Apply iPOS defaults if not already set and device is detected
          if (isIPosDeviceFound && !nextConfig.iposDefaultsApplied && !nextConfig.isZ100 && !nextConfig.isSunmi) {
            nextConfig = { ...IPOS_DEFAULT_CONFIG, ...nextConfig, isIPos: true, iposDefaultsApplied: true };
          }
        } catch {
          nextConfig = isSunmiDeviceFound
            ? SUNMI_DEFAULT_CONFIG
            : isZ100Device
              ? Z100_DEFAULT_CONFIG
              : isIPosDeviceFound
                ? IPOS_DEFAULT_CONFIG
                : DEFAULT_CONFIG;
        }
      }
      setConfig(nextConfig);
      if (isSunmiDeviceFound && nextConfig.sunmiDefaultsApplied) {
        await AsyncStorage.setItem(`printer_config_${userId}`, JSON.stringify(nextConfig));
      } else if (isZ100Device && nextConfig.z100DefaultsApplied) {
        await AsyncStorage.setItem(`printer_config_${userId}`, JSON.stringify(nextConfig));
      } else if (isIPosDeviceFound && nextConfig.iposDefaultsApplied) {
        await AsyncStorage.setItem(`printer_config_${userId}`, JSON.stringify(nextConfig));
      }
    } else {
      setConfig(nextConfig);
    }
    const queue = await getPrintQueue();
    setFailedPrints(queue);
  }, [userId, detectZ100Device, detectSunmiDevice, detectIPosDevice, applyZ100DefaultsOnce, applySunmiDefaultsOnce]);

  useEffect(() => { loadState(); }, [loadState]);

  const updateConfig = async (newConfig: PrinterConfig) => {
    // Implement dependency logic here as a safeguard even if UI also does it
    const updated = {
        ...newConfig,
        enabled: (newConfig.isZ100 || newConfig.isSunmi) ? true : newConfig.enabled,
        autoPrint: (newConfig.isZ100 || newConfig.isSunmi) ? true : (newConfig.enabled ? newConfig.autoPrint : false),
        autoShowModal: (newConfig.isZ100 || newConfig.isSunmi) ? false : newConfig.autoShowModal,
        silentPrint: (newConfig.isZ100 || newConfig.isSunmi) ? true : (newConfig.enabled ? newConfig.silentPrint : false),
        isInternal: !!newConfig.isSunmi,
        paperWidth: newConfig.isZ100 || newConfig.isSunmi ? 58 : newConfig.paperWidth,
        printerWidth: newConfig.isZ100 || newConfig.isSunmi ? 48 : (newConfig.printerWidth || (newConfig.paperWidth === 80 ? 42 : 32)),
        autoCut: newConfig.autoCut !== false,
        feedLines: Number.isFinite(Number(newConfig.feedLines)) ? Math.max(0, Number(newConfig.feedLines)) : 1,
        openDrawerOnPrint: !!newConfig.openDrawerOnPrint,
        doubleHeightHeader: newConfig.doubleHeightHeader !== false,
        receiptShowLogo: newConfig.receiptShowLogo !== false,
        z100DefaultsApplied: newConfig.z100DefaultsApplied || newConfig.isZ100 || false,
        sunmiDefaultsApplied: newConfig.sunmiDefaultsApplied || newConfig.isSunmi || false,
    };

    setConfig(updated);
    if (userId) {
      await AsyncStorage.setItem(`printer_config_${userId}`, JSON.stringify(updated));
    }
  };

  const scanForPrinters = async (): Promise<{deviceName: string, macAddress: string}[]> => {
    setIsScanning(true);
    try {
      const { getBluetoothDevices } = await import("../lib/printing");
      const devices = await getBluetoothDevices();
      return devices;
    } catch (e) {
      console.error("[PrinterContext] Scan failed:", e);
      return [];
    } finally {
      setIsScanning(false);
    }
  };

  const autoConnect = async (): Promise<string | null> => {
    if (isScanning) return null;
    
    // Use the scanning logic to find a likely printer
    const devices = await scanForPrinters();
    if (devices.length > 0) {
      // Look for devices with "Printer", "POS", "Thermal", "MTP" in the name
      const likelyPrinter = devices.find(d => {
        const name = d.deviceName?.toLowerCase() || "";
        return name.includes("printer") || name.includes("pos") || name.includes("thermal") || name.includes("mtp");
      }) || devices[0]; // Fallback to first device

      if (likelyPrinter) {
        await updateConfig({ ...config, macAddress: likelyPrinter.macAddress });
        return likelyPrinter.macAddress;
      }
    }
    return null;
  };

  const executePrint = async (ticketData: TicketData, forceConfig?: PrinterConfig) => {
    let activeConfig = forceConfig || config;
    
    // Don't proceed if disabled unless it's a forced print
    if (!activeConfig.enabled && !forceConfig) return;

    // Auto-connect if Bluetooth requested but no MAC address set
    let effectiveMac = activeConfig.macAddress;
    if (activeConfig.enabled && !effectiveMac && !activeConfig.targetPrinter) {
      const autoMac = await autoConnect();
      if (autoMac) {
        effectiveMac = autoMac;
      }
    }

    try {
      if (activeConfig.isIPos) {
        const { printToIPos } = await import("../lib/printing");
        await printToIPos(ticketData, activeConfig);
      } else if (activeConfig.isZ100) {
        const { printToZ100 } = await import("../lib/printing");
        await printToZ100(ticketData);
      } else if (activeConfig.isSunmi) {
        const { printToSunmi } = await import("../lib/printing");
        await printToSunmi(ticketData, activeConfig);
      } else if (effectiveMac) {
        await printToBluetooth(ticketData, effectiveMac, activeConfig);
      } else {
        await printStandard(ticketData, activeConfig.targetPrinter, activeConfig.silentPrint);
      }
    } catch (e: any) {
      if (e.message !== "Print preview was cancelled.") {
        throw e;
      }
    }
  };

  const print = async (ticketData: TicketData) => {
    if (!config.enabled) return;

    setIsPrinting(true);
    try {
      await executePrint(ticketData);
    } catch (error: any) {
      if (config.macAddress) {
        await addPrintToQueue(ticketData);
        await loadState();
        Alert.alert("Print Queued", "Printer is unavailable. Receipt saved to offline queue.");
      } else {
        Alert.alert("Print Error", error.message || "Could not print receipt.");
      }
    } finally {
      setIsPrinting(false);
    }
  };

  const retryFailedPrints = async () => {
    if (failedPrints.length === 0 || isPrinting) return;
    setIsPrinting(true);
    let successCount = 0;
    
    for (const job of failedPrints) {
      try {
         await executePrint(job.ticketData);
         await removePrintFromQueue(job.id);
         successCount++;
      } catch (err) {
         Alert.alert("Printer Error", "Printer is still unavailable. Please check the connection and try again.");
         break;
      }
    }
    
    setIsPrinting(false);
    await loadState();
    
    if (successCount > 0) {
       Alert.alert("Retry Complete", `Successfully printed ${successCount} queued receipts.`);
    }
  };

  const value = {
    config,
    updateConfig,
    print,
    executePrint,
    isPrinting,
    isScanning,
    failedPrints,
    retryFailedPrints,
    refreshQueue: loadState,
    scanForPrinters,
    autoConnect,
    getDebugLogs: async () => {
      try {
        const { getLogs } = await import("../../modules/z100-printer");
        return await getLogs();
      } catch (e) {
        console.error("[PrinterContext] Failed to get debug logs:", e);
        return [`JS_ERROR: ${e instanceof Error ? e.message : String(e)}`];
      }
    },
    getPrinterDiagnostics: async () => {
      const lines: string[] = [];
      lines.push("=== FIELD POS MOBILE PRINTER REPORT ===");
      lines.push(`capturedAt=${new Date().toISOString()}`);
      lines.push(`platform=android`);
      lines.push("-- Saved printer settings --");
      lines.push(`enabled=${config.enabled}`);
      lines.push(`isZ100=${!!config.isZ100}`);
      lines.push(`isSunmi=${!!config.isSunmi}`);
      lines.push(`isIPos=${!!config.isIPos}`);
      lines.push(`isInternal=${!!config.isInternal}`);
      lines.push(`macAddress=${config.macAddress || "(empty)"}`);
      lines.push(`targetPrinter=${config.targetPrinter || "(empty)"}`);
      lines.push(`paperWidth=${config.paperWidth}`);
      lines.push(`printerWidth=${config.printerWidth}`);
      lines.push(`autoCut=${config.autoCut}`);
      lines.push(`feedLines=${config.feedLines}`);
      lines.push(`openDrawerOnPrint=${config.openDrawerOnPrint}`);
      lines.push(`doubleHeightHeader=${config.doubleHeightHeader}`);
      lines.push(`receiptShowLogo=${config.receiptShowLogo}`);
      lines.push(`autoPrint=${config.autoPrint}`);
      lines.push(`silentPrint=${config.silentPrint}`);
      lines.push(`terminalId=${config.terminalId || "(empty)"}`);

      try {
        const mod = await import("../../modules/z100-printer");
        lines.push("");
        lines.push("-- Native diagnostics --");
        if (typeof mod.getDiagnostics === "function") {
          lines.push(...await mod.getDiagnostics());
        } else {
          lines.push("getDiagnostics: unavailable in this native build");
        }

        lines.push("");
        const describePrinterStatus = (status: number) => {
          switch (status) {
            case 0:
              return "ok";
            case -1:
            case -1021:
            case -1015:
            case -1014:
            case -4002:
              return "paper_out";
            case -2:
            case -4005:
              return "too_hot";
            case -3:
              return "vendor_status_-3_demo_can_still_print";
            case -4001:
              return "print_busy";
            case -4003:
              return "data_error";
            case -4004:
              return "printer_fault";
            case -4007:
              return "font_library_missing";
            case -4008:
              return "buffer_overflow";
            case -4009:
              return "set_font_error";
            default:
              return "unknown";
          }
        };
        lines.push("-- Direct status check --");
        const directStatus = await mod.checkStatus();
        lines.push(`checkStatus=${directStatus} (${describePrinterStatus(directStatus)})`);

        lines.push("");
        lines.push("-- UART port diagnostics --");
        if (typeof mod.diagnoseUart === "function") {
          lines.push(...await mod.diagnoseUart());
        } else {
          lines.push("diagnoseUart: unavailable in this native build");
        }

        lines.push("");
        lines.push("-- Native printer log --");
        lines.push(...await mod.getLogs());
      } catch (e) {
        lines.push(`DIAGNOSTICS_ERROR: ${e instanceof Error ? e.message : String(e)}`);
      }

      return lines;
    },
    clearDebugLogs: async () => {
      try {
        const { clearLogs } = await import("../../modules/z100-printer");
        return await clearLogs();
      } catch (e) {
        console.error("[PrinterContext] Failed to clear logs:", e);
        return false;
      }
    }
  };

  return <PrinterContext.Provider value={value}>{children}</PrinterContext.Provider>;
}

export function usePrinterContext() {
  const context = useContext(PrinterContext);
  if (context === undefined) {
    throw new Error("usePrinterContext must be used within a PrinterProvider");
  }
  return context;
}
