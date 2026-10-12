import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { CSVData } from "./csv-parser";
import {
  defaultDarkTheme,
  defaultLightTheme,
  type DataSummaryResult,
  type AnomalyResult,
  type ChartConfig,
} from "csv-charts-ai";

interface ChatMessage {
  prompt: string;
  response: string;
  cancelled?: boolean;
}

export interface ChartImage {
  title: string;
  dataUrl: string;
  width: number;
  height: number;
}

export interface PDFExportOptions {
  fileName?: string;
  data: CSVData;
  summary?: DataSummaryResult | null;
  anomalies?: AnomalyResult[] | null;
  chatHistory?: ChatMessage[];
  charts?: ChartConfig[];
  chartImages?: ChartImage[];
}

const MARGIN = 20;
const PAGE_WIDTH = 210; // A4
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

/** Plain-text replacement of LaTeX commands (without the backslash). */
const LATEX_COMMANDS: Record<string, string> = {
  sum: "Sum",
  prod: "Prod",
  int: "Integral",
  log: "log",
  ln: "ln",
  exp: "exp",
  sin: "sin",
  cos: "cos",
  tan: "tan",
  min: "min",
  max: "max",
  lim: "lim",
  left: "",
  right: "",
  cdot: " * ",
  cdots: "...",
  ldots: "...",
  times: " x ",
  div: " / ",
  pm: " +/- ",
  mp: " -/+ ",
  leq: " <= ",
  le: " <= ",
  geq: " >= ",
  ge: " >= ",
  neq: " != ",
  ne: " != ",
  approx: " ~ ",
  infty: "Inf",
  alpha: "alpha",
  beta: "beta",
  gamma: "gamma",
  delta: "delta",
  sigma: "sigma",
  mu: "mu",
  pi: "pi",
  theta: "theta",
  lambda: "lambda",
  in: " in ",
  forall: "for all ",
  exists: "exists ",
  partial: "d",
  nabla: "nabla",
  quad: "  ",
  qquad: "    ",
};

/**
 * Convert LaTeX math notation to readable plain text.
 * jsPDF cannot render LaTeX natively, so we produce clean ASCII math.
 */
export function latexToPlainText(tex: string): string {
  let result = tex.trim();

  // \text{...} → content
  result = result.replace(/\\text\{([^}]*)\}/g, "$1");
  // \textbf{...} → content
  result = result.replace(/\\textbf\{([^}]*)\}/g, "$1");
  // \mathrm{...} → content
  result = result.replace(/\\mathrm\{([^}]*)\}/g, "$1");
  // \operatorname{...} → content
  result = result.replace(/\\operatorname\{([^}]*)\}/g, "$1");
  // \frac{a}{b} → (a / b)
  result = result.replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, "($1 / $2)");
  // \sqrt{x} → sqrt(x)
  result = result.replace(/\\sqrt\{([^}]*)\}/g, "sqrt($1)");
  // \bar{x} → x_mean
  result = result.replace(/\\bar\{([^}]*)\}/g, "$1_mean");
  // \hat{x} → x_hat
  result = result.replace(/\\hat\{([^}]*)\}/g, "$1_hat");
  // \vec{x} → x_vec
  result = result.replace(/\\vec\{([^}]*)\}/g, "$1");
  // Commands are matched as whole tokens, so \cdots never becomes "\cdot" + "s"
  // and \infty never becomes "\in" + "fty"
  result = result.replace(
    /\\([a-zA-Z]+)/g,
    (match, name: string) => LATEX_COMMANDS[name] ?? match,
  );
  // Subscript: x_{sub} → x_sub  or  x_i → x_i
  result = result.replace(/\_\{([^}]*)\}/g, "_$1");
  // Superscript: x^{sup} → x^sup  or  x^2 → x^2
  result = result.replace(/\^\{([^}]*)\}/g, "^$1");
  // Remove remaining \commands
  result = result.replace(/\\_/g, "_");
  result = result.replace(/\\[a-zA-Z]+/g, "");
  // Remove leftover braces
  result = result.replace(/[{}]/g, "");
  // Clean up whitespace
  result = result.replace(/\s+/g, " ").trim();

  return result;
}

