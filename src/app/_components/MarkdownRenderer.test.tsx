// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { MarkdownRenderer, preprocessLaTeX } from "./MarkdownRenderer";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("renders dollar amounts as text, not math", () => {
  const { container } = render(
    <MarkdownRenderer content="Prices range from $1,200 to $5,000." />,
  );
  expect(container.textContent).toContain(
    "Prices range from $1,200 to $5,000.",
  );
  expect(container.querySelector(".katex")).toBeNull();
});

it("still renders LaTeX written with \\( \\) and $$", () => {
  const inline = render(<MarkdownRenderer content="Area: \(x^2\)" />);
  expect(inline.container.querySelector(".katex")).not.toBeNull();
  cleanup();
  const display = render(<MarkdownRenderer content="$$\frac{a}{b}$$" />);
  expect(display.container.querySelector(".katex")).not.toBeNull();
});

it("leaves code untouched", () => {
  expect(
    preprocessLaTeX("Use `\\(x\\)` or\n```\n\\[y\\]\n```\nthen \\(z\\)"),
  ).toBe("Use `\\(x\\)` or\n```\n\\[y\\]\n```\nthen $$z$$");
});

it("does not leak the markdown AST node to the DOM", () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const { container } = render(
    <MarkdownRenderer content={"# Title\n\n- **item** [link](https://x.y)"} />,
  );
  expect(container.querySelector("[node]")).toBeNull();
  expect(error).not.toHaveBeenCalled();
});
