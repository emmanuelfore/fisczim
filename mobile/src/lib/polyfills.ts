/**
 * Polyfills for older JavaScript environments (e.g. Android 7 WebView)
 */

// 1. AbortController Polyfill
if (typeof AbortController === 'undefined') {
  console.log("[Polyfill] AbortController not found, applying polyfill...");
  
  class AbortSignal {
    aborted = false;
    _listeners: any[] = [];
    
    addEventListener(name: string, listener: any) {
      if (name === 'abort') this._listeners.push(listener);
    }
    
    removeEventListener(name: string, listener: any) {
      if (name === 'abort') {
        this._listeners = this._listeners.filter(l => l !== listener);
      }
    }

    dispatchEvent(event: any) {
       if (event.type === 'abort') {
         this._listeners.forEach(l => {
           if (typeof l === 'function') l(event);
           else if (l && typeof l.handleEvent === 'function') l.handleEvent(event);
         });
       }
       return true;
    }
  }

  class AbortController {
    signal = new AbortSignal();
    abort() {
      if (this.signal.aborted) return;
      this.signal.aborted = true;
      const event = { type: 'abort', target: this.signal };
      this.signal.dispatchEvent(event);
      
      // Also trigger onabort property if set
      const signalAny = this.signal as any;
      if (typeof signalAny.onabort === 'function') {
        signalAny.onabort(event);
      }
    }
  }

  (global as any).AbortController = AbortController;
  (global as any).AbortSignal = AbortSignal;
}

// 2. crypto.randomUUID Polyfill
if (typeof crypto === 'undefined') {
  (global as any).crypto = {};
}

if (!(global as any).crypto.randomUUID) {
  console.log("[Polyfill] crypto.randomUUID not found, applying fallback...");
  (global as any).crypto.randomUUID = function() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };
}

// 3. Ensure global headers and fetch are robust (optional, but good for older environments)
// Some versions of Android WebView have issues with Headers constructor
if (typeof Headers !== 'undefined') {
    const OriginalHeaders = Headers;
    (global as any).Headers = function(init?: any) {
        try {
            return new OriginalHeaders(init);
        } catch (e) {
            console.warn("[Polyfill] Headers constructor failed, using fallback...");
            const headers = new OriginalHeaders();
            if (init && typeof init === 'object') {
                for (const key in init) {
                    headers.set(key, init[key]);
                }
            }
            return headers;
        }
    };
}
