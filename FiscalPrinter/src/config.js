import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const defaults = {
  apiEndpoint: "https://fiscalstack.co.zw/api/v1/",
  apiKey: "",
  spoolFolder: path.join(root, "spool", "incoming"),
  processedFolder: path.join(root, "spool", "processed"),
  failedFolder: path.join(root, "spool", "failed"),
  outputFolder: path.join(root, "spool", "fiscal-receipts"),
  currency: "USD",
  paymentMethod: "CASH",
  companyName: "FiscalStack",
  /** Local Windows/Linux printer name — empty = fiscalize only (no print) */
  printerName: "",
  /** If true, also save .html for debugging. Normal installs leave this false. */
  saveDebugHtml: false,
  currencies: [
    { keyword: "USD", name: "USD" },
    { keyword: "US$", name: "USD" },
    { keyword: "ZWG", name: "ZWG" },
    { keyword: "ZWL", name: "ZWG" },
  ],
  /** Same markers as Interface App.config / FiscalBridge */
  parse: {
    productStartLine: "Order No.",
    productEndLine: "Items count",
    invoiceNumber: "Order No.",
    customerName: "Buyer Name",
    customerAddress: "Buyer Address",
    customerEmail: "Buyer Email",
    customerTIN: "Buyer TIN",
    customerVATNumber: "Buyer VAT",
    customerTelephoneNumber: "Buyer Phone",
    invoiceComment: "Original:",
    multiLineProduct: false,
    itemDotCounter: 2,
    columnQuantityIndex: 0,
    columnPriceIndex: 2,
    columnAmountIndex: 3,
    vatFlag: "1",
    vatA: "0.155",
    vatE: "0.00",
    taxSymbol: "",
    nonTaxSymbol: "",
  },
};

export function loadConfig(configPath = path.join(root, "config.json")) {
  let file = {};
  if (fs.existsSync(configPath)) {
    file = JSON.parse(fs.readFileSync(configPath, "utf8"));
  }

  const config = {
    ...defaults,
    ...file,
    parse: { ...defaults.parse, ...(file.parse || {}) },
    currencies: file.currencies || defaults.currencies,
  };

  if (!config.apiEndpoint.endsWith("/")) {
    config.apiEndpoint += "/";
  }

  for (const key of ["spoolFolder", "processedFolder", "failedFolder", "outputFolder"]) {
    config[key] = path.isAbsolute(config[key])
      ? config[key]
      : path.resolve(root, config[key]);
    fs.mkdirSync(config[key], { recursive: true });
  }

  return config;
}

export function saveConfig(config, configPath = path.join(root, "config.json")) {
  const toSave = { ...config };
  fs.writeFileSync(configPath, JSON.stringify(toSave, null, 2), "utf8");
}

export { root as projectRoot };
