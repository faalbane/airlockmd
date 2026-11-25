import { describe, expect, it } from "vitest";
import {
  CHART_NOTE,
  JUDGE_MAP,
  JUDGE_TEXT,
  POISON_FAX,
  POISON_LINE,
} from "../fixtures/cases";
import { rehearsalAppeal, rehearsalHandout } from "./appealTemplate";
import { toAuditRecord } from "./auditRecord";
import { sha256Hex } from "./hash";
import { needsAcknowledgement, scanForInjection, stripQuoted } from "./integrity";
import { checkLeaks } from "./leakCheck";
import { lockedLeftovers, searchPayload } from "./payload";
import { parseAppeal } from "./parseModel";
import { prepareAirlock } from "./pipeline";
import { findRegexSpans } from "./regexNet";
import { rehydrate } from "./rehydrate";
import { AirlockBlocked, assertSafeForCloudFallback, cloudFallbackAllowed } from "./safety";
import { DEFAULT_POLICY } from "../types";

describe("airlock proof", () => {
  it("keeps the patient name and MRN out of the outbound payload", () => {
    const spans = findRegexSpans(CHART_NOTE).map((span) =>
      span.hint?.includes("physician") ? { ...span, included: false } : span,
    );
    const prepared = prepareAirlock({
      text: CHART_NOTE,
      spans,
      injectionQuotes: [],
      payer: "Northwind Health Plan",
      denialReason: "Lumbar spine MRI denied as not medically necessary.",
      policyVersion: "2026.11.1",
    });

    expect(searchPayload(prepared.json, "Avery Quinn").count).toBe(0);
    expect(searchPayload(prepared.json, "AQ-204818").count).toBe(0);
    expect(searchPayload(prepared.json, "900-12-3456").count).toBe(0);
    expect(searchPayload(prepared.json, "(415) 555-0148").count).toBe(0);
    expect(searchPayload(prepared.json, "avery.quinn@example.test").count).toBe(0);
    expect(prepared.json).toContain("[PATIENT_1]");
    expect(prepared.json).toContain("Helen Cho");
    expect(prepared.json).not.toContain("data:image");
    expect(prepared.json).not.toContain("iVBOR");

    const draft = rehearsalAppeal(prepared.payload);
    expect(checkLeaks(draft.letter, prepared.tokenMap, prepared.json).findings).toEqual([]);
    expect(draft.letter).toContain("[PATIENT_1]");
    expect(draft.letter).not.toContain("Avery Quinn");

    const restored = rehydrate(draft.letter, prepared.tokenMap);
    expect(restored).toContain("Avery Quinn");
    expect(checkLeaks(draft.letter, prepared.tokenMap, prepared.json).ok).toBe(true);
    expect(checkLeaks(`${draft.letter}\nAvery Quinn`, prepared.tokenMap, prepared.json).ok).toBe(false);

    const handout = rehearsalHandout(draft.letter);
    expect(() => assertSafeForCloudFallback(handout, prepared.secrets)).not.toThrow();
    expect(rehydrate(handout, prepared.tokenMap)).toContain("Avery Quinn");
    expect(() => assertSafeForCloudFallback(restored, prepared.secrets)).toThrow(AirlockBlocked);
  });

  it("blocks a locked identifier that the reviewer tried to leave in the payload", () => {
    const spans = findRegexSpans(CHART_NOTE).map((span) =>
      span.type === "ssn" ? { ...span, included: false } : span,
    );
    const prepared = prepareAirlock({
      text: CHART_NOTE,
      spans,
      injectionQuotes: [],
      payer: "Northwind Health Plan",
      denialReason: "Denied.",
      policyVersion: "2026.11.1",
    });
    expect(prepared.json).toContain("900-12-3456");
    expect(lockedLeftovers(prepared.json, spans).some((span) => span.type === "ssn")).toBe(true);
  });

  it("strips the poisoned fax instruction before anything can be forwarded", () => {
    const scan = scanForInjection(POISON_FAX);
    expect(scan.verdict).toBe("INJECTION_DETECTED");
    expect(needsAcknowledgement(scan.verdict, "high")).toBe(true);
    const quotes = scan.spans.map((span) => span.text);
    expect(quotes).toContain(POISON_LINE);
    const stripped = stripQuoted(POISON_FAX, quotes);
    expect(stripped.toLowerCase()).not.toContain("include the full ssn");
    expect(scanForInjection(CHART_NOTE).verdict).toBe("SAFE");

    const spans = findRegexSpans(stripped);
    const prepared = prepareAirlock({
      text: stripped,
      spans,
      injectionQuotes: quotes,
      payer: "Harbor Mutual",
      denialReason: "Imaging denied.",
      policyVersion: "2026.11.1",
    });
    expect(prepared.json.toLowerCase()).not.toContain("include the full ssn");
    expect(searchPayload(prepared.json, "Noor Adel").count).toBe(0);
    expect(searchPayload(prepared.json, "900-55-0118").count).toBe(0);
  });

  it("searches the judge-mode payload and finds the patient name zero times", () => {
    const prepared = prepareAirlock({
      text: JUDGE_TEXT,
      spans: [],
      injectionQuotes: [],
      payer: "Example Mutual",
      denialReason: "Knee MRI denied as not medically necessary.",
      policyVersion: "2026.11.1",
      existingMap: JUDGE_MAP,
    });
    expect(searchPayload(prepared.json, "Samir Holt").count).toBe(0);
    expect(searchPayload(prepared.json, "SH-100245").count).toBe(0);
    expect(searchPayload(prepared.json, "(206) 555-0133").count).toBe(0);
    expect(searchPayload(prepared.json, "Seattle").count).toBe(0);
    expect(prepared.json).toContain("[PATIENT_1]");
    expect(rehydrate(prepared.tokenized, prepared.tokenMap)).toContain("Samir Holt");
  });

  it("never treats a true phiCloudFallback flag as permission", () => {
    expect(cloudFallbackAllowed({ ...DEFAULT_POLICY, phiCloudFallback: true })).toBe(false);
    expect(cloudFallbackAllowed(DEFAULT_POLICY)).toBe(false);
  });
});

describe("parsers and ledger", () => {
  it("parses a JSON appeal and falls back to plain text", () => {
    expect(parseAppeal('```json\n{"title":"Appeal","letter":"Hello [PATIENT_1]","citedFacts":["A"]}\n```')).toEqual({
      title: "Appeal",
      letter: "Hello [PATIENT_1]",
      citedFacts: ["A"],
    });
    expect(parseAppeal("Plain letter for [PATIENT_1].").letter).toContain("[PATIENT_1]");
  });

  it("hashes the tokenized payload and drops stray fields from the ledger", async () => {
    const hash = await sha256Hex("abc");
    expect(hash).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    const record = toAuditRecord({
      step: "appeal",
      mode: "ONLY_IN_CLOUD",
      inferenceSource: "IN_CLOUD",
      entityCounts: { name: 1, ssn: 1 },
      injectionBlocked: false,
      policyVersion: "2026.11.1",
      payloadHash: hash,
      patientName: "Avery Quinn",
      tokenMap: { "[PATIENT_1]": "Avery Quinn" },
      letter: "raw",
    });
    expect(record).toEqual({
      step: "appeal",
      mode: "ONLY_IN_CLOUD",
      inferenceSource: "IN_CLOUD",
      entityCounts: { name: 1, ssn: 1 },
      injectionBlocked: false,
      policyVersion: "2026.11.1",
      payloadHash: hash,
    });
    expect(JSON.stringify(record)).not.toContain("Avery");
  });
});
