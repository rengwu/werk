import sanitizeHtml from "sanitize-html";
export function htmlText(value: string): string {
  const decode = (s: string) =>
    s
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&#(\d+);/g, (_, n) =>
        Number(n) <= 0x10ffff ? String.fromCodePoint(Number(n)) : "",
      );
  return decode(
    sanitizeHtml(
      decode(value).replace(
        /<\/(?:p|div|li|h[1-6])\s*>|<br\s*\/?\s*>/gi,
        "\n\n",
      ),
      { allowedTags: [], allowedAttributes: {} },
    ),
  )
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function sourceDate(value: unknown): string | null {
  if (value == null || value === "") return null;
  const n =
    typeof value === "number"
      ? value
      : /^\d{10,13}$/.test(String(value))
        ? Number(value)
        : null;
  const ms = n === null ? Date.parse(String(value)) : n < 1e12 ? n * 1000 : n;
  return Number.isFinite(ms) && Math.abs(ms) <= 8.64e15
    ? new Date(ms).toISOString()
    : null;
}
