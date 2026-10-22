// Copies the built web client (dist/public) into desktop/renderer so the
// Electron package can serve the UI from disk and start fully offline.
//
// Run after a `vite build`:
//   node desktop/scripts/copy-renderer.mjs
import { cpSync, existsSync, rmSync, mkdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(__dirname, "..");
const source = path.resolve(desktopDir, "..", "dist", "public");
const target = path.resolve(desktopDir, "renderer");

if (!existsSync(source)) {
  console.error(`[copy-renderer] Build output not found: ${source}`);
  console.error("[copy-renderer] Run `vite build` first.");
  process.exit(1);
}

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
cpSync(source, target, { recursive: true });

console.log(`[copy-renderer] Copied ${source} -> ${target}`);
