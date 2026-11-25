import type { InferenceBadge, RouteMode } from "../types";

const SOURCE_LABEL: Record<InferenceBadge, string> = {
  ON_DEVICE: "ON_DEVICE",
  IN_CLOUD: "IN_CLOUD",
  LOCAL_REHEARSAL: "LOCAL REHEARSAL",
  BLOCKED: "BLOCKED",
};

export function SourceBadge({
  source,
  raw,
}: {
  source: InferenceBadge;
  raw?: string;
}) {
  return (
    <span className={`badge source-${source.toLowerCase()}`} title={raw ? `Model source: ${raw}` : "No model source reported"}>
      {SOURCE_LABEL[source]}
    </span>
  );
}

export function ModeBadge({ mode }: { mode: RouteMode }) {
  return <span className="badge mode">{mode}</span>;
}
