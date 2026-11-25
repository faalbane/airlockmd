import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..", "..");

function filesUnder(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry === "dist") continue;
      filesUnder(path, found);
    } else if (/\.(md|ts|tsx)$/.test(entry)) {
      found.push(path);
    }
  }
  return found;
}

describe("prose", () => {
  it("does not use em or en dashes in project prose or source", () => {
    const paths = [
      join(ROOT, "README.md"),
      join(ROOT, "DEPLOY.md"),
      ...filesUnder(join(ROOT, "docs")),
      ...filesUnder(join(ROOT, "src")),
    ];
    const hits: string[] = [];
    for (const path of paths) {
      const text = readFileSync(path, "utf8");
      const banned = [String.fromCharCode(0x2013), String.fromCharCode(0x2014), "&" + "mdash;", "&" + "ndash;"];
      if (banned.some((token) => text.includes(token))) hits.push(path.replace(`${ROOT}/`, ""));
    }
    expect(hits).toEqual([]);
  });
});
