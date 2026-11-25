import type { Policy } from "../types";

export class AirlockBlocked extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AirlockBlocked";
  }
}

export function findSecrets(text: string, secrets: string[]): string[] {
  const haystack = text.toLowerCase();
  const hits: string[] = [];
  for (const secret of secrets) {
    const value = secret.trim();
    if (value.length < 3) continue;
    if (haystack.includes(value.toLowerCase()) && !hits.some((hit) => hit.toLowerCase() === value.toLowerCase())) {
      hits.push(value);
    }
  }
  return hits;
}

/**
 * Hard rule: never run PREFER_ON_DEVICE, or any mode that can fall back to the
 * cloud, on text that still contains identifiers. Call this on the exact string
 * that would be sent, and do it before rehydration.
 */
export function assertSafeForCloudFallback(text: string, secrets: string[]): void {
  const hits = findSecrets(text, secrets);
  if (hits.length > 0) {
    throw new AirlockBlocked(
      "Refusing a cloud-capable model call because the text still contains identifiers.",
    );
  }
  if (text.includes("data:image") || text.includes("inlineData")) {
    throw new AirlockBlocked("Refusing to send image data to a cloud-capable model call.");
  }
}

export function assertPayloadHasNoSecrets(payload: unknown, secrets: string[]): void {
  const json = JSON.stringify(payload);
  assertSafeForCloudFallback(json, secrets);
}

/**
 * Remote Config cannot open a path that sends raw identifiers to the cloud.
 * The flag is recorded so the ledger can show the requested value. The gate stays shut.
 */
export function cloudFallbackAllowed(_policy: Policy): boolean {
  return false;
}

export function assertImageOnDeviceOnly(mode: string): void {
  if (mode !== "ONLY_ON_DEVICE") {
    throw new AirlockBlocked("Images are allowed only on ONLY_ON_DEVICE. They are not uploaded.");
  }
}
