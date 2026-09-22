export {};

interface UpdateInfo {
  version: string;
  releaseNotes?: string;
}

interface ElectronAPI {
  isElectron: true;
  clearSessionOnLaunch?: true;
  printReceipt: (html: string, printerName?: string) => Promise<boolean>;
  getPrinters: () => Promise<Array<{ name: string; isDefault: boolean }>>;
  testPrint: (printerName: string) => Promise<boolean>;
  openCashDrawer: (printerName?: string) => Promise<boolean>;
  onUpdateAvailable: (callback: (info: UpdateInfo) => void) => void;
  installUpdate: () => Promise<void>;
  onBarcodeScan: (callback: (barcode: string) => void) => void;
  offBarcodeScan: (callback: (barcode: string) => void) => void;
  getSerialPorts: () => Promise<Array<{ path: string; manufacturer?: string }>>;
  verifyManagerPin: (pin: string, companyId: number) => Promise<boolean>;
  cacheManagerPins: (companyId: number, hashes: Array<{ id: string; name: string; pinHash: string }>) => Promise<void>;
  clearStorage: () => Promise<boolean>;
  notifyAppReady?: () => Promise<void>;
  notifyRendererAlive?: () => Promise<void>;
  onSplashStatus?: (callback: (s: { pct?: number; msg?: string }) => void) => void;
  splashRetry?: () => Promise<void>;
  splashContinue?: () => Promise<void>;
  saveOfflineCredential?: (record: { email: string; hash: string; salt: string; pinHash?: string; pinSalt?: string; user: any; lastOnlineLogin: string }) => Promise<boolean>;
  verifyOfflineCredential?: (email: string, password: string) => Promise<any | null>;
  verifyOfflinePin?: (email: string, pin: string) => Promise<any | null>;
  getOfflineUsers?: () => Promise<any[]>;
  onAppClosing?: (callback: () => void) => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