/**
 * Inline math `$...$` follows the pandoc rule: the opening `$` is followed by a
 * non-space, the closing `$` is preceded by a non-space and not followed by a
 * digit. So "$1,200 to $5,000" stays plain text.
 */
const INLINE_MATH = /(?<!\\)\$(?=\S)((?:[^$\\\n]|\\.)+?)(?<=\S)\$(?!\d)/g;

/** Strip markdown + LaTeX for plain-text PDF rendering */
export function stripMarkdown(text: string): string {
  let result = text;

  // Extract and convert display math: $$...$$ or \[...\]
  result = result.replace(/\$\$([\s\S]*?)\$\$/g, (_m, inner: string) =>
    latexToPlainText(inner),
  );
  result = result.replace(/\\\[([\s\S]*?)\\\]/g, (_m, inner: string) =>
    latexToPlainText(inner),
  );
  // Bare [ ... ] with LaTeX commands
  result = result.replace(
    /^\[\s*(\\(?:text|frac|sqrt|sum|prod|int|left|right|bar|hat)\b[\s\S]*?)\s*\]$/gm,
    (_m, inner: string) => latexToPlainText(inner),
  );
  // Inline math: $...$ (pandoc rule) or \(...\)
  result = result.replace(INLINE_MATH, (_m, inner: string) =>
    latexToPlainText(inner),
  );
  result = result.replace(/\\\((.*?)\\\)/g, (_m, inner: string) =>
    latexToPlainText(inner),
  );

  // Strip markdown formatting
  result = result
    .replace(/#{1,6}\s/g, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`(.*?)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^[-*+]\s/gm, "- ")
    .replace(/\\\$/g, "$")
    .trim();

  return result;
}

/** Chat turns worth printing: failed answers are left out. */
export function chatEntriesForPDF(history: ChatMessage[]): ChatMessage[] {
  return history.filter((item) => !item.response.startsWith("[ERROR]"));
}

// ============ Fonts ============
// The built-in PDF fonts only cover WinAnsi (Western European). Text outside it
// (Polish, Czech, Greek, Russian…) uses Noto Sans, loaded only when needed.

const WIN_ANSI_EXTRA = new Set(
  "\u20ac\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\u017d\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\u017e\u0178",
);

/** Ranges included in public/fonts/NotoSans-*-subset.ttf. */
const UNICODE_FONT_RANGES: [number, number][] = [
  [0x20, 0x7e],
  [0xa0, 0x24f],
  [0x300, 0x36f],
  [0x370, 0x3ff],
  [0x400, 0x4ff],
  [0x1e00, 0x1eff],
  [0x2000, 0x206f],
  [0x20a0, 0x20cf],
  [0x2100, 0x214f],
  [0x2190, 0x21ff],
  [0x2200, 0x22ff],
  [0x25a0, 0x25ff],
];

const isControl = (code: number) => code < 0x20 || code === 0x7f;

/** True when the standard PDF fonts cannot draw some of this text. */
export function needsUnicodeFont(text: string): boolean {
  for (const char of text) {
    const code = char.codePointAt(0)!;
    if (isControl(code) || code < 0x80) continue;
    if (code >= 0xa0 && code <= 0xff) continue;
    if (WIN_ANSI_EXTRA.has(char)) continue;
    return true;
  }
  return false;
}

/** True when even the Unicode font lacks some characters (CJK, emoji, …). */
export function hasUnsupportedCharacters(text: string): boolean {
  for (const char of text) {
    const code = char.codePointAt(0)!;
    if (isControl(code)) continue;
    if (UNICODE_FONT_RANGES.some(([lo, hi]) => code >= lo && code <= hi))
      continue;
    return true;
  }
  return false;
}

const UNICODE_FONT = "NotoSans";
const fontFiles: Record<"normal" | "bold", string> = {
  normal: "NotoSans-Regular-subset.ttf",
  bold: "NotoSans-Bold-subset.ttf",
};
let fontData: Promise<Record<"normal" | "bold", string>> | null = null;

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function loadUnicodeFont() {
  fontData ??= Promise.all(
    (["normal", "bold"] as const).map(async (style) => {
      const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
      const res = await fetch(`${basePath}/fonts/${fontFiles[style]}`);
      if (!res.ok) throw new Error(`Font download failed (${res.status})`);
      return [style, toBase64(await res.arrayBuffer())] as const;
    }),
  )
    .then(
      (entries) =>
        Object.fromEntries(entries) as Record<"normal" | "bold", string>,
    )
    .catch((error: unknown) => {
      fontData = null; // allow a retry on the next export
      throw error;
    });
  return fontData;
}

const docFonts = new WeakMap<jsPDF, string>();

/** Pick the font for this document: Noto Sans when the text needs it. */
async function prepareFont(doc: jsPDF, texts: string[]): Promise<string> {
  const text = texts.join("\n");
  let font = "helvetica";
  if (needsUnicodeFont(text)) {
    try {
      const data = await loadUnicodeFont();
      for (const style of ["normal", "bold"] as const) {
        doc.addFileToVFS(fontFiles[style], data[style]);
        doc.addFont(fontFiles[style], UNICODE_FONT, style);
      }
      font = UNICODE_FONT;
    } catch (error) {
      console.error("Unicode PDF font unavailable:", error);
    }
  }
  docFonts.set(doc, font);
  return font;
}

function setFont(doc: jsPDF, style: "normal" | "bold") {
  doc.setFont(docFonts.get(doc) ?? "helvetica", style);
}

/** Toast shown when {@link PDFExportReport.unsupportedCharacters} is true. */
export const PDF_UNSUPPORTED_WARNING =
  "Some characters (Chinese, Japanese, Korean, emoji…) cannot be drawn in the PDF and may be missing.";

/** What the export could not render faithfully. */
export interface PDFExportReport {
  /** Some characters (CJK, emoji…) have no glyph in the PDF fonts. */
  unsupportedCharacters: boolean;
}

function addSectionTitle(doc: jsPDF, title: string, y: number): number {
  if (y > 260) {
    doc.addPage();
    y = MARGIN;
  }
  doc.setFontSize(14);
  setFont(doc, "bold");
  doc.setTextColor(79, 70, 229); // violet-600
  doc.text(title, MARGIN, y);
  // Underline
  doc.setDrawColor(79, 70, 229);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, y + 1.5, MARGIN + doc.getTextWidth(title), y + 1.5);
  return y + 10;
}

