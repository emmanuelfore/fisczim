/**
 * PrinterService handles ESC/POS communication across multiple transport layers:
 * 1. WebUSB (Direct Browser-to-Printer)
 * 2. Electron Bridge (Native Node access)
 * 3. Print Agent (Localhost Proxy for Ethernet/Legacy)
 */
export class PrinterService {
  private static currentDevice: any | null = null;

  /**
   * Request user permission for a USB device (WebUSB only)
   */
  static async requestDevice(): Promise<any | null> {
    if (typeof navigator === 'undefined' || !('usb' in navigator)) {
      throw new Error('WebUSB is not supported in this browser. Use Chrome, Edge, or Opera.');
    }

    try {
      // @ts-ignore
      const device = await navigator.usb.requestDevice({ filters: [] });
      this.currentDevice = device;
      return device;
    } catch (e) {
      console.error("User cancelled or no device selected", e);
      return null;
    }
  }

  /**
   * Find and open a previously paired device (WebUSB only)
   */
  static async getPairedDevice(): Promise<any | null> {
    if (typeof navigator === 'undefined' || !('usb' in navigator)) return null;

    try {
      // @ts-ignore
      const devices = await navigator.usb.getDevices();
      if (devices.length > 0) {
        this.currentDevice = devices[0];
        return devices[0];
      }
    } catch (e) {
      console.error("Error getting paired devices:", e);
    }
    return null;
  }

  /**
   * Send raw data to the device using the optimal transport layer.
   * Priority: Electron IPC → Print Agent → WebUSB (browser-only fallback)
   */
  static async printRaw(data: Uint8Array, options: { 
    useElectron?: boolean, 
    printServerUrl?: string, 
    printerName?: string 
  } = {}): Promise<boolean> {

    // 1. ELECTRON BRIDGE — preferred path when running inside the desktop app
    if (options.useElectron && (window as any).electronAPI?.printRaw) {
      try {
        console.log(`[PrinterService] Electron IPC → printer: "${options.printerName || 'system default'}"`);
        const result = await (window as any).electronAPI.printRaw(data, options.printerName);
        if (result) return true;
        console.warn('[PrinterService] Electron printRaw returned falsy');
      } catch (e: any) {
        console.error('[PrinterService] Electron printRaw threw:', e?.message ?? e);
      }
      // Do NOT fall through to WebUSB in Electron — it is meaningless there
      return false;
    }

    // 2. PRINT AGENT (Localhost Proxy for Ethernet / non-Electron web)
    if (options.printServerUrl) {
      try {
        // Pass printer name as a query param so the agent can route to the right printer
        const url = options.printerName
          ? `${options.printServerUrl}/print-raw?printer=${encodeURIComponent(options.printerName)}`
          : `${options.printServerUrl}/print-raw`;
        console.log(`[PrinterService] Print Agent → ${url}`);
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: new Blob([data as any])
        });
        if (response.ok) return true;
        console.warn('[PrinterService] Print Agent responded with', response.status);
      } catch (e: any) {
        console.error('[PrinterService] Print Agent request failed:', e?.message ?? e);
      }
    }

    // 3. WEBUSB — browser-only, no Electron, no Print Agent
    try {
      let device = this.currentDevice;
      if (!device) device = await this.getPairedDevice();

      if (device) {
        if (!device.opened) {
          await device.open();
          try { await device.selectConfiguration(1); } catch (e) {}
          await device.claimInterface(0);
        }
        const endpoint = device.configuration?.interfaces[0].alternate.endpoints
          .find((e: any) => e.direction === 'out');
        if (endpoint) {
          console.log(`[PrinterService] WebUSB → endpoint ${endpoint.endpointNumber}`);
          await device.transferOut(endpoint.endpointNumber, data);
          return true;
        }
      }
    } catch (err: any) {
      console.warn('[PrinterService] WebUSB failed:', err?.message ?? err);
      this.currentDevice = null;
    }

    return false;
  }


  /**
   * Disconnect manually if needed
   */
  static async disconnect(): Promise<void> {
    if (this.currentDevice && this.currentDevice.opened) {
      await this.currentDevice.close();
      this.currentDevice = null;
    }
  }
}
