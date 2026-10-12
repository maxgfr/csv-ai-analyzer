import { describe, it, expect } from "vitest";
import {
  decodeText,
  inferColumnType,
  parseCSV,
  parseCSVWithDiagnostics,
} from "./csv-parser";

describe("parseCSV", () => {
  it("parses basic CSV with headers", () => {
    const data = parseCSV("name,age,city\nAlice,30,Paris\nBob,25,London");
    expect(data.headers).toEqual(["name", "age", "city"]);
    expect(data.rowCount).toBe(2);
    expect(data.rows[0]).toEqual(["Alice", "30", "Paris"]);
  });

  it("auto-detects semicolon delimiter", () => {
    const data = parseCSV("a;b;c\n1;2;3");
    expect(data.headers).toEqual(["a", "b", "c"]);
    expect(data.rows[0]).toEqual(["1", "2", "3"]);
  });

  it("auto-detects tab delimiter", () => {
    const data = parseCSV("a\tb\tc\n1\t2\t3");
    expect(data.headers).toEqual(["a", "b", "c"]);
    expect(data.rows[0]).toEqual(["1", "2", "3"]);
  });

  it("uses explicit delimiter from settings", () => {
    const data = parseCSV("a|b|c\n1|2|3", {
      delimiter: "|",
      hasHeader: true,
      encoding: "UTF-8",
      skipEmptyLines: true,
    });
    expect(data.headers).toEqual(["a", "b", "c"]);
  });

  it("handles no-header mode", () => {
    const data = parseCSV("1,2,3\n4,5,6", {
      delimiter: "",
      hasHeader: false,
      encoding: "UTF-8",
      skipEmptyLines: true,
    });
    expect(data.headers).toEqual(["Column 1", "Column 2", "Column 3"]);
    expect(data.rowCount).toBe(2);
  });

  it("returns empty data for empty input", () => {
    const data = parseCSV("");
    expect(data.headers).toEqual([]);
    expect(data.rowCount).toBe(0);
  });

  it("handles quoted fields with commas", () => {
    const data = parseCSV(
      'name,desc\n"Alice","Has a, comma"\n"Bob","No comma"',
    );
    expect(data.rows[0]![1]).toBe("Has a, comma");
  });

  it("infers column types", () => {
    const data = parseCSV(
      "num,text,date\n42,hello,2024-01-01\n100,world,2024-02-15",
    );
    const types = data.columns.map((c) => c.type);
    expect(types).toEqual(["number", "string", "date"]);
  });

  it("generates column names for empty headers", () => {
    const data = parseCSV(",b,\n1,2,3");
    expect(data.headers).toEqual(["Column 1", "b", "Column 3"]);
  });
});

describe("inferColumnType", () => {
  it("detects numbers", () => {
    expect(inferColumnType(["1", "2.5", "100", "3.14"])).toBe("number");
  });

  it("detects strings", () => {
    expect(inferColumnType(["hello", "world"])).toBe("string");
  });

  it("detects dates", () => {
    expect(inferColumnType(["2024-01-01", "2024-12-31"])).toBe("date");
  });

  it("detects booleans", () => {
    expect(inferColumnType(["true", "false", "yes", "no"])).toBe("boolean");
  });

  it("returns string for empty values", () => {
    expect(inferColumnType(["", "", ""])).toBe("string");
  });

  it("returns string for mixed types", () => {
    expect(inferColumnType(["1", "hello", "3"])).toBe("string");
  });
});

describe("import diagnostics", () => {
  const keepEmpty = {
    delimiter: "",
    hasHeader: true,
    encoding: "UTF-8",
    skipEmptyLines: false,
  };

  it("does not turn the final newline into a row or a width warning", () => {
    const { data, warnings } = parseCSVWithDiagnostics(
      "a,b\n1,2\n3,4\n",
      keepEmpty,
    );
    expect(data.rowCount).toBe(2);
    expect(warnings).toEqual([]);
    const crlf = parseCSVWithDiagnostics("a,b\r\n1,2\r\n", keepEmpty);
    expect(crlf.data.rowCount).toBe(1);
  });

  it("keeps empty rows in the middle when asked", () => {
    const { data } = parseCSVWithDiagnostics("a\n1\n\n2\n", keepEmpty);
    expect(data.rows).toEqual([["1"], [""], ["2"]]);
  });

  it("reports recovered stray quotes as a warning", () => {
    const { data, warnings } = parseCSVWithDiagnostics(
      'a,b\n"x"y",2\n3,4',
      keepEmpty,
    );
    expect(data.rowCount).toBe(2);
    expect(warnings.join(" ")).toMatch(/Misplaced quotes/);
  });

  it("still rejects an unclosed quote", () => {
    expect(() =>
      parseCSVWithDiagnostics('a,b\n"open,2\n3,4', keepEmpty),
    ).toThrow();
  });

  it("decodes UTF-16 files from their byte order mark", () => {
    const text = "name\nÉlodie";
    const le = new Uint8Array(2 + text.length * 2);
    le.set([0xff, 0xfe]);
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      le[2 + i * 2] = code & 0xff;
      le[3 + i * 2] = code >> 8;
    }
    expect(decodeText(le.buffer, "windows-1252")).toBe(text);
    const be = new Uint8Array(le.length);
    be.set([0xfe, 0xff]);
    for (let i = 2; i < le.length; i += 2) {
      be[i] = le[i + 1]!;
      be[i + 1] = le[i]!;
    }
    expect(decodeText(be.buffer, "UTF-8")).toBe(text);
    expect(decodeText(new TextEncoder().encode("é").buffer, "UTF-8")).toBe("é");
  });
});
