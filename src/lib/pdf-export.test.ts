import { describe, expect, it } from "vitest";
import {
  chatEntriesForPDF,
  hasUnsupportedCharacters,
  latexToPlainText,
  needsUnicodeFont,
  stripMarkdown,
  toLightColors,
} from "./pdf-export";

describe("stripMarkdown", () => {
  it("keeps dollar amounts as text", () => {
    expect(stripMarkdown("Prices range from $1,200 to $5,000.")).toBe(
      "Prices range from $1,200 to $5,000.",
    );
    expect(stripMarkdown("It costs $5 and $10")).toBe("It costs $5 and $10");
  });

  it("converts inline and display math", () => {
    expect(stripMarkdown("Mean: $\\bar{x} = \\frac{a}{b}$")).toBe(
      "Mean: x_mean = (a / b)",
    );
    expect(stripMarkdown("$$\\sum x_i$$")).toBe("Sum x_i");
    expect(stripMarkdown("\\(x \\leq 3\\)")).toBe("x <= 3");
  });

  it("removes markdown formatting and escaped dollars", () => {
    expect(stripMarkdown("## Title\n**bold** and `code` \\$3")).toBe(
      "Title\nbold and code $3",
    );
  });
});

describe("latexToPlainText", () => {
  it("replaces whole commands, longest names included", () => {
    expect(latexToPlainText("a \\cdots b")).toBe("a ... b");
    expect(latexToPlainText("x \\in [0, \\infty)")).toBe("x in [0, Inf)");
    expect(latexToPlainText("a \\cdot b")).toBe("a * b");
    expect(latexToPlainText("\\int_0^1 f")).toBe("Integral_0^1 f");
  });
});

describe("PDF fonts", () => {
  it("uses the standard fonts for Western European text", () => {
    expect(needsUnicodeFont("Café – “déjà vu” €5 Œuvre")).toBe(false);
  });

  it("needs Noto Sans for Central European, Greek and Cyrillic text", () => {
    expect(needsUnicodeFont("Łódź")).toBe(true);
    expect(needsUnicodeFont("Αθήνα")).toBe(true);
    expect(needsUnicodeFont("Москва")).toBe(true);
    expect(hasUnsupportedCharacters("Łódź Αθήνα Москва")).toBe(false);
  });

  it("flags characters no PDF font can draw", () => {
    expect(hasUnsupportedCharacters("東京")).toBe(true);
    expect(hasUnsupportedCharacters("ok 👍")).toBe(true);
  });
});

describe("chart capture colors", () => {
  it("swaps dark theme colors for light ones", () => {
    const svg =
      '<text fill="#9ca3af">x</text><line stroke="#374151"/><rect fill="#8b5cf6" style="fill: #ffffff;"/>';
    expect(toLightColors(svg)).toBe(
      '<text fill="#64748b">x</text><line stroke="#e2e8f0"/><rect fill="#7c3aed" style="fill: #0f172a;"/>',
    );
  });
});

describe("chat history in the PDF", () => {
  it("leaves out failed answers", () => {
    expect(
      chatEntriesForPDF([
        { prompt: "a", response: "fine" },
        { prompt: "b", response: "[ERROR] Rate limit" },
        { prompt: "c", response: "partial", cancelled: true },
      ]).map((m) => m.prompt),
    ).toEqual(["a", "c"]);
  });
});
