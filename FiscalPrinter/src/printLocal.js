/**
 * Local silent print helpers.
 *
 * HTML here is ONLY a receipt layout sent to the OS printer driver —
 * the installed app never asks the user to open an .html file.
 *
 * - Electron path: hidden BrowserWindow + webContents.print (Windows/Linux)
 * - CLI fallback: write optional debug HTML + open/print via OS when possible
 */

import fs from "fs";
import path from "path";
import { spawn } from "child_process";

export async function printHtmlElectron(html, printerName) {
  // Dynamic import so CLI mode works without Electron installed as runtime
  const electron = await import("electron");
  const { BrowserWindow } = electron;

  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      show: false,
      webPreferences: { offscreen: true },
    });

    const finish = (err) => {
      if (!win.isDestroyed()) win.destroy();
      if (err) reject(err);
      else resolve();
    };

    win.webContents.on("did-fail-load", (_e, code, desc) => {
      finish(new Error(`Print window failed to load (${code}): ${desc}`));
    });

    win.webContents.on("did-finish-load", () => {
      win.webContents.print(
        {
          silent: true,
          printBackground: true,
          deviceName: printerName || undefined,
        },
        (success, failureReason) => {
          if (!success) finish(new Error(failureReason || "Print cancelled/failed"));
          else finish();
        }
      );
    });

    win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  });
}

/** Optional debug artifact — not the user-facing product. */
export function maybeSaveDebugHtml(html, outputFolder, baseName, enabled) {
  if (!enabled) return null;
  fs.mkdirSync(outputFolder, { recursive: true });
  const htmlPath = path.join(outputFolder, `${baseName}.html`);
  fs.writeFileSync(htmlPath, html, "utf8");
  return htmlPath;
}

export function saveFiscalJson(fiscal, outputFolder, baseName) {
  fs.mkdirSync(outputFolder, { recursive: true });
  const jsonPath = path.join(outputFolder, `${baseName}.fiscal.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(fiscal, null, 2), "utf8");
  return jsonPath;
}

/**
 * CLI / Linux-without-Electron: try CUPS `lp` if printerName set, else xdg-open for preview.
 */
export function printHtmlCli(htmlPath, printerName) {
  return new Promise((resolve, reject) => {
    if (printerName && process.platform !== "win32") {
      const child = spawn("lp", ["-d", printerName, htmlPath], { stdio: "ignore" });
      child.on("error", reject);
      child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`lp exited ${code}`))));
      return;
    }

    const opener =
      process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
    const args = process.platform === "win32" ? ["/c", "start", "", htmlPath] : [htmlPath];
    const child = spawn(opener, args, { detached: true, stdio: "ignore" });
    child.on("error", reject);
    child.unref();
    resolve();
  });
}
