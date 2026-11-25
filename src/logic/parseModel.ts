import { IDENTIFIER_TYPES, type IdentifierType } from "../types";
import type { AppealDraft } from "./appealTemplate";
import type { ScanResult, Verdict } from "../types";

export type ParsedEntities = {
  entities: { type: IdentifierType; text: string; start?: number; end?: number }[];
  extractedText: string;
};

function stripFence(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

function isIdentifierType(value: string): value is IdentifierType {
  return (IDENTIFIER_TYPES as readonly string[]).includes(value);
}

export function parseIdentifierResponse(text: string): ParsedEntities {
  const parsed = JSON.parse(stripFence(text)) as {
    entities?: { type?: string; text?: string; start?: number; end?: number }[];
    extractedText?: string;
  };
  const entities = Array.isArray(parsed.entities)
    ? parsed.entities.flatMap((entity) => {
        if (!entity || typeof entity.text !== "string" || typeof entity.type !== "string") return [];
        if (!isIdentifierType(entity.type)) return [];
        return [
          {
            type: entity.type,
            text: entity.text,
            start: typeof entity.start === "number" ? entity.start : undefined,
            end: typeof entity.end === "number" ? entity.end : undefined,
          },
        ];
      })
    : [];
  return {
    entities,
    extractedText: typeof parsed.extractedText === "string" ? parsed.extractedText : "",
  };
}

export function parseAppeal(text: string): AppealDraft {
  const cleaned = stripFence(text);
  try {
    const parsed = JSON.parse(cleaned) as { title?: unknown; letter?: unknown; citedFacts?: unknown };
    if (typeof parsed.letter === "string" && parsed.letter.trim()) {
      return {
        title: typeof parsed.title === "string" && parsed.title.trim() ? parsed.title : "Appeal draft",
        letter: parsed.letter,
        citedFacts: Array.isArray(parsed.citedFacts) ? parsed.citedFacts.map((item) => String(item)) : [],
      };
    }
  } catch {
    // Grounding plus a response schema can fail. A plain letter is still usable.
  }
  return {
    title: "Appeal draft",
    letter: cleaned,
    citedFacts: [],
  };
}

export function parseInjectionResponse(text: string): ScanResult | null {
  try {
    const parsed = JSON.parse(stripFence(text)) as {
      verdict?: string;
      spans?: { text?: string; reason?: string }[];
    };
    const verdict = parsed.verdict;
    if (verdict !== "SAFE" && verdict !== "SUSPICIOUS" && verdict !== "INJECTION_DETECTED") return null;
    const spans = Array.isArray(parsed.spans)
      ? parsed.spans.flatMap((span) => {
          if (!span || typeof span.text !== "string" || !span.text.trim()) return [];
          return [{ text: span.text.trim(), reason: span.reason?.trim() || "Flagged by the on-device scan." }];
        })
      : [];
    return { verdict: verdict as Verdict, spans };
  } catch {
    return null;
  }
}

export function parseLeakResponse(text: string): { verdict: "CLEAN" | "LEAK"; spans: { text: string; reason: string }[] } | null {
  try {
    const parsed = JSON.parse(stripFence(text)) as {
      verdict?: string;
      spans?: { text?: string; reason?: string }[];
    };
    if (parsed.verdict !== "CLEAN" && parsed.verdict !== "LEAK") return null;
    const spans = Array.isArray(parsed.spans)
      ? parsed.spans.flatMap((span) => {
          if (!span || typeof span.text !== "string") return [];
          return [{ text: span.text, reason: span.reason?.trim() || "Flagged by the on-device leak check." }];
        })
      : [];
    return { verdict: parsed.verdict, spans };
  } catch {
    return null;
  }
}
