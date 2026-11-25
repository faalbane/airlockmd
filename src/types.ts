export const IDENTIFIER_TYPES = [
  "name",
  "geographic_subdivision",
  "date",
  "telephone",
  "fax",
  "email",
  "ssn",
  "mrn",
  "health_plan_id",
  "account_number",
  "certificate_license",
  "vehicle_id",
  "device_id",
  "url",
  "ip",
  "biometric",
  "face_photo",
  "other_unique_id",
] as const;

export type IdentifierType = (typeof IDENTIFIER_TYPES)[number];

export type SpanSource = "regex" | "model" | "user" | "both";

export type Span = {
  id: string;
  type: IdentifierType;
  text: string;
  start: number;
  end: number;
  source: SpanSource;
  included: boolean;
  hint?: string;
};

export type TokenEntry = {
  type: IdentifierType;
  text: string;
};

/** Keys include brackets, for example `[PATIENT_1]`. */
export type TokenMap = Record<string, TokenEntry>;

export type Verdict = "SAFE" | "SUSPICIOUS" | "INJECTION_DETECTED";

export type InjectionSpan = {
  text: string;
  reason: string;
};

export type ScanResult = {
  verdict: Verdict;
  spans: InjectionSpan[];
};

export type OutboundPayload = {
  task: "prior_auth_appeal";
  payer: string;
  denialReason: string;
  clinicalSummary: string;
  policyVersion: string;
  constraints: string[];
};

export type LeakFinding = {
  kind: "known_identifier" | "pattern";
  detail: string;
  value: string;
};

export type LeakCheck = {
  ok: boolean;
  findings: LeakFinding[];
};

export type InferenceBadge = "ON_DEVICE" | "IN_CLOUD" | "LOCAL_REHEARSAL" | "BLOCKED";

export type RouteMode =
  | "ONLY_ON_DEVICE"
  | "ONLY_IN_CLOUD"
  | "PREFER_ON_DEVICE"
  | "LOCAL_REHEARSAL"
  | "NONE";

export type AuditStep = "detect" | "scan" | "release" | "appeal" | "leak_check" | "handout";

export type Policy = {
  phiCloudFallback: boolean;
  injectionPolicy: "block" | "redact_and_warn";
  scanStrictness: "high" | "standard";
  policyVersion: string;
};

export const DEFAULT_POLICY: Policy = {
  phiCloudFallback: false,
  injectionPolicy: "block",
  scanStrictness: "high",
  policyVersion: "2026.11.1",
};

export const ON_DEVICE_TOKEN_LIMIT = 9216;

export const TOKEN_PREFIX: Record<IdentifierType, string> = {
  name: "PATIENT",
  geographic_subdivision: "GEO",
  date: "DATE",
  telephone: "PHONE",
  fax: "FAX",
  email: "EMAIL",
  ssn: "SSN",
  mrn: "MRN",
  health_plan_id: "PLAN_ID",
  account_number: "ACCOUNT",
  certificate_license: "LICENSE",
  vehicle_id: "VEHICLE",
  device_id: "DEVICE",
  url: "URL",
  ip: "IP",
  biometric: "BIOMETRIC",
  face_photo: "FACE",
  other_unique_id: "ID",
};
