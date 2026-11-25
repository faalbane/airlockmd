import type { LeakCheck, LeakFinding, TokenMap } from "../types";
import { findRegexSpans } from "./regexNet";
import { secretsFromMap } from "./tokenizer";

const TOKEN_PATTERN = /\[[A-Z][A-Z0-9_]*_\d+\]/g;

/**
 * Inspect cloud output before names are restored.
 * Tokens are expected. Raw values from the token map are not.
 * A pattern that was already in the released payload (a span the reviewer
 * chose to leave in) is not a new leak.
 */
export function checkLeaks(cloudText: string, tokenMap: TokenMap, releasedText = ""): LeakCheck {
  const findings: LeakFinding[] = [];
  const haystack = cloudText.toLowerCase();
  const released = releasedText.toLowerCase();

  for (const [token, entry] of Object.entries(tokenMap)) {
    const value = entry.text.trim();
    if (value.length < 3) continue;
    if (haystack.includes(value.toLowerCase())) {
      findings.push({
        kind: "known_identifier",
        detail: `The draft contains the raw value held for ${token}.`,
        value,
      });
    }
  }

  const masked = cloudText.replace(TOKEN_PATTERN, " ");
  for (const span of findRegexSpans(masked)) {
    const value = span.text.trim();
    const already = findings.some((finding) => finding.value.toLowerCase() === value.toLowerCase());
    if (already) continue;
    if (value.length >= 3 && released.includes(value.toLowerCase())) continue;
    findings.push({
      kind: "pattern",
      detail: `The draft matches a ${span.type} pattern that is not a token.`,
      value,
    });
  }

  return { ok: findings.length === 0, findings };
}

export function collectSecrets(tokenMap: TokenMap): string[] {
  return secretsFromMap(tokenMap);
}
