const NUMERIC_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;

/** Parse complete finite numbers, including grouped thousands and decimal commas.
 * A comma followed by exactly three digits is a thousands separator; ambiguous
 * locales should be normalized by the caller. Blank and invalid values are missing.
 */
export function parseNumericValue(value: string): number | null {
  let text = value.trim();
  if (NUMERIC_PATTERN.test(text)) {
    const number = Number(text);
    return Number.isFinite(number) ? number : null;
  }
  text = text.replace(/\s/g, "");
  if (!text) return null;
  // Thousands groups never start with 0 ("0,123" is a decimal comma)
  if (/^[+-]?[1-9]\d{0,2}(,\d{3})+(\.\d+)?$/.test(text))
    text = text.replace(/,/g, "");
  else if (/^[+-]?\d+,\d+$/.test(text)) text = text.replace(",", ".");
  if (!NUMERIC_PATTERN.test(text)) return null;
  const result = Number(text);
  return Number.isFinite(result) ? result : null;
}

/**
 * Round to 6 significant digits without losing integer digits, so tiny ratios
 * keep their precision and large totals stay exact.
 */
export function roundSignificant(value: number, digits = 6): number {
  if (!Number.isFinite(value) || Number.isInteger(value) || value === 0)
    return value;
  const magnitude = Math.floor(Math.log10(Math.abs(value))) + 1;
  const decimals = Math.min(20, Math.max(0, digits - magnitude));
  return Number(value.toFixed(decimals));
}

/** Order of day and month in local dates such as 03/04/2024. */
export type DateOrder = "dmy" | "mdy";

const ISO_DATE =
  /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?)?$/i;
const LOCAL_DATE = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/;

/**
 * ISO dates and datetimes, or local dates. Datetimes without an offset are read
 * as UTC, like plain dates. Local dates follow `order`; without it they are
 * day/month/year unless only month/day/year is valid.
 */
export function parseDateValue(
  value: string,
  order?: DateOrder,
): number | null {
  const text = value.trim();
  const iso = ISO_DATE.exec(text);
  if (iso) {
    const [, y, mo, d, h = "0", mi = "0", sec = "0", frac = "", zone] = iso;
    const year = Number(y),
      month = Number(mo),
      day = Number(d);
    if (!isValidDay(year, month, day)) return null;
    const hours = Number(h),
      minutes = Number(mi),
      seconds = Number(sec);
    if (hours > 23 || minutes > 59 || seconds > 59) return null;
    const ms = frac ? Math.floor(Number(`0.${frac}`) * 1000) : 0;
    let time = Date.UTC(year, month - 1, day, hours, minutes, seconds, ms);
    if (zone && zone.toUpperCase() !== "Z") {
      const sign = zone.startsWith("-") ? -1 : 1;
      const digits = zone.slice(1).replace(":", "");
      const offset =
        Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2) || "0");
      time -= sign * offset * 60_000;
    }
    return time;
  }
  const local = LOCAL_DATE.exec(text);
  if (local) {
    const first = Number(local[1]),
      second = Number(local[2]),
      year = Number(local[3]);
    let [day, month] = order === "mdy" ? [second, first] : [first, second];
    if (!order && month > 12 && day <= 12) [month, day] = [day, month];
    return isValidDay(year, month, day) ? Date.UTC(year, month - 1, day) : null;
  }
  if (!/^[A-Za-z]{3,9}\s\d{1,2},?\s\d{4}$/.test(text)) return null;
  const date = Date.parse(`${text} UTC`);
  return Number.isFinite(date) ? date : null;
}

function isValidDay(year: number, month: number, day: number): boolean {
  return (
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= new Date(Date.UTC(year, month, 0)).getUTCDate()
  );
}

/**
 * Choose one day/month order for a whole column of local dates, so 03/04/2024
 * is read the same way as 25/04/2024 or 04/25/2024 next to it.
 */
export function detectDateOrder(values: Iterable<string>): DateOrder {
  let dmy = 0,
    mdy = 0;
  for (const value of values) {
    const local = LOCAL_DATE.exec(value.trim());
    if (!local) continue;
    const first = Number(local[1]),
      second = Number(local[2]);
    if (first > 12 && second <= 12) dmy++;
    else if (second > 12 && first <= 12) mdy++;
  }
  return mdy > dmy ? "mdy" : "dmy";
}

export function isDateValue(value: string, order?: DateOrder): boolean {
  return parseDateValue(value, order) !== null;
}

export const BOOLEAN_VALUES = new Set([
  "true",
  "false",
  "yes",
  "no",
  "vrai",
  "faux",
  "oui",
  "non",
]);

/** Most values inspected when inferring a column type. */
export const TYPE_SAMPLE_SIZE = 1000;

/** Pick up to `max` items spread evenly over the whole array. */
export function sampleEvenly<T>(items: readonly T[], max: number): T[] {
  if (items.length <= max) return [...items];
  const step = items.length / max;
  return Array.from({ length: max }, (_, i) => items[Math.floor(i * step)]!);
}

/** Infer a column's type from a sample spread over the whole file. */
export function inferValuesType(
  values: string[],
): "string" | "number" | "date" | "boolean" {
  const sample = sampleEvenly(values, TYPE_SAMPLE_SIZE).filter(
    (v) => v.trim() !== "",
  );
  if (!sample.length) return "string";
  const threshold = sample.length * 0.8;
  if (
    sample.filter((v) => BOOLEAN_VALUES.has(v.trim().toLowerCase())).length >=
    threshold
  )
    return "boolean";
  const order = detectDateOrder(sample);
  if (sample.filter((v) => isDateValue(v, order)).length >= threshold)
    return "date";
  if (sample.filter((v) => parseNumericValue(v) !== null).length >= threshold)
    return "number";
  return "string";
}

/** Infer the type of column `index` without copying every row. */
export function inferColumnValuesType(
  rows: readonly string[][],
  index: number,
): "string" | "number" | "date" | "boolean" {
  return inferValuesType(
    sampleEvenly(rows, TYPE_SAMPLE_SIZE).map((row) => row[index] ?? ""),
  );
}

export function uniqueHeaders(headers: string[]): string[] {
  const reserved = new Set(headers.map((h) => h.trim().toLowerCase()));
  const seen = new Set<string>();
  return headers.map((h, i) => {
    const base = h.trim() || `Column ${i + 1}`;
    let name = base;
    let suffix = 2;
    while (
      seen.has(name.toLowerCase()) ||
      (!h.trim() && reserved.has(name.toLowerCase()))
    )
      name = `${base} (${suffix++})`;
    seen.add(name.toLowerCase());
    return name;
  });
}
