import { describe, expect, it } from "vitest";
import type { Span } from "../types";
import { findRegexSpans } from "./regexNet";
import { tokenize } from "./tokenizer";
import { rehydrate } from "./rehydrate";

function span(partial: Pick<Span, "type" | "text" | "start" | "end"> & { included?: boolean }): Span {
  return {
    id: `${partial.type}:${partial.start}:${partial.end}`,
    source: "user",
    included: partial.included ?? true,
    ...partial,
  };
}

describe("tokenizer", () => {
  it("replaces spans with stable typed tokens and reuses the same value", () => {
    const text = "Patient Avery Quinn saw Avery Quinn. SSN 900-12-3456.";
    const first = text.indexOf("Avery Quinn");
    const second = text.indexOf("Avery Quinn", first + 1);
    const ssnAt = text.indexOf("900-12-3456");
    const spans = [
      span({ type: "name", text: "Avery Quinn", start: first, end: first + "Avery Quinn".length }),
      span({ type: "name", text: "Avery Quinn", start: second, end: second + "Avery Quinn".length }),
      span({ type: "ssn", text: "900-12-3456", start: ssnAt, end: ssnAt + "900-12-3456".length }),
    ];
    const { tokenized, tokenMap } = tokenize(text, spans);
    expect(tokenized).toBe("Patient [PATIENT_1] saw [PATIENT_1]. SSN [SSN_1].");
    expect(tokenMap["[PATIENT_1]"]).toEqual({ type: "name", text: "Avery Quinn" });
    expect(tokenMap["[SSN_1]"]).toEqual({ type: "ssn", text: "900-12-3456" });
    expect(rehydrate(tokenized, tokenMap)).toBe(text);
  });

  it("numbers distinct names and skips spans the reviewer removed", () => {
    const text = "Patient Avery Quinn. Dr. Helen Cho.";
    const spans = [
      span({ type: "name", text: "Avery Quinn", start: 8, end: 19 }),
      span({ type: "name", text: "Helen Cho", start: 25, end: 34, included: false }),
    ];
    const { tokenized, tokenMap } = tokenize(text, spans);
    expect(tokenized).toBe("Patient [PATIENT_1]. Dr. Helen Cho.");
    expect(tokenMap["[PATIENT_2]"]).toBeUndefined();
    expect(Object.keys(tokenMap)).toEqual(["[PATIENT_1]"]);
  });

  it("drops an overlapping lower priority span instead of corrupting the text", () => {
    const text = "Call (415) 555-0148 today.";
    const spans = [
      span({ type: "telephone", text: "(415) 555-0148", start: 5, end: 19 }),
      span({ type: "other_unique_id", text: "555-0148", start: 11, end: 19 }),
    ];
    const { tokenized } = tokenize(text, spans);
    expect(tokenized).toBe("Call [PHONE_1] today.");
  });

  it("ignores a span whose offsets do not match the source text", () => {
    const text = "MRN AQ-204818";
    const spans = [span({ type: "mrn", text: "AQ-999999", start: 4, end: 13 })];
    const { tokenized, tokenMap } = tokenize(text, spans);
    expect(tokenized).toBe(text);
    expect(tokenMap).toEqual({});
  });
});

describe("regex net on the synthetic chart", () => {
  it("finds the patient, the physician, and the obvious patterns", async () => {
    const { CHART_NOTE } = await import("../fixtures/cases");
    const spans = findRegexSpans(CHART_NOTE);
    const texts = spans.map((item) => item.text);
    expect(texts).toContain("Avery Quinn");
    expect(texts).toContain("Helen Cho");
    expect(texts).toContain("900-12-3456");
    expect(texts).toContain("(415) 555-0148");
    expect(texts).toContain("avery.quinn@example.test");
    expect(texts).toContain("AQ-204818");
    expect(texts).toContain("NW-441290");
    expect(texts).toContain("418 Harbor Lane");
    expect(texts).toContain("Oakland, CA 94607");
    expect(texts).toContain("March 14, 1978");
    expect(spans.find((item) => item.text === "Helen Cho")?.hint).toContain("physician");
  });
});
