import type { OutboundPayload, Span } from "../types";

const LOCKED_TYPES = new Set(["ssn", "email", "telephone", "fax", "mrn", "health_plan_id", "account_number"]);

export function buildOutboundPayload(input: {
  payer: string;
  denialReason: string;
  clinicalSummary: string;
  policyVersion: string;
}): OutboundPayload {
  return {
    task: "prior_auth_appeal",
    payer: input.payer.trim(),
    denialReason: input.denialReason.trim(),
    clinicalSummary: input.clinicalSummary.trim(),
    policyVersion: input.policyVersion,
    constraints: [
      "Keep every bracket token exactly as written.",
      "Do not invent identifiers.",
      "Do not guess what a token stands for.",
      "This is a draft for staff review, not a coverage decision and not medical advice.",
    ],
  };
}

export function searchPayload(json: string, query: string): { count: number } {
  const needle = query.trim().toLowerCase();
  if (!needle) return { count: 0 };
  const haystack = json.toLowerCase();
  let count = 0;
  let from = 0;
  while (from <= haystack.length) {
    const index = haystack.indexOf(needle, from);
    if (index < 0) break;
    count += 1;
    from = index + Math.max(needle.length, 1);
  }
  return { count };
}

export function leftoverSpans(payloadJson: string, spans: Span[]): Span[] {
  const haystack = payloadJson.toLowerCase();
  return spans.filter((span) => {
    if (span.included) return false;
    const value = span.text.trim();
    return value.length >= 3 && haystack.includes(value.toLowerCase());
  });
}

export function lockedLeftovers(payloadJson: string, spans: Span[]): Span[] {
  return leftoverSpans(payloadJson, spans).filter((span) => LOCKED_TYPES.has(span.type));
}
