import { describe, expect, it } from "vitest";
import type { TokenMap } from "../types";
import { rehydrate, unknownTokens } from "./rehydrate";

const map: TokenMap = {
  "[PATIENT_1]": { type: "name", text: "Avery Quinn" },
  "[PATIENT_10]": { type: "name", text: "Samir Holt" },
  "[SSN_1]": { type: "ssn", text: "900-12-3456" },
};

describe("rehydrate", () => {
  it("restores every known token in one pass", () => {
    const text = "Member [PATIENT_1] and [PATIENT_10], SSN [SSN_1].";
    expect(rehydrate(text, map)).toBe("Member Avery Quinn and Samir Holt, SSN 900-12-3456.");
  });

  it("leaves unknown tokens in place", () => {
    const text = "See [PATIENT_2] and [MRN_9].";
    expect(rehydrate(text, map)).toBe(text);
    expect(unknownTokens(text, map)).toEqual(["[PATIENT_2]", "[MRN_9]"]);
  });

  it("does not rescan a restored value that contains bracket text", () => {
    const tricky: TokenMap = {
      "[PATIENT_1]": { type: "name", text: "Name [SSN_1]" },
      "[SSN_1]": { type: "ssn", text: "900-12-3456" },
    };
    expect(rehydrate("Who: [PATIENT_1]", tricky)).toBe("Who: Name [SSN_1]");
  });

  it("round trips a tokenized sentence", () => {
    const original = "Patient Avery Quinn, SSN 900-12-3456.";
    const tokenized = "Patient [PATIENT_1], SSN [SSN_1].";
    expect(rehydrate(tokenized, map)).toBe(original);
  });

  it("restores tokens whose prefix contains an underscore", () => {
    const planMap: TokenMap = {
      ...map,
      "[PLAN_ID_1]": { type: "health_plan_id", text: "NW-441290" },
    };
    expect(rehydrate("member [PLAN_ID_1] for [PATIENT_1]", planMap)).toBe("member NW-441290 for Avery Quinn");
    expect(unknownTokens("member [PLAN_ID_1]", planMap)).toEqual([]);
  });
});
