import { describe, it, expect } from "vitest";
import { parseCSV } from "./csv-parser";

describe("parseCSV", () => {
  describe("basic parsing", () => {
    it("parses simple CSV with comma delimiter", () => {
      const data = parseCSV("name,age,city\nAlice,30,Paris\nBob,25,London");
      expect(data.headers).toEqual(["name", "age", "city"]);
      expect(data.rowCount).toBe(2);
      expect(data.rows).toEqual([
        ["Alice", "30", "Paris"],
        ["Bob", "25", "London"],
      ]);
    });

    it("returns empty TabularData for empty input", () => {
      const data = parseCSV("");
      expect(data.headers).toEqual([]);
      expect(data.rows).toEqual([]);
      expect(data.columns).toEqual([]);
      expect(data.rowCount).toBe(0);
    });

    it("returns empty TabularData for whitespace-only input", () => {
      const data = parseCSV("   \n  \n  ");
      expect(data.rowCount).toBe(0);
    });

    it("handles single column CSV", () => {
      const data = parseCSV("name\nAlice\nBob");
      expect(data.headers).toEqual(["name"]);
      expect(data.rowCount).toBe(2);
    });

    it("handles single row CSV (header only)", () => {
      const data = parseCSV("name,age,city");
      expect(data.headers).toEqual(["name", "age", "city"]);
      expect(data.rowCount).toBe(0);
    });

    it("trims header names", () => {
      const data = parseCSV("  name , age , city \nAlice,30,Paris");
      expect(data.headers).toEqual(["name", "age", "city"]);
    });
  });

  describe("delimiter detection", () => {
    it("auto-detects semicolon delimiter", () => {
      const data = parseCSV("name;age;city\nAlice;30;Paris\nBob;25;London");
      expect(data.headers).toEqual(["name", "age", "city"]);
      expect(data.rows[0]).toEqual(["Alice", "30", "Paris"]);
    });

    it("auto-detects tab delimiter", () => {
      const data = parseCSV("name\tage\tcity\nAlice\t30\tParis");
      expect(data.headers).toEqual(["name", "age", "city"]);
      expect(data.rows[0]).toEqual(["Alice", "30", "Paris"]);
    });

    it("auto-detects pipe delimiter", () => {
      const data = parseCSV("name|age|city\nAlice|30|Paris");
      expect(data.headers).toEqual(["name", "age", "city"]);
      expect(data.rows[0]).toEqual(["Alice", "30", "Paris"]);
    });

    it("uses explicit delimiter when provided", () => {
      const data = parseCSV("name;age;city\nAlice;30;Paris", {
        delimiter: ";",
      });
      expect(data.headers).toEqual(["name", "age", "city"]);
    });

    it("prefers consistent delimiter over higher-count one", () => {
      // Semicolons appear consistently (2 per line), commas appear in values
      const data = parseCSV(
        'name;description\nAlice;"likes cats, dogs"\nBob;"likes fish"',
      );
      expect(data.headers).toEqual(["name", "description"]);
    });
  });

  describe("quoted fields", () => {
    it("handles double-quoted fields", () => {
      const data = parseCSV(
        'name,bio\nAlice,"Software engineer"\nBob,Designer',
      );
      expect(data.rows[0]).toEqual(["Alice", "Software engineer"]);
    });

    it("handles fields with commas inside quotes", () => {
      const data = parseCSV('name,city\nAlice,"New York, NY"\nBob,Paris');
      expect(data.rows[0]).toEqual(["Alice", "New York, NY"]);
      expect(data.rows[1]).toEqual(["Bob", "Paris"]);
    });

    it("handles escaped double quotes (RFC 4180)", () => {
      const data = parseCSV('name,quote\nAlice,"She said ""hello"""\nBob,hi');
      expect(data.rows[0]).toEqual(["Alice", 'She said "hello"']);
    });

    it("handles multi-line quoted fields", () => {
      const data = parseCSV('name,bio\nAlice,"Line 1\nLine 2"\nBob,Simple');
      expect(data.rows[0]).toEqual(["Alice", "Line 1\nLine 2"]);
      expect(data.rows[1]).toEqual(["Bob", "Simple"]);
      expect(data.rowCount).toBe(2);
    });

    it("handles empty quoted fields", () => {
      const data = parseCSV('name,value\nAlice,""\nBob,test');
      expect(data.rows[0]).toEqual(["Alice", ""]);
    });

    it("treats a quote in the middle of an unquoted field as literal", () => {
      const data = parseCSV('id,product\n1,55" TV\n2,32" TV');
      expect(data.rowCount).toBe(2);
      expect(data.rows).toEqual([
        ["1", '55" TV'],
        ["2", '32" TV'],
      ]);
    });

    it("detects the delimiter despite mid-field quotes", () => {
      const data = parseCSV('id;size\n1;55" TV\n2;32" TV\n3;40" TV');
      expect(data.headers).toEqual(["id", "size"]);
      expect(data.rows[2]).toEqual(["3", '40" TV']);
    });
  });

  describe("line endings", () => {
    it("handles \\r\\n (Windows) line endings", () => {
      const data = parseCSV("name,age\r\nAlice,30\r\nBob,25");
      expect(data.rowCount).toBe(2);
      expect(data.rows[0]).toEqual(["Alice", "30"]);
    });

    it("handles \\r (old Mac) line endings", () => {
      const data = parseCSV("name,age\rAlice,30\rBob,25");
      expect(data.rowCount).toBe(2);
    });

    it("strips BOM character", () => {
      const data = parseCSV("\uFEFFname,age\nAlice,30");
      expect(data.headers).toEqual(["name", "age"]);
    });
  });

  describe("options", () => {
    it("generates column names when hasHeader is false", () => {
      const data = parseCSV("Alice,30,Paris\nBob,25,London", {
        hasHeader: false,
      });
      expect(data.headers).toEqual(["Column 1", "Column 2", "Column 3"]);
      expect(data.rowCount).toBe(2);
      expect(data.rows[0]).toEqual(["Alice", "30", "Paris"]);
    });

    it("skips empty lines by default", () => {
      const data = parseCSV("name,age\nAlice,30\n\nBob,25\n");
      expect(data.rowCount).toBe(2);
    });

    it("keeps empty lines when skipEmpty is false", () => {
      const data = parseCSV("name,age\nAlice,30\n\n\nBob,25", {
        skipEmpty: false,
      });
      // Includes the empty lines as rows
      expect(data.rowCount).toBeGreaterThan(2);
    });
  });

  describe("row normalization", () => {
    it("pads short rows with empty strings", () => {
      const data = parseCSV("a,b,c\n1,2\n4,5,6");
      expect(data.rows[0]).toEqual(["1", "2", ""]);
      expect(data.rows[1]).toEqual(["4", "5", "6"]);
    });

    it("truncates long rows to match header length", () => {
      const data = parseCSV("a,b\n1,2,3,4\n5,6");
      expect(data.rows[0]).toEqual(["1", "2"]);
      expect(data.rows[1]).toEqual(["5", "6"]);
    });
  });

  describe("type inference", () => {
    it("detects number columns", () => {
      const data = parseCSV("id,value\n1,100.5\n2,200\n3,300.75");
      const valueCol = data.columns.find((c) => c.name === "value");
      expect(valueCol?.type).toBe("number");
    });

    it("detects string columns", () => {
      const data = parseCSV(
        "name,city\nAlice,Paris\nBob,London\nCharlie,Berlin",
      );
      const nameCol = data.columns.find((c) => c.name === "name");
      expect(nameCol?.type).toBe("string");
    });

    it("detects boolean columns", () => {
      const data = parseCSV(
        "name,active\nAlice,true\nBob,false\nCharlie,true\nDave,false\nEve,true",
      );
      const activeCol = data.columns.find((c) => c.name === "active");
      expect(activeCol?.type).toBe("boolean");
    });

    it("detects date columns (ISO format)", () => {
      const data = parseCSV(
        "event,date\nA,2024-01-15\nB,2024-02-20\nC,2024-03-10\nD,2024-04-01\nE,2024-05-25",
      );
      const dateCol = data.columns.find((c) => c.name === "date");
      expect(dateCol?.type).toBe("date");
    });

    it("detects date columns (US format)", () => {
      const data = parseCSV(
        "event,date\nA,01/15/2024\nB,02/20/2024\nC,03/10/2024\nD,04/01/2024\nE,05/25/2024",
      );
      const dateCol = data.columns.find((c) => c.name === "date");
      expect(dateCol?.type).toBe("date");
    });

    it("detects date columns (EU dot format)", () => {
      const data = parseCSV(
        "event,date\nA,15.01.2024\nB,20.02.2024\nC,10.03.2024\nD,01.04.2024\nE,25.05.2024",
      );
      const dateCol = data.columns.find((c) => c.name === "date");
      expect(dateCol?.type).toBe("date");
    });

    it("falls back to string for mixed types", () => {
      const data = parseCSV("value\n100\nhello\n200\nworld\n300");
      const col = data.columns.find((c) => c.name === "value");
      expect(col?.type).toBe("string");
    });

    it("handles empty column as string", () => {
      const data = parseCSV("name,empty\nAlice,\nBob,\nCharlie,");
      const emptyCol = data.columns.find((c) => c.name === "empty");
      expect(emptyCol?.type).toBe("string");
    });

    it("handles numbers with commas (e.g. 1,234)", () => {
      // When delimiter is semicolon, commas can be in numbers
      const data = parseCSV(
        'value\n"1,234"\n"2,500"\n"3,100"\n"4,800"\n"5,000"',
      );
      const col = data.columns.find((c) => c.name === "value");
      expect(col?.type).toBe("number");
    });

    it("recognizes French boolean values", () => {
      const data = parseCSV("flag\nvrai\nfaux\nvrai\nfaux\nvrai");
      const col = data.columns.find((c) => c.name === "flag");
      expect(col?.type).toBe("boolean");
    });

    it("assigns correct column indices", () => {
      const data = parseCSV("a,b,c\n1,2,3");
      expect(data.columns[0]?.index).toBe(0);
      expect(data.columns[1]?.index).toBe(1);
      expect(data.columns[2]?.index).toBe(2);
    });
  });
});
