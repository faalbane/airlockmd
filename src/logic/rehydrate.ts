import type { TokenMap } from "../types";

const TOKEN_PATTERN = /\[([A-Z][A-Z0-9_]*_\d+)\]/g;

/**
 * Swap tokens for the original values in one pass.
 * Values are not scanned again, so a restored name cannot create a new token.
 */
export function rehydrate(text: string, tokenMap: TokenMap): string {
  return text.replace(TOKEN_PATTERN, (full, key: string) => {
    const entry = tokenMap[`[${key}]`];
    return entry ? entry.text : full;
  });
}

export function unknownTokens(text: string, tokenMap: TokenMap): string[] {
  const missing: string[] = [];
  for (const match of text.matchAll(TOKEN_PATTERN)) {
    const token = `[${match[1]}]`;
    if (!tokenMap[token] && !missing.includes(token)) missing.push(token);
  }
  return missing;
}