function addWrappedText(
  doc: jsPDF,
  text: string,
  y: number,
  fontSize = 10,
): number {
  doc.setFontSize(fontSize);
  setFont(doc, "normal");
  doc.setTextColor(30, 30, 30);
  const lines = doc.splitTextToSize(text, CONTENT_WIDTH);
  for (const line of lines) {
    if (y > 280) {
      doc.addPage();
      y = MARGIN;
    }
    doc.text(line, MARGIN, y);
    y += fontSize * 0.45;
  }
  return y + 3;
}

// Truncate cell values for readability
const truncate = (v: string, max = 30) =>
  v.length > max ? v.slice(0, max - 1) + "\u2026" : v;

export async function exportToPDF(
  options: PDFExportOptions,
): Promise<PDFExportReport> {
  const {
    fileName = "analysis-report",
    data,
    summary,
    anomalies,
    charts,
    chartImages,
  } = options;
  const chatHistory = chatEntriesForPDF(options.chatHistory ?? []);

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const texts = [
    fileName,
    ...data.headers,
    summary?.summary ?? "",
    ...(summary?.keyInsights ?? []),
    summary?.dataQuality ?? "",
    ...(anomalies ?? []).flatMap((a) => [a.column, a.value, a.issue]),
    ...(charts ?? []).flatMap((c) => [
      c.title,
      c.description,
      c.xAxis,
      c.yAxis,
    ]),
    ...(chartImages ?? []).map((c) => c.title),
    ...chatHistory.flatMap((c) => [c.prompt, c.response]),
  ];
  const font = await prepareFont(doc, texts);
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  // ─── Title page header ───
  doc.setFillColor(79, 70, 229);
  doc.rect(0, 0, PAGE_WIDTH, 45, "F");

  doc.setFontSize(22);
  setFont(doc, "bold");
  doc.setTextColor(255, 255, 255);
  doc.text("CSV AI Analyzer", MARGIN, 20);

  doc.setFontSize(11);
  setFont(doc, "normal");
  doc.text("Analysis Report", MARGIN, 28);

  doc.setFontSize(9);
  doc.text(dateStr, MARGIN, 36);

  let y = 55;

  // ─── File overview ───
  y = addSectionTitle(doc, "File Overview", y);

  doc.setFontSize(10);
  setFont(doc, "normal");
  doc.setTextColor(30, 30, 30);

  const displayName = fileName.replace(/\.(csv|xlsx?)$/i, "") || "untitled";
  const overviewItems = [
    `Name: ${displayName}`,
    `Rows: ${data.rowCount.toLocaleString("en-US")}`,
    `Columns: ${data.headers.length} (${data.headers.slice(0, 10).join(", ")}${data.headers.length > 10 ? "..." : ""})`,
  ];
  for (const item of overviewItems) {
    doc.text(item, MARGIN + 2, y);
    y += 5;
  }
  y += 5;

  // ─── AI Summary ───
  if (summary) {
    if (y > 230) {
      doc.addPage();
      y = MARGIN;
    }
    y = addSectionTitle(doc, "AI Summary", y);
    y = addWrappedText(doc, stripMarkdown(summary.summary), y);
    y += 3;

    if (summary.keyInsights?.length) {
      doc.setFontSize(11);
      setFont(doc, "bold");
      doc.setTextColor(30, 30, 30);
      if (y > 265) {
        doc.addPage();
        y = MARGIN;
      }
      doc.text("Key Insights", MARGIN, y);
      y += 6;

      for (const insight of summary.keyInsights) {
        if (y > 280) {
          doc.addPage();
          y = MARGIN;
        }
        doc.setFontSize(10);
        setFont(doc, "normal");
        const bullet = `\u2022  ${stripMarkdown(insight)}`;
        const lines = doc.splitTextToSize(bullet, CONTENT_WIDTH - 4);
        for (const line of lines) {
          if (y > 280) {
            doc.addPage();
            y = MARGIN;
          }
          doc.text(line, MARGIN + 2, y);
          y += 4.5;
        }
        y += 1;
      }
      y += 3;
    }

    if (summary.dataQuality) {
      doc.setFontSize(11);
      setFont(doc, "bold");
      doc.setTextColor(30, 30, 30);
      if (y > 265) {
        doc.addPage();
        y = MARGIN;
      }
      doc.text("Data Quality", MARGIN, y);
      y += 6;
      y = addWrappedText(doc, stripMarkdown(summary.dataQuality), y);
      y += 3;
    }
  }

  // ─── Anomalies ───
  if (anomalies && anomalies.length > 0) {
    if (y > 230) {
      doc.addPage();
      y = MARGIN;
    }
    y = addSectionTitle(doc, `Detected Anomalies (${anomalies.length})`, y);

    autoTable(doc, {
      startY: y,
      head: [["Row", "Column", "Value", "Issue", "Severity"]],
      body: anomalies.map((a) => [
        String(a.row),
        a.column,
        truncate(a.value, 25),
        truncate(a.issue, 40),
        a.severity.charAt(0).toUpperCase() + a.severity.slice(1),
      ]),
      styles: {
        font,
        fontSize: 8,
        cellPadding: 2.5,
        textColor: [30, 30, 30],
      },
      headStyles: {
        fillColor: [239, 68, 68],
        textColor: [255, 255, 255],
        fontStyle: "bold",
      },
      columnStyles: {
        0: { cellWidth: 15 },
        4: { cellWidth: 20 },
      },
      margin: { left: MARGIN, right: MARGIN },
      tableWidth: CONTENT_WIDTH,
    });

    y = (doc as any).lastAutoTable?.finalY ?? y + 10;
    y += 8;
  }

  // ─── Charts ───
  if (chartImages && chartImages.length > 0) {
    const MAX_Y = 280;
    const MAX_CHART_H = 120;

    // Start charts section on a new page
    doc.addPage();
    y = MARGIN;
    y = addSectionTitle(doc, `Charts (${chartImages.length})`, y);

    for (const img of chartImages) {
      const aspectRatio = img.height / img.width;
      const imgWidth = CONTENT_WIDTH;
      const imgHeight = imgWidth * aspectRatio;
      const finalHeight = Math.min(imgHeight, MAX_CHART_H);
      const finalWidth =
        finalHeight < imgHeight ? finalHeight / aspectRatio : imgWidth;

      const blockHeight = 10 + finalHeight + 8;

      if (y + blockHeight > MAX_Y) {
        doc.addPage();
        y = MARGIN;
      }

      y = addSectionTitle(doc, img.title, y);

      try {
        doc.addImage(img.dataUrl, "PNG", MARGIN, y, finalWidth, finalHeight);
        y += finalHeight + 8;
      } catch {
        y = addWrappedText(doc, `[Chart: ${img.title}]`, y);
      }
    }
  } else if (charts && charts.length > 0) {
    // Fallback: table of chart descriptions when images aren't available
    if (y > 230) {
      doc.addPage();
      y = MARGIN;
    }
    y = addSectionTitle(doc, `Generated Charts (${charts.length})`, y);

    const chartTypeLabels: Record<string, string> = {
      bar: "Bar",
      line: "Line",
      pie: "Pie",
      scatter: "Scatter",
      area: "Area",
      histogram: "Histogram",
      radar: "Radar",
    };

    autoTable(doc, {
      startY: y,
      head: [["Type", "Title", "Description", "X Axis", "Y Axis"]],
      body: charts.map((c) => [
        chartTypeLabels[c.type] ?? c.type,
        truncate(c.title, 30),
        truncate(c.description, 40),
        c.xAxis,
        c.yAxis,
      ]),
      styles: {
        font,
        fontSize: 8,
        cellPadding: 2.5,
        textColor: [30, 30, 30],
      },
      headStyles: {
        fillColor: [79, 70, 229],
        textColor: [255, 255, 255],
        fontStyle: "bold",
      },
      margin: { left: MARGIN, right: MARGIN },
      tableWidth: CONTENT_WIDTH,
    });

    y = (doc as any).lastAutoTable?.finalY ?? y + 10;
    y += 8;
  }

  // ─── Chat history ───
  if (chatHistory && chatHistory.length > 0) {
    if (y > 230) {
      doc.addPage();
      y = MARGIN;
    }
    y = addSectionTitle(doc, "Chat History", y);

    for (let i = 0; i < chatHistory.length; i++) {
      const item = chatHistory[i]!;
      if (y > 260) {
        doc.addPage();
        y = MARGIN;
      }

      // Question
      doc.setFontSize(10);
      setFont(doc, "bold");
      doc.setTextColor(79, 70, 229);
      const qLines = doc.splitTextToSize(
        `Q${i + 1}: ${item.prompt}`,
        CONTENT_WIDTH - 4,
      );
      for (const line of qLines) {
        if (y > 280) {
          doc.addPage();
          y = MARGIN;
        }
        doc.text(line, MARGIN + 2, y);
        y += 4.5;
      }
      y += 2;

      // Response
      const response = stripMarkdown(item.response);
      y = addWrappedText(
        doc,
        item.cancelled
          ? `${response}${response ? "\n" : ""}(Cancelled before the answer finished)`
          : response,
        y,
        9,
      );
      y += 5;
    }
  }

  // ─── Footer on every page ───
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`Page ${i} / ${pageCount}`, PAGE_WIDTH / 2, 292, {
      align: "center",
    });
    doc.text("CSV AI Analyzer", MARGIN, 292);
    doc.text(dateStr, PAGE_WIDTH - MARGIN, 292, { align: "right" });
  }

  doc.save(`${displayName}-report.pdf`);
  return { unsupportedCharacters: hasUnsupportedCharacters(texts.join("\n")) };
}

