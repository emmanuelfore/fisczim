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
   * Send raw data to the device using the optimal transport layer
   */
  static async printRaw(data: Uint8Array, options: { 
    useElectron?: boolean, 
    printServerUrl?: string, 
    printerName?: string 
  } = {}): Promise<boolean> {
    
    // 1. ELECTRON BRIDGE (Native Node Access)
    if (options.useElectron && (window as any).electronAPI?.printRaw) {
      try {
        const result = await (window as any).electronAPI.printRaw(data, options.printerName);
        if (result) return true;
      } catch (e) {
        console.error("Electron printRaw failed, trying fallbacks...", e);
      }
    }

    // 2. WEBUSB (Direct Browser Access) - OPTIMIZED: Stay claimed
    try {
      let device = this.currentDevice;
      if (!device) {
        device = await this.getPairedDevice();
      }

      if (device) {
        if (!device.opened) {
            await device.open();
            try { await device.selectConfiguration(1); } catch (e) {}
            await device.claimInterface(0);
        }

        const endpoint = device.configuration?.interfaces[0].alternate.endpoints.find(
          (e: any) => e.direction === 'out'
        );

        if (endpoint) {
          // Send data WITHOUT releasing so the next call is instant
          await device.transferOut(endpoint.endpointNumber, data);
          return true;
        }
      }
    } catch (err) {
      console.warn("WebUSB printing failed, trying Print Agent...", err);
      // If WebUSB error occurred, reset current device to force fresh connect
      this.currentDevice = null;
    }

    // 3. PRINT AGENT (Localhost Proxy for Ethernet/Legacy)
    if (options.printServerUrl) {
      try {
        const response = await fetch(`${options.printServerUrl}/print-raw`, {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream" },
          body: new Blob([data as any])
        });
        if (response.ok) return true;
      } catch (e) {
        console.error("Print Agent reached but failed:", e);
      }
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
