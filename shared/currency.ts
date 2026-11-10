// Currency codes, signs and the list of currencies a company starts with.
// Lives in shared/ because the web app, the PDF renderer and the server all have
// to print the same amount the same way.

const CURRENCY_SIGNS: Record<string, string> = {
  USD: "$",
  LSL: "M",
  ZAR: "R",
  // ZiG has no sign of its own; the code is what circulates.
  ZWG: "ZWG",
  ZIG: "ZWG",
  ZWL: "ZWG",
  RTGS: "ZWG",
};

// Intl renders these as the ISO code ("LSL 12.00"). A Loti receipt and ledger read
// "M12.00", so amounts in these codes are formatted from the table instead.
const SIGNED_CURRENCIES = new Set(["LSL"]);

// Every code the app has a sign for, i.e. the currencies a document may be billed in.
const KNOWN_CURRENCIES = new Set(Object.keys(CURRENCY_SIGNS));

/** ZiG circulated as ZWL and RTGS too; all three are booked under one code. */
export function canonicalCurrency(code?: string | null): string {
  const key = normalise(code);
  return CURRENCY_SIGNS[key] === "ZWG" ? "ZWG" : key;
}

/** Whether the app knows this code at all — an unknown one must not reach a gateway. */
export function isSupportedCurrency(code?: string | null): boolean {
  return KNOWN_CURRENCIES.has(normalise(code));
}

/** The columns this module reads off a company row. */
export interface CurrencyOwningCompany {
  currency?: string | null;
  country?: string | null;
  fiscalProvider?: string | null;
}

export interface CurrencySeed {
  code: string;
  name: string;
  symbol: string;
  exchangeRate: string;
  isBase: boolean;
}

const normalise = (value?: string | null) => String(value || "").trim().toUpperCase();

/** RSL issues every fiscal document in loti, so a Lesotho tenant has no other base. */
export function isLotiCompany(company?: CurrencyOwningCompany | null): boolean {
  if (!company) return false;
  const provider = normalise(company.fiscalProvider);
  if (provider === "LEKUKA" || provider === "LEKAKU") return true;
  return String(company.country || "").trim().toLowerCase() === "lesotho"
    || normalise(company.currency) === "LSL";
}

/**
 * Whether the account is fiscalised by the Lesotho gateway. Unlike isLotiCompany this
 * ignores the currency column: loti is RSL money, so no tenant authorises it by holding
 * a loti currency row — only its country or fiscal provider does.
 */
export function isLotiFiscalAccount(company?: CurrencyOwningCompany | null): boolean {
  if (!company) return false;
  const provider = normalise(company.fiscalProvider);
  if (provider === "LEKUKA" || provider === "LEKAKU") return true;
  return String(company.country || "").trim().toLowerCase() === "lesotho";
}

/** The currency a company books in. Defaults to USD for every existing tenant. */
export function baseCurrencyOf(company?: CurrencyOwningCompany | null): string {
  if (isLotiCompany(company)) return "LSL";
  return normalise(company?.currency) || "USD";
}

/** Sign to prefix an amount with. Unknown codes fall back to the ISO code. */
export function currencySign(code?: string | null): string {
  const key = normalise(code);
  if (!key) return "$";
  return CURRENCY_SIGNS[key] ?? key;
}

/**
 * The currency a payroll figure is printed in. A SPLIT run pays in USD and ZiG at
 * once but keeps every column in its USD base, so its amounts are dollars; an
 * unheaded run falls back to USD, the schema default.
 */
export function displayCurrency(code?: string | null): string {
  const key = normalise(code);
  return !key || key === "SPLIT" ? "USD" : key;
}

/**
 * Prefix for screens that print the ISO code beside the amount ("USD 12.00").
 * Loti is the exception — the market writes "M12.00" — so every other code, known
 * or not, keeps its letters. An empty code stays empty rather than inventing USD.
 */
export function currencyLabel(code?: string | null): string {
  const key = normalise(code);
  return SIGNED_CURRENCIES.has(key) ? currencySign(key) : key;
}

/**
 * Add amounts in integer cents. Payslip screens total dozens of 2-decimal
 * values and a float chain drifts by a cent the user reads as an error.
 */
export function sumMoney(values: Iterable<number | string | null | undefined>): number {
  let cents = 0;
  for (const value of values) {
    const numeric = Number(value ?? 0);
    if (Number.isFinite(numeric)) cents += Math.round(numeric * 100);
  }
  return cents / 100;
}

/** Amount as the app displays it: sign, then a grouped, 2-decimal number. */
export function formatMoney(amount: unknown, code?: string | null): string {
  const value = Number(amount ?? 0);
  const grouped = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
  // "ZWG 12.00" reads better than "ZWG12.00"; a real sign ("M", "$") hugs the number.
  // The code is canonicalised first so ZiG, ZWL and RTGS all print as "ZWG x".
  const key = canonicalCurrency(code);
  const sign = currencySign(key);
  return sign === key ? `${sign} ${grouped}` : `${sign}${grouped}`;
}

/**
 * Formats an amount for a screen that may show several currencies side by side.
 * Only codes Intl renders badly are overridden, so USD/ZWG keep their existing
 * "USD 12.00" shape and only the loti becomes "M12.00".
 */
export function formatCurrencyAmount(amount: number, code?: string | null): string {
  const key = normalise(code) || "USD";
  const value = Number.isFinite(amount) ? amount : 0;
  if (SIGNED_CURRENCIES.has(key)) return formatMoney(value, key);
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: key,
      currencyDisplay: "code",
    }).format(value);
  } catch {
    return formatMoney(value, key);
  }
}

/**
 * Currencies to seed for a company. A Lesotho company starts on loti alone: a second
 * currency needs an exchange rate, and a guessed rate misstates every conversion, so
 * the user adds and prices other currencies in Currency Settings.
 */
export function defaultCurrencySeeds(company?: CurrencyOwningCompany | null): CurrencySeed[] {
  if (isLotiCompany(company)) {
    return [{ code: "LSL", name: "Lesotho Loti", symbol: "M", exchangeRate: "1.000000", isBase: true }];
  }
  return [
    { code: "USD", name: "US Dollar", symbol: "$", exchangeRate: "1.000000", isBase: true },
    { code: "ZWG", name: "Zimbabwe Gold", symbol: "ZWG", exchangeRate: "13.500000", isBase: false },
  ];
}
