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
  if (/^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(text))
    text = text.replace(/,/g, "");
  else if (/^[+-]?\d+,\d+$/.test(text)) text = text.replace(",", ".");
  if (!NUMERIC_PATTERN.test(text)) return null;
  const result = Number(text);
  return Number.isFinite(result) ? result : null;
}

/** ISO dates or local dates (day/month/year when ambiguous). */
export function parseDateValue(value: string): number | null {
  const text = value.trim();
  const iso = /^(\d{4})[-/](\d{2})[-/](\d{2})(?:T.*)?$/.exec(text);
  const local = /^(\d{2})[/.\-](\d{2})[/.\-](\d{4})$/.exec(text);
  if (iso || local) {
    const year = Number(iso?.[1] ?? local?.[3]);
    let month = Number(iso?.[2] ?? local?.[2]);
    let day = Number(iso?.[3] ?? local?.[1]);
    if (!iso && month > 12 && day <= 12) [month, day] = [day, month];
    if (
      month < 1 ||
      month > 12 ||
      day < 1 ||
      day > new Date(Date.UTC(year, month, 0)).getUTCDate()
    )
      return null;
    if (iso && text.includes("T")) {
      const date = Date.parse(text);
      return Number.isFinite(date) ? date : null;
    }
    return Date.UTC(year, month - 1, day);
  }
  if (!/^[A-Za-z]{3,9}\s\d{1,2},?\s\d{4}$/.test(text)) return null;
  const date = Date.parse(text);
  return Number.isFinite(date) ? date : null;
}
export function isDateValue(value: string): boolean {
  return parseDateValue(value) !== null;
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

export function inferValuesType(
  values: string[],
): "string" | "number" | "date" | "boolean" {
  const sample = values.slice(0, 100).filter((v) => v.trim() !== "");
  if (!sample.length) return "string";
  const threshold = sample.length * 0.8;
  if (
    sample.filter((v) => BOOLEAN_VALUES.has(v.trim().toLowerCase())).length >=
    threshold
  )
    return "boolean";
  if (sample.filter(isDateValue).length >= threshold) return "date";
  if (sample.filter((v) => parseNumericValue(v) !== null).length >= threshold)
    return "number";
  return "string";
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
