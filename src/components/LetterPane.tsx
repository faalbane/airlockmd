import { lockedLeftovers } from "../logic/payload";
import { rehydrate } from "../logic/rehydrate";
import type { AirlockController } from "../state/useAirlock";
import { ModeBadge, SourceBadge } from "./Badges";

export function LetterPane({ airlock }: { airlock: AirlockController }) {
  const locked = airlock.prepared ? lockedLeftovers(airlock.prepared.json, airlock.spans) : [];
  const lockedBlocked = locked.length > 0 && !airlock.exceptionConfirmed;
  const showRestored = Boolean(airlock.restored);
  const letter = showRestored ? airlock.restored : airlock.draft?.letter ?? "";
  const title = showRestored && airlock.draft && airlock.prepared
    ? rehydrate(airlock.draft.title, airlock.prepared.tokenMap)
    : airlock.draft?.title ?? "";
  const cloudBlocked = Boolean(airlock.handle && !airlock.online);

  return (
    <section className="pane cloud" aria-label="Appeal letter">
      <header className="pane-head">
        <div>
          <p className="kicker">Staff draft</p>
          <h2>Appeal</h2>
        </div>
      </header>

      <div className="fields">
        <label>
          Payer
          <input value={airlock.payer} data-testid="payer" onChange={(event) => airlock.editPayer(event.target.value)} />
        </label>
        <label>
          Denial reason
          <textarea value={airlock.denial} data-testid="denial" onChange={(event) => airlock.editDenial(event.target.value)} />
        </label>
      </div>

      <button
        type="button"
        className="gold"
        data-testid="draft"
        disabled={airlock.busy || !airlock.prepared || !airlock.confirmed || cloudBlocked || lockedBlocked}
        onClick={() => void airlock.draftAppeal()}
      >
        {cloudBlocked ? "Cloud draft blocked offline" : "Draft appeal"}
      </button>
      <div className="route-row">
        {airlock.calls
          .filter((call) => call.step === "Appeal draft" || call.step === "Leak check" || call.step === "Patient handout")
          .slice(0, 3)
          .map((call) => (
            <span key={call.id} className="route">
              {call.step}
              <ModeBadge mode={call.mode} />
              <SourceBadge source={call.inferenceSource} raw={call.rawSource} />
            </span>
          ))}
      </div>

      {airlock.draft ? (
        <article className="letter" data-testid="letter">
          <p className="letter-kicker">{showRestored ? "Names restored on this device" : "Still tokenized"}</p>
          <h3>{title}</h3>
          <pre>{letter}</pre>
        </article>
      ) : (
        <p className="fine">The cloud draft receives only the tokenized payload, never raw identifiers. Until a cloud draft runs, this panel shows a local letter you can review.</p>
      )}

      {airlock.grounding?.html ? (
        <div className="search-suggestions" data-testid="search-suggestions" dangerouslySetInnerHTML={{ __html: airlock.grounding.html }} />
      ) : null}
      {airlock.grounding && airlock.grounding.sources.length > 0 ? (
        <ul className="sources">
          {airlock.grounding.sources.map((source) => (
            <li key={source.uri}>
              <a href={source.uri} target="_blank" rel="noreferrer">{source.title}</a>
            </li>
          ))}
        </ul>
      ) : null}
      {airlock.draft ? (
        <ul className="facts">
          {airlock.draft.citedFacts.map((fact) => (
            <li key={fact}>{fact}</li>
          ))}
        </ul>
      ) : null}

      {airlock.leak ? (
        <div className={airlock.leak.ok ? "callout ok" : "callout bad"} data-testid="leak-result">
          <strong>{airlock.leak.ok ? "Leak check passed" : "Leak check held the letter"}</strong>
          <p>
            {airlock.leak.nano === "not_run"
              ? "An automatic identifier check ran on the draft before names were restored. The on-device model check was skipped."
              : airlock.leak.nano === "clean"
                ? "The automatic identifier check and the on-device check both passed on the tokenized draft."
                : airlock.leak.nano === "failed"
                  ? "The on-device identifier check did not run. The automatic identifier check still ran on the draft."
                  : "The on-device check flagged the tokenized draft."}
          </p>
          {airlock.leak.findings.map((finding) => (
            <p key={finding.detail + finding.value}>{finding.detail}</p>
          ))}
        </div>
      ) : null}

      <div className="actions">
        <button type="button" data-testid="rehydrate" disabled={airlock.busy || !airlock.draft} onClick={() => void airlock.restoreNames()}>
          Restore names and check leaks
        </button>
        <button type="button" data-testid="handout" disabled={airlock.busy || !airlock.draft} onClick={() => void airlock.writeHandout()}>
          Write patient handout
        </button>
        <button type="button" data-testid="copy" disabled={!airlock.leak?.ok || !airlock.restored} onClick={() => void airlock.copyLetter()}>
          Copy letter
        </button>
        <button type="button" data-testid="print" disabled={!airlock.leak?.ok || !airlock.restored} onClick={airlock.printLetter}>
          Print
        </button>
      </div>

      {airlock.handout ? (
        <article className="letter handout" data-testid="handout-letter">
          <p className="letter-kicker">Handout restored on this device</p>
          <pre>{airlock.handout}</pre>
          <details>
            <summary>Handout before names were restored</summary>
            <pre data-testid="handout-tokenized">{airlock.handoutTokenized}</pre>
          </details>
        </article>
      ) : null}
    </section>
  );
}