const LIGHT_COLOR_PAIRS: [string, string][] = (() => {
  const pairs: [string, string][] = defaultDarkTheme.colors.map((c, i) => [
    c,
    defaultLightTheme.colors[i] ?? c,
  ]);
  for (const key of [
    "text",
    "textMuted",
    "textDimmed",
    "gridStroke",
    "cardBackground",
    "accentPrimary",
    "accentSecondary",
    "accentSuccess",
    "accentDanger",
  ] as const)
    pairs.push([defaultDarkTheme[key], defaultLightTheme[key]]);
  return pairs;
})();

/**
 * Swap dark-theme chart colors for their light-theme counterparts, so a chart
 * captured from the dark UI stays readable on the white PDF page.
 */
export function toLightColors(svg: string): string {
  let result = svg;
  for (const [dark, light] of LIGHT_COLOR_PAIRS) {
    if (dark === light) continue;
    const escaped = dark.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(
      new RegExp(`(["'(:\\s])${escaped}(?=["');\\s])`, "gi"),
      `$1${light}`,
    );
  }
  return result;
}

/**
 * Serialize a live SVG element directly (no cloneNode — that breaks
 * namespaces and produces blank or purple-filled exports).
 * Injects a background rect via string manipulation and fixes percentage-based
 * CSS dimensions that break standalone rendering.
 */
