import type { OutboundPayload, Span, TokenMap } from "../types";
import { stripQuoted } from "./integrity";
import { buildOutboundPayload } from "./payload";
import { assertPayloadHasNoSecrets } from "./safety";
import { secretsFromMap, tokenize } from "./tokenizer";

export type PreparedAirlock = {
  tokenized: string;
  tokenMap: TokenMap;
  payload: OutboundPayload;
  json: string;
  secrets: string[];
};

export function prepareAirlock(input: {
  text: string;
  spans: Span[];
  injectionQuotes: string[];
  payer: string;
  denialReason: string;
  policyVersion: string;
  existingMap?: TokenMap | null;
}): PreparedAirlock {
  const base = input.existingMap
    ? { tokenized: input.text, tokenMap: input.existingMap }
    : tokenize(input.text, input.spans);
  const forwarded = stripQuoted(base.tokenized, input.injectionQuotes);
  const payload = buildOutboundPayload({
    payer: input.payer,
    denialReason: input.denialReason,
    clinicalSummary: forwarded,
    policyVersion: input.policyVersion,
  });
  const secrets = secretsFromMap(base.tokenMap);
  assertPayloadHasNoSecrets(payload, secrets);
  return {
    tokenized: forwarded,
    tokenMap: base.tokenMap,
    payload,
    json: JSON.stringify(payload, null, 2),
    secrets,
  };
}

export function entityCounts(spans: Span[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const span of spans) {
    if (!span.included) continue;
    counts[span.type] = (counts[span.type] ?? 0) + 1;
  }
  return counts;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
