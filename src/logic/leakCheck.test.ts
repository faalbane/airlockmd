import { describe, expect, it } from "vitest";
import type { TokenMap } from "../types";
import { checkLeaks } from "./leakCheck";

const tokenMap: TokenMap = {
  "[PATIENT_1]": { type: "name", text: "Avery Quinn" },
  "[SSN_1]": { type: "ssn", text: "900-12-3456" },
  "[PHONE_1]": { type: "telephone", text: "(415) 555-0148" },
  "[MRN_1]": { type: "mrn", text: "AQ-204818" },
};

const clean = "Please review [PATIENT_1], member [MRN_1], phone [PHONE_1], SSN [SSN_1].";

describe("leak check", () => {
  it("passes a tokenized cloud letter", () => {
    expect(checkLeaks(clean, tokenMap).ok).toBe(true);
    expect(checkLeaks(clean, tokenMap).findings).toEqual([]);
  });

  it("flags a patient name echoed by the cloud, in any case", () => {
    const result = checkLeaks(`${clean}\nPatient avery quinn remains in pain.`, tokenMap);
    expect(result.ok).toBe(false);
    expect(result.findings.some((finding) => finding.kind === "known_identifier" && finding.value === "Avery Quinn")).toBe(
      true,
    );
  });

  it("flags an SSN or phone that is not one of our tokens", () => {
    const ssn = checkLeaks("Call the member at 900-55-0118.", tokenMap);
    expect(ssn.ok).toBe(false);
    expect(ssn.findings.some((finding) => finding.value === "900-55-0118")).toBe(true);

    const phone = checkLeaks("Reach (503) 555-0194 for records.", tokenMap);
    expect(phone.ok).toBe(false);
    expect(phone.findings.some((finding) => finding.value === "(503) 555-0194")).toBe(true);
  });

  it("allows a name the reviewer already released", () => {
    const letter = `${clean}\nReferring physician: Dr. Helen Cho.`;
    expect(checkLeaks(letter, tokenMap, "Referring physician: Dr. Helen Cho.").ok).toBe(true);
    expect(checkLeaks(letter, tokenMap).ok).toBe(false);
  });

  it("does not treat the token itself as a leak", () => {
    const result = checkLeaks("Token [SSN_1] and [PATIENT_1] stay in the letter.", tokenMap);
    expect(result.ok).toBe(true);
  });

  it("checks the cloud text, not the restored laptop copy", () => {
    const restored = "Please review Avery Quinn.";
    expect(checkLeaks(clean, tokenMap).ok).toBe(true);
    expect(checkLeaks(restored, tokenMap).ok).toBe(false);
  });
});