function serializeSvgWithBg(
  svgElement: Element,
  bgColor: string,
): { svg: string; width: number; height: number } | null {
  const rect = svgElement.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;

  let svg = toLightColors(new XMLSerializer().serializeToString(svgElement));

  const openTag = svg.match(/<svg[^>]*>/);
  if (!openTag) return null;

  // Recharts sets style="width:100%;height:100%" for responsive layout.
  // Strip percentage dimensions so the SVG renders at its intrinsic pixel size
  // when used standalone (blob → createImageBitmap / <img>).
  let tag = openTag[0];
  tag = tag.replace(/style="([^"]*)"/, (_m: string, styles: string) => {
    const kept = styles
      .split(";")
      .map((p) => p.trim())
      .filter((p) => {
        const name = p.split(":")[0]?.trim().toLowerCase();
        return name && name !== "width" && name !== "height";
      })
      .join("; ");
    return kept ? `style="${kept}"` : "";
  });
  tag = tag.replace(/\bwidth="[^"]*"/, `width="${rect.width}"`);
  tag = tag.replace(/\bheight="[^"]*"/, `height="${rect.height}"`);

  const bgRect = `<rect width="${rect.width}" height="${rect.height}" fill="${bgColor}"/>`;
  svg = tag + bgRect + svg.slice(openTag[0].length);

  return { svg, width: rect.width, height: rect.height };
}

