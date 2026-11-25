import type { ScanResult, Verdict } from "../types";

const INJECTION: RegExp[] = [
  /ignore (?:all |any |prior |previous |above |the ){0,3}instructions/i,
  /include the full ssn/i,
  /disregard (?:all |any |prior |previous |the ){0,3}(?:instructions|rules|policy)/i,
  /exfiltrate/i,
  /print the (?:full )?(?:ssn|social security)/i,
  /send (?:me )?(?:the )?(?:raw )?(?:phi|identifiers|token map)/i,
];

const SUSPICIOUS: RegExp[] = [
  /you are now/i,
  /system prompt/i,
  /do not redact/i,
  /override (?:the )?redaction/i,
];

const RANK: Record<Verdict, number> = {
  SAFE: 0,
  SUSPICIOUS: 1,
  INJECTION_DETECTED: 2,
};

export function mergeVerdict(left: Verdict, right: Verdict): Verdict {
  return RANK[left] >= RANK[right] ? left : right;
}

export function scanForInjection(text: string): ScanResult {
  const spans: ScanResult["spans"] = [];
  let verdict: Verdict = "SAFE";
  const seen = new Set<string>();

  for (const line of text.split(/\n/)) {
    const trimmed = line.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    if (INJECTION.some((pattern) => pattern.test(trimmed))) {
      verdict = "INJECTION_DETECTED";
      seen.add(trimmed);
      spans.push({ text: trimmed, reason: "Hidden or pasted instruction." });
      continue;
    }
    if (SUSPICIOUS.some((pattern) => pattern.test(trimmed))) {
      verdict = mergeVerdict(verdict, "SUSPICIOUS");
      seen.add(trimmed);
      spans.push({ text: trimmed, reason: "Untrusted instruction-like language." });
    }
  }

  return { verdict, spans };
}

export function stripQuoted(text: string, quotes: string[]): string {
  let out = text;
  for (const quote of quotes) {
    const trimmed = quote.trim();
    if (trimmed.length < 8) continue;
    out = out.split(trimmed).join("");
  }
  return out
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function needsAcknowledgement(
  verdict: Verdict,
  strictness: "high" | "standard",
): boolean {
  if (verdict === "INJECTION_DETECTED") return true;
  return verdict === "SUSPICIOUS" && strictness === "high";
}
