import type { IdentifierType, Span } from "../types";

const PRIORITY: IdentifierType[] = [
  "ssn",
  "email",
  "telephone",
  "fax",
  "mrn",
  "health_plan_id",
  "account_number",
  "certificate_license",
  "url",
  "ip",
  "name",
  "date",
  "geographic_subdivision",
  "vehicle_id",
  "device_id",
  "biometric",
  "face_photo",
  "other_unique_id",
];

export function spansOverlap(
  a: { start: number; end: number },
  b: { start: number; end: number },
): boolean {
  return a.start < b.end && b.start < a.end;
}

function priority(type: IdentifierType): number {
  const index = PRIORITY.indexOf(type);
  return index === -1 ? PRIORITY.length : index;
}

/** Keep the higher priority span when two ranges overlap. */
export function resolveNonOverlapping(spans: Span[]): Span[] {
  const sorted = [...spans].sort((a, b) => {
    const byType = priority(a.type) - priority(b.type);
    if (byType !== 0) return byType;
    return b.end - b.start - (a.end - a.start);
  });
  const kept: Span[] = [];
  for (const span of sorted) {
    if (span.end <= span.start) continue;
    if (kept.some((current) => spansOverlap(current, span))) continue;
    kept.push(span);
  }
  kept.sort((a, b) => a.start - b.start || a.end - b.end);
  return kept;
}

export function unionSpans(groups: Span[][]): Span[] {
  const map = new Map<string, Span>();
  for (const span of groups.flat()) {
    if (span.end <= span.start) continue;
    const key = `${span.start}:${span.end}:${span.type}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...span });
      continue;
    }
    if (existing.source !== span.source) existing.source = "both";
    if (!existing.hint && span.hint) existing.hint = span.hint;
  }
  return resolveNonOverlapping([...map.values()]);
}

export type TextSegment = {
  text: string;
  span: Span | null;
};

export function segmentText(text: string, spans: Span[]): TextSegment[] {
  const chosen = resolveNonOverlapping(spans).filter(
    (span) => span.start >= 0 && span.end <= text.length && text.slice(span.start, span.end) === span.text,
  );
  const parts: TextSegment[] = [];
  let cursor = 0;
  for (const span of chosen) {
    if (span.start < cursor) continue;
    if (span.start > cursor) {
      parts.push({ text: text.slice(cursor, span.start), span: null });
    }
    parts.push({ text: span.text, span });
    cursor = span.end;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), span: null });
  return parts;
}

export function spanFromSelection(
  text: string,
  selected: string,
  type: IdentifierType,
  fromIndex = 0,
): Span | null {
  const needle = selected.trim();
  if (!needle) return null;
  const start = text.indexOf(needle, fromIndex);
  if (start < 0) return null;
  const end = start + needle.length;
  return {
    id: `${type}:${start}:${end}`,
    type,
    text: needle,
    start,
    end,
    source: "user",
    included: true,
    hint: "Added by staff",
  };
}

export function alignModelSpan(
  source: string,
  raw: { type: IdentifierType; text: string; start?: number; end?: number },
): Span | null {
  const value = raw.text?.trim();
  if (!value) return null;
  let start = typeof raw.start === "number" ? raw.start : -1;
  let end = typeof raw.end === "number" ? raw.end : -1;
  if (start < 0 || end > source.length || source.slice(start, end) !== value) {
    start = source.indexOf(value);
    end = start + value.length;
  }
  if (start < 0) return null;
  return {
    id: `${raw.type}:${start}:${end}`,
    type: raw.type,
    text: value,
    start,
    end,
    source: "model",
    included: true,
  };
}