/** Convert an SVG string to a PNG data URL via createImageBitmap + canvas */
async function svgStringToPng(
  svgString: string,
  width: number,
  height: number,
): Promise<string | null> {
  const svgBlob = new Blob([svgString], {
    type: "image/svg+xml;charset=utf-8",
  });

  try {
    const bitmap = await createImageBitmap(svgBlob);
    const canvas = document.createElement("canvas");
    const scale = 2;
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(scale, scale);
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    return canvas.toDataURL("image/png");
  } catch {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(svgBlob);
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const scale = 2;
        canvas.width = width * scale;
        canvas.height = height * scale;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          URL.revokeObjectURL(url);
          resolve(null);
          return;
        }
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      img.src = url;
    });
  }
}

/**
 * Capture the chart SVGs rendered under `root` and convert them to PNG data URLs.
 * Each chart is found by its `data-chart-id`, so other charts on the page
 * (chat answers, suggestions) are never mixed in.
 */
export async function captureChartImages(
  charts: ChartConfig[],
  root: ParentNode = document,
): Promise<ChartImage[]> {
  const results: ChartImage[] = [];

  for (const chart of charts) {
    const container = root.querySelector(
      `[data-chart-id="${CSS.escape(chart.id)}"]`,
    );
    if (!container) continue;

    // Recharts v3 legend icons are also <svg class="recharts-surface"> (14×14),
    // so we select the largest SVG inside the chart.
    const allSvgs = container.querySelectorAll("svg.recharts-surface");
    let svgElement: Element | null = null;
    let maxArea = 0;
    for (const svg of allSvgs) {
      const r = svg.getBoundingClientRect();
      const area = r.width * r.height;
      if (area > maxArea) {
        maxArea = area;
        svgElement = svg;
      }
    }
    if (!svgElement) continue;

    const serialized = serializeSvgWithBg(svgElement, "#ffffff");
    if (!serialized) continue;

    const dataUrl = await svgStringToPng(
      serialized.svg,
      serialized.width,
      serialized.height,
    );
    if (dataUrl) {
      results.push({
        title: chart.title,
        dataUrl,
        width: serialized.width,
        height: serialized.height,
      });
    }
  }

  return results;
}

