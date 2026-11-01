import { describe, expect, it } from "vitest";
import { evaluateArithmetic } from "@/lib/tools/calculator";

describe("evaluateArithmetic", () => {
  it("evaluates precedence, parentheses, unary operators, and powers", () => {
    expect(evaluateArithmetic("(2 + 3) * 4 / 2")).toBe(10);
    expect(evaluateArithmetic("-2 ** 2")).toBe(-4);
    expect(evaluateArithmetic("2 ** 3 ** 2")).toBe(512);
  });

  it("rejects code, unsupported operators, and malformed expressions", () => {
    for (const expression of ["globalThis.process", "1 < 2", "1 +", "1 / 0"]) {
      expect(() => evaluateArithmetic(expression)).toThrow();
    }
  });

  it("bounds expression size and exponent work", () => {
    expect(() => evaluateArithmetic("1+".repeat(130))).toThrow();
    expect(() => evaluateArithmetic("2 ** 65")).toThrow();
  });
});
