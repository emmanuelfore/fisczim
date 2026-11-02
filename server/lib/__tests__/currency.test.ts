import { describe, expect, test } from "vitest";
import {
  baseCurrencyOf,
  currencyLabel,
  currencySign,
  defaultCurrencySeeds,
  formatCurrencyAmount,
  formatMoney,
  isLotiCompany,
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
