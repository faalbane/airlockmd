import { useEffect, useState } from "react";
import { DocumentPane } from "./components/DocumentPane";
import { InspectorPane } from "./components/InspectorPane";
import { LetterPane } from "./components/LetterPane";
import { rehydrate } from "./logic/rehydrate";
import { useAirlock, type Phase } from "./state/useAirlock";

const STEPS: { id: Phase; label: string }[] = [
  { id: "intake", label: "Intake" },
  { id: "review", label: "Review" },
  { id: "scanned", label: "Scan" },
  { id: "released", label: "Release" },
  { id: "drafted", label: "Draft" },
  { id: "restored", label: "Restore" },
];

function stepRank(phase: Phase): number {
  if (phase === "handout") return STEPS.length;
  const index = STEPS.findIndex((step) => step.id === phase);
  return index < 0 ? 0 : index;
}

export function App() {
  const airlock = useAirlock();
  const rank = stepRank(airlock.phase);
  useEffect(() => {
    document.querySelectorAll(".pane").forEach((pane) => {
      pane.scrollTop = 0;
    });
  }, [airlock.caseId]);

  if (airlock.handle && airlock.authReady && !airlock.user) {
    return <SignIn airlock={airlock} />;
  }

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="mark" aria-hidden="true">
            <svg viewBox="0 0 32 32">
              <rect x="2" y="6" width="10" height="20" rx="3" />
              <rect x="20" y="6" width="10" height="20" rx="3" />
              <circle cx="16" cy="16" r="2.2" />
            </svg>
          </span>
          <div>
            <strong>AirlockMD</strong>
            <span>Cloud intelligence, local identity.</span>
          </div>
        </div>
        <div className="pills">
          <span className={airlock.sealed ? "pill bad" : "pill ok"} data-testid="nano-pill">
            {airlock.nano === "ready"
              ? "Nano ready"
              : airlock.nano === "downloading"
                ? `Downloading ${airlock.progress ?? 0}%`
                : "Airlock sealed"}
          </span>
          <span className="pill">{airlock.policy.phiCloudFallback ? "Cloud identifier fallback blocked" : "Identifiers stay on this device"}</span>
          <span className="pill">{airlock.online ? "Online" : "Offline"}</span>
          <span className="pill">{airlock.appCheckEnabled ? "App Check on" : "App Check off"}</span>
          <span className="pill">{airlock.user?.email ?? "Local demo"}</span>
        </div>
        <div className="top-actions">
          <button type="button" data-testid="enable-nano" onClick={() => void airlock.enableNano()} disabled={airlock.nano === "downloading"}>
            Enable on-device model
          </button>
          {airlock.user ? (
            <button type="button" className="ghost" onClick={() => void airlock.signOutUser()}>Sign out</button>
          ) : null}
        </div>
      </header>

      {airlock.nano === "downloading" ? (
        <div className="progress" aria-valuenow={airlock.progress ?? 0} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${airlock.progress ?? 0}%` }} />
        </div>
      ) : null}

      {airlock.sealed ? (
        <p className="banner" data-testid="sealed-banner">
          Airlock sealed: the local stage cannot run.
          {" "}
          {airlock.handle
            ? "Raw notes and images are not sent to the cloud. A released tokenized payload can still be drafted."
            : "The on-device model is not available in this session. Notes and images stay on this device. You can still review tokens and draft a local letter."}
        </p>
      ) : (
        <p className="banner ok" data-testid="ready-banner">
          On-device model ready. Identifier passes, the integrity scan, and the leak check stay on this device.
        </p>
      )}

      {airlock.policy.phiCloudFallback ? (
        <p className="banner bad">
          A remote policy asked to send identifiers to the cloud. AirlockMD ignores that request and keeps identifiers on this device.
        </p>
      ) : null}
      {!airlock.online ? (
        <p className="banner" data-testid="offline-banner">
          You are offline. Intake and redaction stay on this device. The cloud draft is blocked.
        </p>
      ) : null}
      {airlock.error ? <p className="banner bad" data-testid="error-banner">{airlock.error}</p> : null}
      {airlock.notice ? <p className="banner">{airlock.notice}</p> : null}

      <ol className="stepper">
        {STEPS.map((step, index) => (
          <li key={step.id} className={index < rank ? "done" : index === rank ? "now" : ""}>
            <span>{index + 1}</span>
            {step.label}
          </li>
        ))}
      </ol>

      <main className="panes">
        <DocumentPane airlock={airlock} />
        <InspectorPane airlock={airlock} />
        <LetterPane airlock={airlock} />
      </main>

      <section className="ledger" aria-label="Session ledger">
        <header>
          <h2>Session ledger</h2>
          <p>Counts, mode, and inference source only. No notes, images, token maps, or names.</p>
        </header>
        {airlock.ledger.length === 0 ? (
          <p className="fine">Entries appear as you move through a case. Signed-in sessions also save these fields to the server.</p>
        ) : (
          <table data-testid="ledger">
            <thead>
              <tr>
                <th>Step</th>
                <th>Mode</th>
                <th>Source</th>
                <th>Entities</th>
                <th>Injection blocked</th>
                <th>Policy</th>
                <th>Hash</th>
                <th>Saved</th>
              </tr>
            </thead>
            <tbody>
              {airlock.ledger.map((row) => (
                <tr key={row.id}>
                  <td>{row.step}</td>
                  <td>{row.mode}</td>
                  <td>{row.inferenceSource}</td>
                  <td>{Object.entries(row.entityCounts).map(([key, value]) => `${key} ${value}`).join(", ") || "0"}</td>
                  <td>{row.injectionBlocked ? "yes" : "no"}</td>
                  <td>{row.policyVersion}</td>
                  <td title={row.payloadHash}>{row.payloadHash.slice(0, 12)}</td>
                  <td>{row.saved ? "Server" : "This tab"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <footer className="limitations">
        <p>
          Synthetic patient data only. Staff review is required. Detection is defense in depth, not a guarantee.
          AirlockMD does not provide medical advice or coverage decisions, and it is not a HIPAA compliance program.
          Only the on-device stages can run without a network. The ledger is an operations record, not a compliance audit log.
        </p>
      </footer>

      <div id="print-sheet" aria-hidden="true">
        <p>AirlockMD draft for staff review. Synthetic demo.</p>
        <h1>{airlock.restored && airlock.draft && airlock.prepared ? rehydrate(airlock.draft.title, airlock.prepared.tokenMap) : airlock.draft?.title}</h1>
        <pre>{airlock.restored}</pre>
      </div>
    </div>
  );
}

function SignIn({ airlock }: { airlock: ReturnType<typeof useAirlock> }) {
  const [email, setEmail] = useState("judge@airlockmd.example");
  const [password, setPassword] = useState("");
  return (
    <div className="signin" data-testid="signin">
      <div className="card">
        <p className="kicker">AirlockMD</p>
        <h1>Sign in to the workspace</h1>
        <p>Judges: sign in with the demo credentials provided in the Devpost submission. Everything in this workspace uses synthetic patient data.</p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void airlock.signInEmail(email, password);
          }}
        >
          <label>
            Email
            <input type="email" autoComplete="username" data-testid="signin-email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <label>
            Password
            <input type="password" autoComplete="current-password" data-testid="signin-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          </label>
          {airlock.authError ? <p className="banner bad" data-testid="signin-error">{airlock.authError}</p> : null}
          <button type="submit" className="primary" data-testid="signin-submit">Sign in</button>
        </form>
      </div>
    </div>
  );
}
