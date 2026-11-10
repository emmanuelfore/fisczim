import { describe, expect, it } from "vitest";
import {
  LESOTHO_JURISDICTION,
  ZIMBABWE_JURISDICTION,
  jurisdictionForCountry,
  jurisdictionLevies,
  missingRequiredRules,
  supportsCurrency,
} from "../../shared/statutory/jurisdictions";

describe("payroll jurisdictions", () => {
  it("maps the free-text country column onto a jurisdiction", () => {
    expect(jurisdictionForCountry("Zimbabwe")).toBe(ZIMBABWE_JURISDICTION);
    expect(jurisdictionForCountry("zw")).toBe(ZIMBABWE_JURISDICTION);
    expect(jurisdictionForCountry("Lesotho")).toBe(LESOTHO_JURISDICTION);
    expect(jurisdictionForCountry(" LS ")).toBe(LESOTHO_JURISDICTION);
    // Unset or unrecognised countries stay on the product's default market.
    expect(jurisdictionForCountry(null)).toBe(ZIMBABWE_JURISDICTION);
    expect(jurisdictionForCountry("Botswana")).toBe(ZIMBABWE_JURISDICTION);
  });

  it("requires the AIDS levy and NSSA only where they are charged", () => {
    expect(missingRequiredRules(ZIMBABWE_JURISDICTION, [])).toEqual(["AIDS_LEVY", "NSSA_POBS"]);
    expect(missingRequiredRules(ZIMBABWE_JURISDICTION, ["AIDS_LEVY", "NSSA_POBS", "PENSION"])).toEqual([]);
    // A Lesotho tenant used to be blocked by a Zimbabwe rule checklist it
    // could never satisfy.
    expect(missingRequiredRules(LESOTHO_JURISDICTION, [])).toEqual([]);
  });

  it("does not treat another country's configured rules as applicable", () => {
    expect(jurisdictionLevies(ZIMBABWE_JURISDICTION, "AIDS_LEVY")).toBe(true);
    expect(jurisdictionLevies(LESOTHO_JURISDICTION, "AIDS_LEVY")).toBe(false);
    expect(jurisdictionLevies(LESOTHO_JURISDICTION, "NSSA_POBS")).toBe(false);
    expect(jurisdictionLevies(LESOTHO_JURISDICTION, "PENSION")).toBe(true);
  });

  it("matches currencies regardless of the casing stored in the row", () => {
    expect(supportsCurrency(ZIMBABWE_JURISDICTION, "ZiG")).toBe(true);
    expect(supportsCurrency(ZIMBABWE_JURISDICTION, "zig")).toBe(true);
    expect(supportsCurrency(ZIMBABWE_JURISDICTION, "SPLIT")).toBe(true);
    expect(supportsCurrency(ZIMBABWE_JURISDICTION, "LSL")).toBe(false);
    expect(supportsCurrency(LESOTHO_JURISDICTION, "LSL")).toBe(true);
    expect(supportsCurrency(LESOTHO_JURISDICTION, "SPLIT")).toBe(false);
  });
});
