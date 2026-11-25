import type { AuditStep, InferenceBadge, RouteMode } from "../types";

export type AuditRecord = {
  step: AuditStep;
  mode: RouteMode;
  inferenceSource: InferenceBadge;
  entityCounts: Record<string, number>;
  injectionBlocked: boolean;
  policyVersion: string;
  payloadHash: string;
};

const STEPS = new Set<AuditStep>(["detect", "scan", "release", "appeal", "leak_check", "handout"]);
const MODES = new Set<RouteMode>([
  "ONLY_ON_DEVICE",
  "ONLY_IN_CLOUD",
  "PREFER_ON_DEVICE",
  "LOCAL_REHEARSAL",
  "NONE",
]);
const SOURCES = new Set<InferenceBadge>(["ON_DEVICE", "IN_CLOUD", "LOCAL_REHEARSAL", "BLOCKED"]);

export function normalizeInferenceSource(
  value: string | undefined | null,
  fallback: InferenceBadge,
): InferenceBadge {
  const normalized = (value ?? "").toLowerCase().replace("-", "_");
  if (normalized === "on_device") return "ON_DEVICE";
  if (normalized === "in_cloud") return "IN_CLOUD";
  if (normalized === "local_rehearsal") return "LOCAL_REHEARSAL";
  if (normalized === "blocked") return "BLOCKED";
  return fallback;
}

/** Drop anything that is not audit metadata. Identifiers never ride along. */
export function toAuditRecord(input: AuditRecord & Record<string, unknown>): AuditRecord {
  if (!STEPS.has(input.step) || !MODES.has(input.mode) || !SOURCES.has(input.inferenceSource)) {
    throw new Error("Audit record has a field the ledger does not allow.");
  }
  const entityCounts: Record<string, number> = {};
  for (const [key, value] of Object.entries(input.entityCounts)) {
    if (typeof value === "number" && Number.isFinite(value)) entityCounts[key] = value;
  }
  return {
    step: input.step,
    mode: input.mode,
    inferenceSource: input.inferenceSource,
    entityCounts,
    injectionBlocked: Boolean(input.injectionBlocked),
    policyVersion: String(input.policyVersion).slice(0, 39),
    payloadHash: String(input.payloadHash).slice(0, 79),
  };
}
