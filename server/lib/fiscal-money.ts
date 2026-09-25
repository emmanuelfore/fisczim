/* Exact-decimal money math (BigInt/string based) for fiscal payloads.
 *
 * Binary floats corrupt cent rounding — e.g. 571.5*0.09 === 51.434999999999995
 * rounds to 51.43 while the gateway's arithmetical rounding of the exact
 * product 51.435 yields 51.44 — tripping RCPT024 ("line total is not equal to
 * unit price * quantity"). Gateway-facing totals must therefore be derived
 * from the SENT price/quantity via these helpers, never via float math.
 * Results are identical to float math except in float-artifact cases. */

function decimalParts(v: number | string): { digits: bigint; scale: number } {
    let s = String(v ?? "0").trim();
    let neg = false;
    if (s.startsWith("-")) { neg = true; s = s.slice(1); }
    if (/[eE]/.test(s)) {
        s = Number(s).toFixed(20).replace(/0+$/, "").replace(/\.$/, "");
        if (s.startsWith("-")) { neg = true; s = s.slice(1); }
    }
    const dot = s.indexOf(".");
    const scale = dot < 0 ? 0 : s.length - dot - 1;
    const raw = ((dot < 0 ? s : s.slice(0, dot) + s.slice(dot + 1)).replace(/^0+(?=\d)/, "") || "0");
    return { digits: (neg ? BigInt(-1) : BigInt(1)) * BigInt(raw), scale };
}

/** Round an exact decimal value (digits / 10^scale) half-away-from-zero to `dp` places. */
function roundExactDigits(digits: bigint, scale: number, dp: number): number {
    const shift = scale - dp;
    if (shift <= 0) return Number(digits) / 10 ** scale;
    const div = BigInt(10) ** BigInt(shift);
    const q = digits / div; // BigInt division truncates toward zero
    const rem = digits % div;
    const absRem = rem < BigInt(0) ? -rem : rem;
    const bump = absRem * BigInt(2) >= div ? (digits < BigInt(0) ? BigInt(-1) : BigInt(1)) : BigInt(0);
    return Number(q + bump) / 10 ** dp;
}

/** Exact round-half-up to 2dp. */
export function exactRound2(v: number | string): number {
    const x = decimalParts(v);
    return roundExactDigits(x.digits, x.scale, 2);
}

/** Exact round-half-up to 6dp (spec precision cap for price/quantity). */
export function exactRound6(v: number | string): number {
    const x = decimalParts(v);
    return roundExactDigits(x.digits, x.scale, 6);
}

/** Exact (a*b) rounded half-up to 2dp. */
export function exactMul2(a: number | string, b: number | string): number {
    const x = decimalParts(a);
    const y = decimalParts(b);
    return roundExactDigits(x.digits * y.digits, x.scale + y.scale, 2);
}

/** Exact (a+b) rounded half-up to 2dp. */
export function exactAdd2(a: number | string, b: number | string): number {
    const x = decimalParts(a);
    const y = decimalParts(b);
    const s = Math.max(x.scale, y.scale);
    const sum = x.digits * BigInt(10) ** BigInt(s - x.scale) + y.digits * BigInt(10) ** BigInt(s - y.scale);
    return roundExactDigits(sum, s, 2);
}

/** Exact (a-b) rounded half-up to 2dp. */
export function exactSub2(a: number | string, b: number | string): number {
    const x = decimalParts(a);
    const y = decimalParts(b);
    const s = Math.max(x.scale, y.scale);
    const diff = x.digits * BigInt(10) ** BigInt(s - x.scale) - y.digits * BigInt(10) ** BigInt(s - y.scale);
    return roundExactDigits(diff, s, 2);
}

/** Exact (a/b) rounded half-up to 2dp. */
export function exactDiv2(a: number | string, b: number | string): number {
    const x = decimalParts(a);
    const y = decimalParts(b);
    if (y.digits === BigInt(0)) return 0;
    // a/b to 2dp == round((a*100)/b)
    const num = x.digits * BigInt(10) ** BigInt(Math.max(0, y.scale - x.scale) + 2);
    const den = y.digits * BigInt(10) ** BigInt(Math.max(0, x.scale - y.scale));
    const neg = (num < BigInt(0)) !== (den < BigInt(0));
    const an = num < BigInt(0) ? -num : num;
    const ad = den < BigInt(0) ? -den : den;
    const q = an / ad;
    const r = an % ad;
    const bumped = r * BigInt(2) >= ad ? q + BigInt(1) : q;
    return Number(neg ? -bumped : bumped) / 100;
}
