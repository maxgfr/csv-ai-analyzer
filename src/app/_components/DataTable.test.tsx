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
it("keeps the sort on the same column when columns move", () => {
  const data = parseCSV("a,b\nx,3\ny,1\nz,2");
  const view = render(<DataTable data={data} />);
  fireEvent.click(screen.getByRole("button", { name: /^b/ }));
  const firstCell = () =>
    screen.getAllByRole("row")[1]!.querySelectorAll("td")[0]!.textContent;
  expect(firstCell()).toBe("y");
  view.rerender(<DataTable data={parseCSV("b,a\n3,x\n1,y\n2,z")} />);
  expect(firstCell()).toBe("1");
  expect(
    screen.getByRole("columnheader", { name: /^b/ }).getAttribute("aria-sort"),
  ).toBe("ascending");
});
