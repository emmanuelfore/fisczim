import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../lib/supabase";
import { TicketData, printReceipt as printStandard, printToBluetooth } from "../lib/printing";
import { getPrintQueue, addPrintToQueue, removePrintFromQueue, QueuedPrint } from "../lib/printQueue";
import { Alert } from "react-native";

export interface PrinterConfig {
  enabled: boolean;
  macAddress: string;
  autoPrint: boolean;
  autoShowModal: boolean;
  silentPrint: boolean;
  terminalId: string;
  targetPrinter: string;
  paperWidth: number;
}

const DEFAULT_CONFIG: PrinterConfig = {
  enabled: false,
  macAddress: "",
  autoPrint: false,
  autoShowModal: true,
  silentPrint: false,
  terminalId: "POS-01",
  targetPrinter: "",
  paperWidth: 58
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

  const loadState = useCallback(async () => {
    if (userId) {
      const val = await AsyncStorage.getItem(`printer_config_${userId}`);
      if (val) {
        try { 
          const parsed = JSON.parse(val);
          // Ensure we merge with DEFAULT_CONFIG to handle new fields
          setConfig({ ...DEFAULT_CONFIG, ...parsed }); 
        } catch {
          setConfig(DEFAULT_CONFIG);
        }
      } else {
        setConfig(DEFAULT_CONFIG);
      }
    }
    const queue = await getPrintQueue();
    setFailedPrints(queue);
  }, [userId]);

  useEffect(() => { loadState(); }, [loadState]);

  const updateConfig = async (newConfig: PrinterConfig) => {
    // Implement dependency logic here as a safeguard even if UI also does it
    const updated = {
        ...newConfig,
        autoPrint: newConfig.enabled ? newConfig.autoPrint : false,
        silentPrint: newConfig.enabled ? newConfig.silentPrint : false,
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
      if (effectiveMac) {
        await printToBluetooth(ticketData, effectiveMac);
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
