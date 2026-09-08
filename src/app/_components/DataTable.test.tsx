// @vitest-environment jsdom
import { it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { DataTable } from "./DataTable";
import { parseCSV } from "~/lib/csv-parser";
afterEach(cleanup);
it("searches rows beyond the first page and handles empty results", () => {
  const data = parseCSV(
    "name,n\n" +
      Array.from({ length: 30 }, (_, i) => `row${i},${i}`).join("\n"),
  );
  render(<DataTable data={data} />);
  fireEvent.change(screen.getByLabelText("Search visible columns"), {
    target: { value: "row29" },
  });
  expect(screen.getByText("row29")).toBeTruthy();
  expect(screen.queryByText("row0")).toBeNull();
  fireEvent.change(screen.getByLabelText("Search visible columns"), {
    target: { value: "missing" },
  });
  expect(screen.getByText("No matching rows")).toBeTruthy();
  expect(screen.getByText("0-0 of 0")).toBeTruthy();
});
it("clamps pagination after the dataset shrinks", () => {
  const large = parseCSV(
    "name\n" + Array.from({ length: 30 }, (_, i) => `row${i}`).join("\n"),
  );
  const view = render(<DataTable data={large} />);
  fireEvent.click(screen.getByLabelText("Next page"));
  view.rerender(<DataTable data={parseCSV("name\nonly")} />);
  expect(screen.getByText("only")).toBeTruthy();
});
