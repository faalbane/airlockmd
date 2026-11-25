import { TOKEN_PREFIX, type Span, type TokenMap } from "../types";
import { resolveNonOverlapping } from "./spans";

export function tokenize(text: string, spans: Span[]): { tokenized: string; tokenMap: TokenMap } {
  const included = spans.filter((span) => span.included);
  const resolved = resolveNonOverlapping(included).filter(
    (span) => text.slice(span.start, span.end) === span.text,
  );
  const byValue = new Map<string, string>();
  const counters: Record<string, number> = {};
  const tokenMap: TokenMap = {};
  const replacements: { start: number; end: number; token: string }[] = [];

  for (const span of resolved) {
    const valueKey = `${span.type}\0${span.text}`;
    let token = byValue.get(valueKey);
    if (!token) {
      const prefix = TOKEN_PREFIX[span.type];
      const next = (counters[prefix] ?? 0) + 1;
      counters[prefix] = next;
      token = `[${prefix}_${next}]`;
      byValue.set(valueKey, token);
      tokenMap[token] = { type: span.type, text: span.text };
    }
    replacements.push({ start: span.start, end: span.end, token });
  }

  let tokenized = text;
  for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
    tokenized =
      tokenized.slice(0, replacement.start) + replacement.token + tokenized.slice(replacement.end);
  }
  return { tokenized, tokenMap };
}

export function secretsFromMap(tokenMap: TokenMap): string[] {
  return Object.values(tokenMap)
    .map((entry) => entry.text.trim())
    .filter((value) => value.length >= 3);
}
