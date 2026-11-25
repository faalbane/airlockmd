import { useEffect, useMemo, useState } from "react";
import { leftoverSpans, lockedLeftovers, searchPayload } from "../logic/payload";
import type { AirlockController } from "../state/useAirlock";

export function InspectorPane({ airlock }: { airlock: AirlockController }) {
  const [query, setQuery] = useState("");
  useEffect(() => {
    setQuery("");
  }, [airlock.caseId]);
  const json = airlock.prepared?.json ?? "";
  const count = json ? searchPayload(json, query).count : 0;
  const map = airlock.prepared?.tokenMap ?? airlock.previewMap;
  const leftovers = json ? leftoverSpans(json, airlock.spans) : [];
  const locked = json ? lockedLeftovers(json, airlock.spans) : [];

  const suggestions = useMemo(() => {
    const items: { label: string; value: string }[] = [];
    if (airlock.patientName) items.push({ label: "Patient name", value: airlock.patientName });
    if (airlock.patientMrn) items.push({ label: "MRN", value: airlock.patientMrn });
    for (const entry of Object.values(map ?? {})) {
      if (!["ssn", "telephone", "email"].includes(entry.type)) continue;
      if (items.some((item) => item.value === entry.text)) continue;
      items.push({ label: entry.type, value: entry.text });
    }
    return items;
  }, [airlock.patientMrn, airlock.patientName, map]);

  return (
    <section className="pane door" aria-label="Airlock inspector">
      <header className="pane-head">
        <div>
          <p className="kicker">Airlock Inspector</p>
          <h2>What leaves this device</h2>
        </div>
      </header>

      <label className="search">
        <span>Search the outbound payload</span>
        <input
          value={query}
          data-testid="inspector-search"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Patient name, MRN, phone"
          autoComplete="off"
        />
      </label>
      <div className="chips">
        {suggestions.map((item) => (
          <button
            key={item.label + item.value}
            type="button"
            data-testid={item.label === "Patient name" ? "search-patient" : undefined}
            onClick={() => setQuery(item.value)}
          >
            Search {item.label}
          </button>
        ))}
      </div>

      {query.trim() && json ? (
        <p className={count === 0 ? "match zero" : "match some"} data-testid="match-count" aria-live="polite">
          <strong>{count}</strong>
          <span>{count === 1 ? "match" : "matches"}</span>
        </p>
      ) : (
        <p className="fine">Release a case, then search the patient name. A sealed airlock shows 0 matches.</p>
      )}

      <div className="split">
        <div>
          <h3>Stays on this laptop</h3>
          {map && Object.keys(map).length > 0 ? (
            <ul className="map" data-testid="token-map">
              {Object.entries(map).map(([token, entry]) => (
                <li key={token}>
                  <code>{token}</code>
                  <span>{entry.text}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="fine">The token map appears here after identifiers are released. It is not written to Firestore.</p>
          )}
          {airlock.imageUrl ? <p className="fine">The image bytes stay in this tab.</p> : null}
        </div>
        <div>
          <h3>Outbound JSON</h3>
          {json ? (
            <pre className="json" data-testid="outbound">{highlight(json, query)}</pre>
          ) : (
            <p className="fine" data-testid="outbound-empty">Nothing has been released. Raw notes cannot leave.</p>
          )}
          {airlock.prepared ? (
            <p className="fine">Ledger hash covers this JSON, not the token map.</p>
          ) : null}
        </div>
      </div>

      {leftovers.length > 0 ? (
        <div className="callout warn">
          <strong>Left in the outbound text on purpose</strong>
          <ul>
            {leftovers.map((span) => (
              <li key={span.id}>{span.type}: {span.text}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {locked.length > 0 ? (
        <label className="confirm danger-confirm">
          <input
            type="checkbox"
            data-testid="confirm-exceptions"
            checked={airlock.exceptionConfirmed}
            onChange={(event) => airlock.setExceptionConfirmed(event.target.checked)}
          />
          I mean to leave these locked identifiers in the outbound payload.
        </label>
      ) : null}

      <label className="confirm">
        <input
          type="checkbox"
          data-testid="confirm-release"
          checked={airlock.confirmed}
          onChange={(event) => airlock.setConfirmed(event.target.checked)}
        />
        I reviewed every span. Tokenized items stay on this laptop. Items I removed may appear in the outbound payload.
      </label>

      <button
        type="button"
        className="primary"
        data-testid="release"
        disabled={airlock.busy || !airlock.scan || airlock.held || !airlock.confirmed}
        onClick={() => void airlock.release()}
      >
        Release to airlock
      </button>
    </section>
  );
}

function highlight(text: string, query: string) {
  const needle = query.trim();
  if (!needle) return text;
  const pattern = new RegExp(`(${escapeRegExp(needle)})`, "ig");
  const parts = text.split(pattern);
  return parts.map((part, index) =>
    part.toLowerCase() === needle.toLowerCase() ? (
      <mark key={`${index}-${part}`} className="hit">{part}</mark>
    ) : (
      <span key={`${index}-t`}>{part}</span>
    ),
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
