import { expect, it } from "vitest";
import { escapeCSVField, toCSV } from "./download";

it("neutralises spreadsheet formulas in exported cells", () => {
  expect(escapeCSVField('=HYPERLINK("http://x")')).toBe(
    '"\'=HYPERLINK(""http://x"")"',
  );
  expect(escapeCSVField("+cmd")).toBe(`"'+cmd"`);
  expect(escapeCSVField("@SUM(A1)")).toBe(`"'@SUM(A1)"`);
  expect(escapeCSVField("-2+3")).toBe(`"'-2+3"`);
});

it("keeps numbers and plain text unchanged", () => {
  expect(escapeCSVField("-5")).toBe('"-5"');
  expect(escapeCSVField("+1.5e3")).toBe('"+1.5e3"');
  expect(escapeCSVField("hello, world")).toBe('"hello, world"');
  expect(toCSV(["a", "b"], [["1", "=x"]])).toBe('"a","b"\n"1","\'=x"');
});

it("leaves negative numbers in every local format untouched", () => {
  for (const value of ["-1,234.56", "-1.234,56", "-5%", "-", "+3 000", "-1e-3"])
    expect(escapeCSVField(value)).toBe(`"${value}"`);
  expect(escapeCSVField("-1+cmd|' /C calc'!A0")).toMatch(/^"'/);
});
