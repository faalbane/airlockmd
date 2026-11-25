import { useState } from "react";
import { FIXTURES } from "../fixtures/cases";
import { segmentText } from "../logic/spans";
import type { AirlockController } from "../state/useAirlock";
import { IDENTIFIER_TYPES, type IdentifierType } from "../types";
import { ModeBadge, SourceBadge } from "./Badges";

const TYPE_LABEL: Record<string, string> = {
  name: "name",
  geographic_subdivision: "place",
  date: "date",
  telephone: "phone",
  fax: "fax",
  email: "email",
  ssn: "SSN",
  mrn: "MRN",
  health_plan_id: "member id",
  account_number: "account",
  certificate_license: "license",
  vehicle_id: "vehicle",
  device_id: "device",
  url: "URL",
  ip: "IP",
  biometric: "biometric",
  face_photo: "photo",
  other_unique_id: "other id",
};

function labelFor(type: string): string {
  return TYPE_LABEL[type] ?? type;
}


function scanLabel(verdict: string): string {
  if (verdict === "INJECTION_DETECTED") return "Hidden instruction found";
  if (verdict === "SUSPICIOUS") return "Suspicious instruction found";
  if (verdict === "SAFE") return "No hidden instruction found";
  return verdict;
}

export function DocumentPane({ airlock }: { airlock: AirlockController }) {
  const [selection, setSelection] = useState("");
  const [spanType, setSpanType] = useState<IdentifierType>("name");
  const segments = segmentText(airlock.sourceText, airlock.spans);
  const quotes = airlock.scan?.spans.map((span) => span.text) ?? [];

  return (
    <section className="pane laptop" aria-label="Source document">
      <header className="pane-head">
        <div>
          <p className="kicker">Your device</p>
          <h2>Source</h2>
        </div>
        <span className="synthetic">Synthetic patient data</span>
      </header>

      <div className="cases" role="list">
        {FIXTURES.map((fixture) => (
          <button
            key={fixture.id}
            type="button"
            role="listitem"
            className={airlock.caseId === fixture.id ? "case on" : "case"}
            data-testid={`case-${fixture.id}`}
            onClick={() => airlock.loadFixture(fixture.id)}
          >
            <strong>{fixture.title}</strong>
            <span>{fixture.summary}</span>
          </button>
        ))}
      </div>

      <div className="actions">
        <button type="button" data-testid="detect" onClick={() => void airlock.detect()} disabled={airlock.busy || airlock.judge}>
          {airlock.judge ? "Already tokenized" : "Find identifiers"}
        </button>
        <button type="button" data-testid="scan" onClick={() => void airlock.scanDoc()} disabled={airlock.busy || !airlock.sourceText.trim()}>
          Scan for hidden instructions
        </button>
      </div>

      {airlock.scan ? (
        <div className={`scan verdict-${airlock.scan.verdict}`} data-testid="scan-result">
          <div className="scan-top">
            <strong>{scanLabel(airlock.scan.verdict)}</strong>
          </div>
          {airlock.scan.spans.length === 0 ? (
            <p>No hidden instruction found by the local screen.</p>
          ) : (
            airlock.scan.spans.map((span) => (
              <blockquote key={span.text} data-testid="injection-quote">
                <p>{span.text}</p>
                <footer>{span.reason}</footer>
              </blockquote>
            ))
          )}
          {airlock.held ? (
            <button type="button" className="danger" data-testid="strip-injection" onClick={airlock.stripInstructions}>
              Strip hidden instructions
            </button>
          ) : null}
          {airlock.stripped && airlock.scan.verdict !== "SAFE" ? (
            <p className="fine">Those lines will be removed from the outbound text. They stay on this device.</p>
          ) : null}
        </div>
      ) : null}

      <div className="route-row">
        {airlock.calls
          .filter((call) => call.step === "Identifier pass" || call.step === "Integrity scan")
          .slice(0, 2)
          .map((call) => (
            <span key={call.id} className="route">
              {call.step}
              <ModeBadge mode={call.mode} />
              <SourceBadge source={call.inferenceSource} raw={call.rawSource} />
            </span>
          ))}
      </div>

      <label
        className="drop"
        data-testid="dropzone"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const file = event.dataTransfer.files?.[0];
          if (file) void airlock.useImage(file);
        }}
      >
        <input
          type="file"
          accept="image/png,image/jpeg"
          data-testid="file-input"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void airlock.useImage(file);
            event.target.value = "";
          }}
        />
        <span>Drop a JPEG or PNG referral. The file stays in this tab.</span>
      </label>

      {airlock.imageUrl ? (
        <figure className="preview">
          <img src={airlock.imageUrl} alt="Synthetic clinical document. Not uploaded." />
          <figcaption>{airlock.visionNote}</figcaption>
        </figure>
      ) : null}

      {airlock.tokenNote ? <p className="callout warn">{airlock.tokenNote}</p> : null}
      {airlock.judge ? (
        <p className="callout" data-testid="judge-banner">
          Judge mode. This synthetic case is already tokenized. The raw note is not in the outbound payload. You can draft from tokens when Nano is absent.
        </p>
      ) : null}

      <div className="doc" data-testid="document" onMouseUp={() => {
        const text = window.getSelection()?.toString().trim() ?? "";
        if (text) setSelection(text);
      }}>
        {airlock.sourceText
          ? segments.map((segment, index) =>
              segment.span ? (
                <mark
                  key={`${segment.span.id}-${index}`}
                  data-type={segment.span.type}
                  className={segment.span.included ? "id" : "id off"}
                  onClick={() => airlock.toggleSpan(segment.span!.id)}
                >
                  {segment.text}
                </mark>
              ) : (
                <QuoteText key={`t-${index}`} text={segment.text} quotes={quotes} />
              ),
            )
          : <p className="empty">Choose a synthetic case, paste a note, or drop an image.</p>}
      </div>

      <details className="edit">
        <summary>Edit source text</summary>
        <textarea
          value={airlock.sourceText}
          onChange={(event) => airlock.editSource(event.target.value)}
          spellCheck={false}
          aria-label="Source text"
          data-testid="source-text"
        />
      </details>

      <div className="span-tools">
        <h3>Review spans</h3>
        <p className="fine">Click a highlight to keep it or remove it. Removed names can remain in the payload on purpose. SSNs, phones, emails, MRNs, and member IDs need an extra confirmation if you leave them in.</p>
        <ul className="span-list" data-testid="span-list">
          {airlock.spans.map((span) => (
            <li key={span.id}>
              <button
                type="button"
                className={span.included ? "span on" : "span off"}
                data-testid={span.hint?.includes("physician") ? "remove-over-redaction" : `span-${span.type}`}
                aria-pressed={span.included}
                onClick={() => airlock.toggleSpan(span.id)}
              >
                <b>{span.included ? "Tokenize" : "Left in"}</b>
                <span>{labelFor(span.type)}</span>
                <em>{span.text}</em>
              </button>
              {span.hint ? <small>{span.hint}</small> : null}
            </li>
          ))}
        </ul>
        <form
          className="add-span"
          onSubmit={(event) => {
            event.preventDefault();
            airlock.addSpan(selection, spanType);
          }}
        >
          <input
            value={selection}
            onChange={(event) => setSelection(event.target.value)}
            placeholder="Text to mark"
            aria-label="Text to mark"
          />
          <select value={spanType} aria-label="Identifier type" onChange={(event) => setSpanType(event.target.value as IdentifierType)}>
            {IDENTIFIER_TYPES.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
          <button type="submit">Add span</button>
        </form>
      </div>

    </section>
  );
}

function QuoteText({ text, quotes }: { text: string; quotes: string[] }) {
  if (quotes.length === 0) return <>{text}</>;
  const nodes: { kind: "plain" | "quote"; text: string }[] = [];
  let remaining = text;
  while (remaining.length) {
    let hit: { index: number; quote: string } | null = null;
    for (const quote of quotes) {
      const index = remaining.indexOf(quote);
      if (index >= 0 && (!hit || index < hit.index)) hit = { index, quote };
    }
    if (!hit) {
      nodes.push({ kind: "plain", text: remaining });
      break;
    }
    if (hit.index > 0) nodes.push({ kind: "plain", text: remaining.slice(0, hit.index) });
    nodes.push({ kind: "quote", text: hit.quote });
    remaining = remaining.slice(hit.index + hit.quote.length);
  }
  return (
    <>
      {nodes.map((node, index) =>
        node.kind === "quote" ? (
          <span key={`${index}-${node.text.slice(0, 12)}`} className="quote">{node.text}</span>
        ) : (
          <span key={`${index}-p`}>{node.text}</span>
        ),
      )}
    </>
  );
}
