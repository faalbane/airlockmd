import { describe, expect, it } from "vitest";
import { createSessionKey, decryptJson, encryptJson } from "./sessionCrypto";

describe("session crypto", () => {
  it("round trips a token map and does not store the name in the ciphertext as plaintext", async () => {
    const key = await createSessionKey();
    const map = { "[PATIENT_1]": { type: "name", text: "Avery Quinn" } };
    const sealed = await encryptJson(key, map);
    expect(sealed.data.includes("Avery")).toBe(false);
    expect(sealed.iv).not.toBe(sealed.data);
    const opened = await decryptJson<typeof map>(key, sealed);
    expect(opened).toEqual(map);
  });
});
