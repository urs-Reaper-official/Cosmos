import { tool } from "ai";
import { z } from "zod";

const tokenPattern = /\s*(\*\*|[()+\-*/%]|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)/y;
const MAX_EXPRESSION_LENGTH = 256;
const MAX_TOKENS = 64;
const MAX_RESULT_MAGNITUDE = 1e100;

export function evaluateArithmetic(expression: string): number {
  if (!expression.trim() || expression.length > MAX_EXPRESSION_LENGTH) {
    throw new Error("Enter a non-empty arithmetic expression of at most 256 characters.");
  }

  const tokens: string[] = [];
  let offset = 0;
  while (offset < expression.length) {
    tokenPattern.lastIndex = offset;
    const match = tokenPattern.exec(expression);
    if (!match) {
      if (/^\s*$/.test(expression.slice(offset))) break;
      throw new Error("Only numbers and basic arithmetic operators are allowed.");
    }
    tokens.push(match[1]);
    if (tokens.length > MAX_TOKENS) throw new Error("The expression is too complex.");
    offset = tokenPattern.lastIndex;
  }

  let position = 0;
  const peek = () => tokens[position];
  const consume = (expected?: string) => {
    const token = tokens[position];
    if (token === undefined || (expected && token !== expected)) {
      throw new Error("The arithmetic expression is incomplete or invalid.");
    }
    position += 1;
    return token;
  };
  const checked = (value: number) => {
    if (!Number.isFinite(value) || Math.abs(value) > MAX_RESULT_MAGNITUDE) {
      throw new Error("The result is too large or not finite.");
    }
    return value;
  };

  function parsePrimary(): number {
    if (peek() === "(") {
      consume("(");
      const value = parseExpression();
      consume(")");
      return value;
    }
    const token = consume();
    if (!/^\d|^\./.test(token)) {
      throw new Error("The arithmetic expression is incomplete or invalid.");
    }
    return checked(Number(token));
  }

  function parsePower(): number {
    const base = parsePrimary();
    if (peek() !== "**") return base;
    consume("**");
    const exponent = parseUnary();
    if (Math.abs(exponent) > 64) throw new Error("Exponent magnitude must be at most 64.");
    return checked(base ** exponent);
  }

  function parseUnary(): number {
    if (peek() === "+") {
      consume("+");
      return parseUnary();
    }
    if (peek() === "-") {
      consume("-");
      return checked(-parseUnary());
    }
    return parsePower();
  }

  function parseTerm(): number {
    let value = parseUnary();
    while (peek() === "*" || peek() === "/" || peek() === "%") {
      const operator = consume();
      const right = parseUnary();
      value = checked(
        operator === "*" ? value * right : operator === "/" ? value / right : value % right,
      );
    }
    return value;
  }

  function parseExpression(): number {
    let value = parseTerm();
    while (peek() === "+" || peek() === "-") {
      const operator = consume();
      const right = parseTerm();
      value = checked(operator === "+" ? value + right : value - right);
    }
    return value;
  }

  const result = parseExpression();
  if (position !== tokens.length) throw new Error("The arithmetic expression is invalid.");
  return result;
}

export const calculatorTool = tool({
  description: "Calculate a basic arithmetic expression. This tool has no side effects.",
  inputSchema: z.object({
    expression: z.string().trim().min(1).max(MAX_EXPRESSION_LENGTH),
  }),
  execute: ({ expression }) => String(evaluateArithmetic(expression)),
});