/**
 * Export only charts as a PDF document.
 */
export async function exportChartsPDF(
  charts: ChartConfig[],
  fileName = "charts",
  root: ParentNode = document,
): Promise<PDFExportReport | null> {
  const chartImages = await captureChartImages(charts, root);
  if (chartImages.length === 0) return null;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const titles = chartImages.map((img) => img.title);
  await prepareFont(doc, titles);
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Header
  doc.setFillColor(79, 70, 229);
  doc.rect(0, 0, PAGE_WIDTH, 35, "F");
  doc.setFontSize(18);
  setFont(doc, "bold");
  doc.setTextColor(255, 255, 255);
  doc.text("Charts Report", MARGIN, 18);
  doc.setFontSize(9);
  setFont(doc, "normal");
  doc.text(dateStr, MARGIN, 27);

  const MAX_Y = 280; // leave room for footer
  const MAX_CHART_H = 120; // cap so ≥2 charts fit per page
  let y = 45; // after header on first page

  for (const img of chartImages) {
    const aspectRatio = img.height / img.width;
    const imgWidth = CONTENT_WIDTH;
    const imgHeight = imgWidth * aspectRatio;
    const finalHeight = Math.min(imgHeight, MAX_CHART_H);
    const finalWidth =
      finalHeight < imgHeight ? finalHeight / aspectRatio : imgWidth;

    // title (10mm) + image + spacing (8mm)
    const blockHeight = 10 + finalHeight + 8;

    if (y + blockHeight > MAX_Y) {
      doc.addPage();
      y = MARGIN;
    }

    y = addSectionTitle(doc, img.title, y);

    try {
      doc.addImage(img.dataUrl, "PNG", MARGIN, y, finalWidth, finalHeight);
    } catch {
      doc.setFontSize(10);
      doc.setTextColor(120, 120, 120);
      doc.text(`[Could not embed chart: ${img.title}]`, MARGIN, y);
    }

    y += finalHeight + 8;
  }

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`Page ${i} / ${pageCount}`, PAGE_WIDTH / 2, 292, {
      align: "center",
    });
    doc.text("CSV AI Analyzer", MARGIN, 292);
  }

  const displayName = fileName.replace(/\.(csv|xlsx?)$/i, "") || "charts";
  doc.save(`${displayName}-charts.pdf`);
  return { unsupportedCharacters: hasUnsupportedCharacters(titles.join("\n")) };
}
