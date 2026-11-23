import { describe, expect, test } from "vitest";
import {
  isValidStaffNumber,
  nextStaffNumber,
  normalizeStaffNumber,
} from "../../shared/staff-file";

describe("staff numbers", () => {
  test("normalises for comparisons and ZIMRA-facing output", () => {
    expect(normalizeStaffNumber("  emp001 ")).toBe("EMP001");
    expect(normalizeStaffNumber("   ")).toBeNull();
  });

  test("accepts the shared 2-30 character format only", () => {
    expect(isValidStaffNumber("EMP001")).toBe(true);
    expect(isValidStaffNumber("A1-B/C")).toBe(true);
    expect(isValidStaffNumber("E")).toBe(false);
    expect(isValidStaffNumber("EMP_001")).toBe(false);
    expect(isValidStaffNumber("A".repeat(31))).toBe(false);
  });

  test("generated numbers stay valid even with legacy prefixes", () => {
    expect(nextStaffNumber("fs", 4, 7)).toBe("FS0007");
    expect(nextStaffNumber("EMP_", 4, 12)).toBe("EMP0012");
    expect(nextStaffNumber("", 1, 1)).toBe("01");
    for (const prefix of ["", "FS", "A-B/C"]) {
      expect(isValidStaffNumber(nextStaffNumber(prefix, 4, 7))).toBe(true);
    }
  });
});
