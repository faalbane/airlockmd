import type { IdentifierType, Span } from "../types";

type Rule = {
  type: IdentifierType;
  source: string;
  flags: string;
  group?: number;
  hint?: string;
};

const RULES: Rule[] = [
  { type: "ssn", source: String.raw`\b\d{3}-\d{2}-\d{4}\b`, flags: "g" },
  {
    type: "email",
    source: String.raw`\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b`,
    flags: "g",
  },
  { type: "url", source: String.raw`\bhttps?:\/\/[^\s<>"]+`, flags: "gi" },
  {
    type: "ip",
    source: String.raw`\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b`,
    flags: "g",
  },
  {
    type: "fax",
    source: String.raw`\b[Ff]ax[:\s]+(?:\+1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]\d{3}[\s.-]\d{4}\b`,
    flags: "g",
  },
  {
    type: "telephone",
    source: String.raw`(?:\+1[\s.-]?)?(?:\(\d{3}\)|\b\d{3})[\s.-]\d{3}[\s.-]\d{4}\b`,
    flags: "g",
  },
  {
    type: "mrn",
    source: String.raw`\bMRN\s*[:#]?\s*([A-Z]{1,6}-?\d{3,})\b`,
    flags: "g",
    group: 1,
  },
  {
    type: "health_plan_id",
    source: String.raw`\bMember ID\s*[:#]?\s*([A-Z0-9]+(?:-[A-Z0-9]+)+)\b`,
    flags: "g",
    group: 1,
  },
  {
    type: "date",
    source: String.raw`\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},\s+\d{4})\b`,
    flags: "g",
  },
  {
    type: "name",
    source: String.raw`\bPatient:[ \t]*([A-Z][a-z]+(?:[ \t]+[A-Z][a-z]+){1,2})\b`,
    flags: "g",
    group: 1,
    hint: "Patient name",
  },
  {
    type: "name",
    source: String.raw`\bDr\.[ \t]+([A-Z][a-z]+(?:[ \t]+[A-Z][a-z]+){0,2})\b`,
    flags: "g",
    group: 1,
    hint: "Possible physician name. Remove this span if it is an over-redaction.",
  },
  {
    type: "geographic_subdivision",
    source: String.raw`\b\d{1,5}\s+(?:[A-Z][A-Za-z]+\s+){1,4}(?:Lane|Street|Avenue|Ave|Court|Road|Boulevard|Blvd|Drive)\b`,
    flags: "g",
    hint: "Street address",
  },
  {
    type: "geographic_subdivision",
    source: String.raw`\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?,\s+[A-Z]{2}\s+\d{5}(?:-\d{4})?\b`,
    flags: "g",
    hint: "City, state, and ZIP",
  },
];

function pushMatch(spans: Span[], rule: Rule, match: RegExpMatchArray): void {
  const index = match.index ?? 0;
  let text = match[0];
  let start = index;
  if (rule.group && match[rule.group]) {
    const value = match[rule.group];
    const offset = match[0].indexOf(value);
    if (offset >= 0) {
      text = value;
      start = index + offset;
    }
  }
  text = text.trim();
  if (!text) return;
  const end = start + text.length;
  spans.push({
    id: `${rule.type}:${start}:${end}`,
    type: rule.type,
    text,
    start,
    end,
    source: "regex",
    included: true,
    hint: rule.hint,
  });
}

export function findRegexSpans(text: string): Span[] {
  const spans: Span[] = [];
  for (const rule of RULES) {
    const re = new RegExp(rule.source, rule.flags);
    for (const match of text.matchAll(re)) {
      pushMatch(spans, rule, match);
    }
  }
  const seen = new Set<string>();
  return spans.filter((span) => {
    if (seen.has(span.id)) return false;
    seen.add(span.id);
    return true;
  });
}
