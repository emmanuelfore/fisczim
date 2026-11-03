import { describe, expect, test } from "vitest";
import {
  baseCurrencyOf,
  canonicalCurrency,
  currencyLabel,
  currencySign,
  defaultCurrencySeeds,
  formatCurrencyAmount,
  formatMoney,
  isLotiCompany,
  isLotiFiscalAccount,
  isSupportedCurrency,
} from "../../../shared/currency";

describe("isLotiCompany", () => {
  test("recognises a Lesotho tenant from any of its three columns", () => {
    expect(isLotiCompany({ country: "Lesotho" })).toBe(true);
    expect(isLotiCompany({ fiscalProvider: "LEKUKA" })).toBe(true);
    expect(isLotiCompany({ fiscalProvider: "lekaku" })).toBe(true);
    expect(isLotiCompany({ currency: "lsl" })).toBe(true);
    expect(isLotiCompany({ country: "Zimbabwe", fiscalProvider: "ZIMRA", currency: "USD" })).toBe(false);
    expect(isLotiCompany()).toBe(false);
  });

  test("a RSL tenant books in loti even while its currency column is still the USD default", () => {
    expect(baseCurrencyOf({ country: "Lesotho", currency: "USD" })).toBe("LSL");
    expect(baseCurrencyOf({ currency: "ZWG" })).toBe("ZWG");
    expect(baseCurrencyOf({})).toBe("USD");
  });
});

describe("isLotiFiscalAccount", () => {
  test("the gateway identity decides loti, never the currency column", () => {
    expect(isLotiFiscalAccount({ fiscalProvider: "LEKUKA" })).toBe(true);
    expect(isLotiFiscalAccount({ fiscalProvider: "lekaku" })).toBe(true);
    expect(isLotiFiscalAccount({ country: "Lesotho" })).toBe(true);
    // A ZIMRA tenant holding loti in its currency column is still not an RSL account.
    expect(isLotiFiscalAccount({ country: "Zimbabwe", fiscalProvider: "ZIMRA", currency: "LSL" })).toBe(false);
    expect(isLotiFiscalAccount({ currency: "LSL" })).toBe(false);
    expect(isLotiFiscalAccount()).toBe(false);
  });
});

describe("currencySign", () => {
  test("the loti is written M and an unknown code keeps its ISO label", () => {
    expect(currencySign("LSL")).toBe("M");
    expect(currencySign("lsl")).toBe("M");
    expect(currencySign("USD")).toBe("$");
    expect(currencySign("ZWL")).toBe("ZWG");
    expect(currencySign("EUR")).toBe("EUR");
    expect(currencySign(null)).toBe("$");
  });

  test("formatMoney groups and always shows two decimals", () => {
    expect(formatMoney(1234.5, "LSL")).toBe("M1,234.50");
    expect(formatMoney("9", "LSL")).toBe("M9.00");
    expect(formatMoney(null, "USD")).toBe("$0.00");
    expect(formatMoney(12, "ZWG")).toBe("ZWG 12.00");
  });

  test("currencyLabel keeps the ISO code where a screen prints code + amount", () => {
    expect(currencyLabel("LSL")).toBe("M");
    expect(currencyLabel("USD")).toBe("USD");
    expect(currencyLabel("ZWG")).toBe("ZWG");
    expect(currencyLabel(undefined)).toBe("");
  });
});

describe("formatCurrencyAmount", () => {
  test("keeps the existing code-prefixed shape for USD and ZiG", () => {
    // Intl separates the code with a non-breaking space, as it always has here.
    expect(formatCurrencyAmount(1234.5, "USD")).toBe("USD\u00A01,234.50");
    expect(formatCurrencyAmount(1234.5, "ZWG")).toBe("ZWG\u00A01,234.50");
    expect(formatCurrencyAmount(12)).toBe("USD\u00A012.00");
  });

  test("switches to the sign for the loti", () => {
    expect(formatCurrencyAmount(1234.5, "LSL")).toBe("M1,234.50");
    expect(formatCurrencyAmount(0, "lsl")).toBe("M0.00");
  });

  test("an amount that Intl cannot format falls back to the sign rather than throwing", () => {
    expect(formatCurrencyAmount(12, "NOT-A-CODE")).toBe("NOT-A-CODE 12.00");
  });
});

describe("defaultCurrencySeeds", () => {
  test("a Lesotho tenant seeds loti alone, as the base", () => {
    expect(defaultCurrencySeeds({ country: "Lesotho", fiscalProvider: "LEKUKA", currency: "LSL" })).toEqual([
      { code: "LSL", name: "Lesotho Loti", symbol: "M", exchangeRate: "1.000000", isBase: true },
    ]);
  });

  test("a Zimbabwe tenant keeps the USD base with ZiG alongside", () => {
    const seeds = defaultCurrencySeeds({ country: "Zimbabwe", currency: "USD" });
    expect(seeds.map((seed) => [seed.code, seed.isBase])).toEqual([["USD", true], ["ZWG", false]]);
    expect(seeds.find((seed) => seed.code === "ZWG")?.symbol).toBe("ZWG");
  });
});

describe("canonicalCurrency and isSupportedCurrency", () => {
  test("the ZiG aliases collapse onto the one code the app books", () => {
    expect(canonicalCurrency("zwl")).toBe("ZWG");
    expect(canonicalCurrency(" RTGS ")).toBe("ZWG");
    expect(canonicalCurrency("LSL")).toBe("LSL");
    expect(canonicalCurrency(null)).toBe("");
  });

  test("only codes the app can print are billable", () => {
    expect(isSupportedCurrency("LSL")).toBe(true);
    expect(isSupportedCurrency("usd")).toBe(true);
    expect(isSupportedCurrency("EUR")).toBe(false);
    expect(isSupportedCurrency("")).toBe(false);
    // A code that collides with an Object member must not read as a currency.
    expect(isSupportedCurrency("constructor")).toBe(false);
  });
});
