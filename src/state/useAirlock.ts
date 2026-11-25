import { useEffect, useRef, useState } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import { fixtureById, POISON_LINE, type Fixture } from "../fixtures/cases";
import { writeAudit } from "../firebase/audit";
import { bootFirebase, type FirebaseHandle } from "../firebase/init";
import { fileToGenerativePart } from "../firebase/models";
import { loadPolicy } from "../firebase/policy";
import { appealPrompt, handoutPrompt, intakePrompt, integrityPrompt, leakPrompt } from "../firebase/prompts";
import { saveSealedMap } from "../firebase/sessionStore";
import { rehearsalAppeal, rehearsalHandout, type AppealDraft } from "../logic/appealTemplate";
import { normalizeInferenceSource, toAuditRecord, type AuditRecord } from "../logic/auditRecord";
import { sha256Hex } from "../logic/hash";
import { mergeVerdict, needsAcknowledgement, scanForInjection } from "../logic/integrity";
import { checkLeaks } from "../logic/leakCheck";
import { parseAppeal, parseIdentifierResponse, parseInjectionResponse, parseLeakResponse } from "../logic/parseModel";
import { entityCounts, estimateTokens, prepareAirlock, type PreparedAirlock } from "../logic/pipeline";
import { findRegexSpans } from "../logic/regexNet";
import { rehydrate } from "../logic/rehydrate";
import { alignModelSpan, spanFromSelection, unionSpans } from "../logic/spans";
import { createSessionKey, encryptJson } from "../logic/sessionCrypto";
import {
  AirlockBlocked,
  assertImageOnDeviceOnly,
  assertPayloadHasNoSecrets,
  assertSafeForCloudFallback,
  cloudFallbackAllowed,
} from "../logic/safety";
import {
  DEFAULT_POLICY,
  ON_DEVICE_TOKEN_LIMIT,
  type IdentifierType,
  type InferenceBadge,
  type Policy,
  type RouteMode,
  type LeakCheck,
  type ScanResult,
  type Span,
  type TokenMap,
} from "../types";

export type Phase = "intake" | "review" | "scanned" | "released" | "drafted" | "restored" | "handout";

export type NanoStatus = "unavailable" | "downloading" | "ready";

export type CallRecord = {
  id: string;
  step: string;
  mode: RouteMode;
  inferenceSource: InferenceBadge;
  rawSource?: string;
};

export type LedgerRow = AuditRecord & {
  id: string;
  at: number;
  saved: boolean;
};

export type LeakState = LeakCheck & {
  nano: "not_run" | "clean" | "leak" | "failed";
};

export type GroundingView = {
  html: string | null;
  sources: { title: string; uri: string }[];
  queries: string[];
};

type LooseResponse = {
  text: () => string;
  inferenceSource?: string;
  candidates?: Array<{
    groundingMetadata?: {
      searchEntryPoint?: { renderedContent?: string };
      groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
      webSearchQueries?: string[];
    };
  }>;
};

const CHAR_CAP = ON_DEVICE_TOKEN_LIMIT * 4;

function errorText(error: unknown): string {
  const message = error instanceof Error && error.message ? error.message : "";
  if (/429|exceeded your current quota|rate-limit|billing details/i.test(message)) {
    return "The cloud model is temporarily unavailable because of a quota limit. You can still tokenize, scan, and review a local draft.";
  }
  if (/AI: Error fetching from|firebasevertexai|AI\/fetch-error/i.test(message)) {
    return "The cloud model could not be reached. You can still tokenize, scan, and review a local draft. Nothing extra was sent.";
  }
  if (message) return message;
  return "Something went wrong. Nothing extra was sent.";
}

function authErrorText(error: unknown): string {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: string }).code) : "";
  const message = error instanceof Error ? error.message : "";
  const haystack = `${code} ${message}`;
  if (/operation-not-allowed/i.test(haystack)) {
    return "That sign-in method is not available. Use the demo email and password from the Devpost submission.";
  }
  if (/invalid-credential|wrong-password|user-not-found|invalid-email|invalid-login/i.test(haystack)) {
    return "That email and password did not match the demo account. Use the credentials from the Devpost submission.";
  }
  if (/too-many-requests/i.test(haystack)) {
    return "Too many sign-in attempts. Wait a moment and try again.";
  }
  if (/network-request-failed/i.test(haystack)) {
    return "The sign-in request could not reach the server. Check your connection and try again.";
  }
  if (/popup-blocked|popup-closed|cancelled-popup/i.test(haystack)) {
    return "The sign-in window was closed or blocked.";
  }
  if (/^Firebase: Error \(auth\//i.test(message) || /auth\//.test(haystack)) {
    return "Sign-in did not complete. Use the demo email and password from the Devpost submission.";
  }
  return errorText(error);
}

function looseResponse(result: { response: { text: () => string } }): LooseResponse {
  return result.response as LooseResponse;
}

function readGrounding(response: LooseResponse): GroundingView {
  const metadata = response.candidates?.[0]?.groundingMetadata;
  const sources = (metadata?.groundingChunks ?? []).flatMap((chunk) => {
    if (!chunk.web?.uri) return [];
    return [{ title: chunk.web.title || chunk.web.uri, uri: chunk.web.uri }];
  });
  return {
    html: metadata?.searchEntryPoint?.renderedContent ?? null,
    sources,
    queries: metadata?.webSearchQueries ?? [],
  };
}

let callSerial = 0;

export function useAirlock() {
  const [handle, setHandle] = useState<FirebaseHandle | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [policy, setPolicy] = useState<Policy>(DEFAULT_POLICY);
  const [nano, setNano] = useState<NanoStatus>("unavailable");
  const [progress, setProgress] = useState<number | null>(null);
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const [caseId, setCaseId] = useState<string | null>(null);
  const [judge, setJudge] = useState(false);
  const [sourceText, setSourceText] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [visionNote, setVisionNote] = useState<string | null>(null);
  const [tokenNote, setTokenNote] = useState<string | null>(null);
  const [spans, setSpans] = useState<Span[]>([]);
  const [payer, setPayer] = useState("");
  const [denial, setDenial] = useState("");
  const [patientName, setPatientName] = useState("");
  const [patientMrn, setPatientMrn] = useState("");
  const [previewMap, setPreviewMap] = useState<TokenMap | null>(null);
  const [phase, setPhase] = useState<Phase>("intake");
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [stripped, setStripped] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [exceptionConfirmed, setExceptionConfirmed] = useState(false);
  const [prepared, setPrepared] = useState<PreparedAirlock | null>(null);
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [draft, setDraft] = useState<AppealDraft | null>(null);
  const [grounding, setGrounding] = useState<GroundingView | null>(null);
  const [restored, setRestored] = useState("");
  const [leak, setLeak] = useState<LeakState | null>(null);
  const [handoutTokenized, setHandoutTokenized] = useState("");
  const [handout, setHandout] = useState("");
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const fixedMap = useRef<PreparedAirlock["tokenMap"] | null>(null);
  const imageFileRef = useRef<File | null>(null);
  const fixtureImageRef = useRef<string | null>(null);
  const previewRevoke = useRef<string | null>(null);
  const sessionKey = useRef<CryptoKey | null>(null);
  const handleRef = useRef<FirebaseHandle | null>(null);
  const userRef = useRef<User | null>(null);
  handleRef.current = handle;
  userRef.current = user;

  useEffect(() => {
    let alive = true;
    bootFirebase().then((next) => {
      if (alive) setHandle(next);
      if (alive) setAuthReady(next ? false : true);
    });
    createSessionKey()
      .then((key) => {
        if (alive) sessionKey.current = key;
      })
      .catch(() => undefined);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      alive = false;
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => {
    if (!handle) return;
    setAuthReady(false);
    return onAuthStateChanged(handle.auth, (next) => {
      setUser(next);
      setAuthReady(true);
    });
  }, [handle]);

  useEffect(() => {
    if (!handle) return;
    let alive = true;
    loadPolicy(handle.remoteConfig).then((next) => {
      if (alive) setPolicy(next);
    });
    return () => {
      alive = false;
    };
  }, [handle]);

  function revokePreview() {
    if (previewRevoke.current) {
      URL.revokeObjectURL(previewRevoke.current);
      previewRevoke.current = null;
    }
  }

  function clearWork() {
    setSpans([]);
    setScan(null);
    setStripped(false);
    setConfirmed(false);
    setExceptionConfirmed(false);
    setPrepared(null);
    setDraft(null);
    setGrounding(null);
    setRestored("");
    setLeak(null);
    setHandout("");
    setHandoutTokenized("");
    setTokenNote(null);
    setError(null);
    setNotice(null);
    setCalls([]);
  }

  function loadFixture(id: string) {
    const fixture: Fixture | undefined = fixtureById(id);
    if (!fixture) return;
    revokePreview();
    imageFileRef.current = null;
    fixtureImageRef.current = fixture.imageUrl ?? null;
    fixedMap.current = fixture.tokenMap ?? null;
    setPreviewMap(fixture.tokenMap ?? null);
    setCaseId(fixture.id);
    setJudge(fixture.kind === "judge");
    setSourceText(fixture.text);
    setImageUrl(fixture.imageUrl ?? null);
    setPayer(fixture.payer);
    setDenial(fixture.denialReason);
    setPatientName(fixture.patientName);
    setPatientMrn(fixture.mrn);
    setVisionNote(
      fixture.imageUrl
        ? "Synthetic image. It stays in this tab. The appeal payload never includes the file."
        : null,
    );
    clearWork();
    setPhase(fixture.kind === "judge" ? "review" : "intake");
  }

  function editSource(next: string) {
    setSourceText(next);
    if (judge) {
      setJudge(false);
      fixedMap.current = null;
      setPreviewMap(null);
    }
    clearWork();
    setPhase("intake");
  }

  function editPayer(next: string) {
    setPayer(next);
    invalidateRelease();
  }

  function editDenial(next: string) {
    setDenial(next);
    invalidateRelease();
  }

  function invalidateRelease() {
    setPrepared(null);
    setDraft(null);
    setGrounding(null);
    setRestored("");
    setLeak(null);
    setHandout("");
    setHandoutTokenized("");
    setPhase((current) => (current === "intake" || current === "review" ? current : scan ? "scanned" : "review"));
  }

  async function useImage(file: File) {
    if (file.type !== "image/png" && file.type !== "image/jpeg") {
      setError("Only JPEG and PNG can be read on device. That file was not uploaded.");
      return;
    }
    revokePreview();
    const url = URL.createObjectURL(file);
    previewRevoke.current = url;
    imageFileRef.current = file;
    fixtureImageRef.current = null;
    fixedMap.current = null;
    setPreviewMap(null);
    setJudge(false);
    setCaseId("upload");
    setImageUrl(url);
    setSourceText("");
    setPatientName("");
    setPatientMrn("");
    setPayer("");
    setDenial("");
    setVisionNote("This image is in memory for on-device reading. It is not uploaded.");
    clearWork();
    setPhase("intake");
  }

  async function record(
    input: AuditRecord & { rawSource?: string },
  ): Promise<void> {
    const recordBody = toAuditRecord(input);
    const id = `local-${Date.now()}-${callSerial}`;
    const row: LedgerRow = { ...recordBody, id, at: Date.now(), saved: false };
    setLedger((current) => [row, ...current].slice(0, 24));
    const activeHandle = handleRef.current;
    const activeUser = userRef.current;
    if (!activeHandle || !activeUser) return;
    try {
      await writeAudit(activeHandle, activeUser.uid, recordBody);
      setLedger((current) => current.map((item) => (item.id === id ? { ...item, saved: true } : item)));
    } catch {
      setNotice("The local ledger updated. The server did not accept this entry.");
    }
  }

  function pushCall(step: string, mode: RouteMode, inferenceSource: InferenceBadge, rawSource?: string) {
    callSerial += 1;
    const id = `call-${callSerial}`;
    setCalls((current) => [{ id, step, mode, inferenceSource, rawSource }, ...current].slice(0, 12));
  }

  async function enableNano() {
    setError(null);
    const active = handleRef.current;
    if (!active) {
      setNano("unavailable");
      setError("Airlock sealed: the on-device model cannot start in this session. Notes and images stay on this device.");
      return;
    }
    setNano("downloading");
    setProgress(0);
    const onProgress = (value: number) => setProgress(Math.round(value * 10000) / 100);
    try {
      await active.models.intake.initializeDeviceModel(onProgress);
      await active.models.integrity.initializeDeviceModel(onProgress);
      await active.models.leak.initializeDeviceModel(onProgress);
      setNano("ready");
      setProgress(100);
      setNotice("On-device model ready.");
    } catch {
      setNano("unavailable");
      setProgress(null);
      setError("Airlock sealed: the local stage cannot run.");
    }
  }

  async function detect() {
    if (judge) {
      setPhase("review");
      return;
    }
    const textNow = sourceText;
    const fixtureId = caseId;
    const active = handleRef.current;
    if (!textNow.trim() && !imageUrl) {
      setError("Add a note or a JPEG or PNG first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let working = textNow;
      let modelSpans: Span[] = [];
      let mode: RouteMode = "LOCAL_REHEARSAL";
      let badge: InferenceBadge = "LOCAL_REHEARSAL";
      let rawSource: string | undefined;
      const capped = working.length > CHAR_CAP;
      if (capped) {
        setTokenNote(
          `This note is over the ${ON_DEVICE_TOKEN_LIMIT.toLocaleString()} token on-device limit. The model sees the first portion. The regex net still runs on the full note.`,
        );
      } else if (estimateTokens(working) > 0) {
        setTokenNote(null);
      }

      if (nano === "ready" && active) {
        mode = "ONLY_ON_DEVICE";
        assertImageOnDeviceOnly("ONLY_ON_DEVICE");
        const modelText = working.slice(0, CHAR_CAP);
        const prompt = intakePrompt(imageUrl ? modelText : modelText, capped);
        let request: string | unknown[] = prompt;
        const file = imageFileRef.current
          ? imageFileRef.current
          : fixtureImageRef.current
            ? await (async () => {
                const response = await fetch(fixtureImageRef.current as string);
                const blob = await response.blob();
                return new File([blob], "fixture.png", { type: blob.type || "image/png" });
              })()
            : null;
        if (file) {
          const part = await fileToGenerativePart(file);
          request = [prompt, part];
        }
        try {
          const result = await active.models.intake.generateContent(request as never);
          const response = looseResponse(result);
          rawSource = response.inferenceSource;
          badge = normalizeInferenceSource(rawSource, "BLOCKED");
          if (badge !== "ON_DEVICE") {
            throw new AirlockBlocked("Airlock sealed: identifier extraction did not stay on device. Nothing was sent onward.");
          }
          const parsed = parseIdentifierResponse(response.text());
          if (parsed.extractedText.trim().length > 40) {
            working = parsed.extractedText;
            setSourceText(working);
          }
          modelSpans = parsed.entities.flatMap((entity) => {
            const aligned = alignModelSpan(working, entity);
            return aligned ? [aligned] : [];
          });
          setVisionNote(file ? "Gemini Nano read this image on device. The file was not uploaded." : null);
        } catch (error) {
          if (error instanceof AirlockBlocked) throw error;
          mode = "LOCAL_REHEARSAL";
          badge = "LOCAL_REHEARSAL";
          rawSource = undefined;
          setNano("unavailable");
          setError("Airlock sealed: the local stage cannot run. Showing the regex net only. Nothing was sent to the cloud.");
        }
      } else if (!working.trim()) {
        setError("Airlock sealed: the local stage cannot run. This image was not uploaded. Open a synthetic fixture or paste a transcript.");
        return;
      } else if (imageUrl) {
        setVisionNote("Fixture or pasted transcript used because Gemini Nano vision did not run. The image stayed in this tab.");
      }

      if (fixtureId === "poison" && !working.includes(POISON_LINE)) {
        working = `${working.trim()}\n\n${POISON_LINE}`;
        setSourceText(working);
        setVisionNote("The faint fixture line was kept in the local transcript so the scan can show it. The image was not uploaded.");
      }

      const regexSpans = working.trim() ? findRegexSpans(working) : [];
      const union = unionSpans([regexSpans, modelSpans]);
      setSpans(union);
      setScan(null);
      setStripped(false);
      setPrepared(null);
      setDraft(null);
      setRestored("");
      setLeak(null);
      setHandout("");
      setPhase("review");
      pushCall("Identifier pass", mode, badge, rawSource);
      await record({
        step: "detect",
        mode,
        inferenceSource: badge,
        entityCounts: entityCounts(union),
        injectionBlocked: false,
        policyVersion: policy.policyVersion,
        payloadHash: "none",
        rawSource,
      });
    } catch (error) {
      setError(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  function toggleSpan(id: string) {
    setSpans((current) => current.map((span) => (span.id === id ? { ...span, included: !span.included } : span)));
    invalidateRelease();
  }

  function addSpan(selected: string, type: IdentifierType) {
    const next = spanFromSelection(sourceText, selected, type);
    if (!next) {
      setError("That text was not found in the note.");
      return;
    }
    setSpans((current) => unionSpans([current, [next]]));
    setError(null);
    invalidateRelease();
  }

  async function scanDoc() {
    const textNow = sourceText;
    if (!textNow.trim()) {
      setError("There is no document to scan.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let local = scanForInjection(textNow);
      let mode: RouteMode = "LOCAL_REHEARSAL";
      let badge: InferenceBadge = "LOCAL_REHEARSAL";
      let rawSource: string | undefined;
      const active = handleRef.current;
      if (nano === "ready" && active) {
        mode = "ONLY_ON_DEVICE";
        try {
          const result = await active.models.integrity.generateContent(integrityPrompt(textNow));
          const response = looseResponse(result);
          rawSource = response.inferenceSource;
          badge = normalizeInferenceSource(rawSource, "BLOCKED");
          if (badge !== "ON_DEVICE") {
            throw new AirlockBlocked("Airlock sealed: the integrity scan did not stay on device.");
          }
          const parsed = parseInjectionResponse(response.text());
          if (parsed) {
            const seen = new Set(local.spans.map((span) => span.text));
            local = {
              verdict: mergeVerdict(local.verdict, parsed.verdict),
              spans: [...local.spans, ...parsed.spans.filter((span) => !seen.has(span.text))],
            };
          }
        } catch (error) {
          if (error instanceof AirlockBlocked) throw error;
          mode = "LOCAL_REHEARSAL";
          badge = "LOCAL_REHEARSAL";
          setNano("unavailable");
          setError("Airlock sealed: the local stage cannot run. The local instruction screen still ran. Nothing was sent to the cloud.");
        }
      }
      const ack = needsAcknowledgement(local.verdict, policy.scanStrictness);
      setScan(local);
      setStripped(policy.injectionPolicy === "redact_and_warn" ? true : !ack);
      setPrepared(null);
      setDraft(null);
      setPhase("scanned");
      pushCall("Integrity scan", mode, badge, rawSource);
      await record({
        step: "scan",
        mode,
        inferenceSource: badge,
        entityCounts: entityCounts(spans),
        injectionBlocked: local.verdict === "INJECTION_DETECTED",
        policyVersion: policy.policyVersion,
        payloadHash: "none",
        rawSource,
      });
    } catch (error) {
      setError(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  function stripInstructions() {
    setStripped(true);
    setNotice("Hidden instructions will be removed from the outbound text. They stay visible here.");
  }

  async function release() {
    if (!scan) {
      setError("Run the integrity scan before release.");
      return;
    }
    const ack = needsAcknowledgement(scan.verdict, policy.scanStrictness);
    if (ack && !stripped) {
      setError("Strip the hidden instructions before anything can leave this device.");
      return;
    }
    if (!confirmed) {
      setError("Confirm that you reviewed the spans.");
      return;
    }
    if (!payer.trim() || !denial.trim()) {
      setError("Add the payer and the denial reason. Those fields are not patient identifiers.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const quotes = ack ? scan.spans.map((span) => span.text) : [];
      const next = prepareAirlock({
        text: sourceText,
        spans,
        injectionQuotes: quotes,
        payer,
        denialReason: denial,
        policyVersion: policy.policyVersion,
        existingMap: fixedMap.current,
      });
      assertPayloadHasNoSecrets(next.payload, next.secrets);
      if (!cloudFallbackAllowed(policy) && next.json.includes("data:image")) {
        throw new AirlockBlocked("Release blocked. Image data was found in the payload.");
      }
      setPrepared(next);
      setPreviewMap(next.tokenMap);
      setDraft(null);
      setRestored("");
      setLeak(null);
      setHandout("");
      setPhase("released");
      const payloadHash = await sha256Hex(next.json);
      if (sessionKey.current) {
        try {
          const sealed = await encryptJson(sessionKey.current, next.tokenMap);
          await saveSealedMap(sealed);
        } catch {
          setNotice("The token map stays in memory. This browser did not open encrypted session storage.");
        }
      }
      pushCall("Release", "NONE", "LOCAL_REHEARSAL");
      await record({
        step: "release",
        mode: "NONE",
        inferenceSource: "LOCAL_REHEARSAL",
        entityCounts: entityCounts(spans),
        injectionBlocked: scan.verdict === "INJECTION_DETECTED",
        policyVersion: policy.policyVersion,
        payloadHash,
      });
    } catch (error) {
      setPrepared(null);
      setError(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  async function draftAppeal() {
    if (!prepared) {
      setError("Release a tokenized payload before drafting.");
      return;
    }
    const active = handleRef.current;
    if (active && !online) {
      setError("You are offline. The cloud draft is blocked. Intake and redaction stay on this device.");
      pushCall("Appeal", "ONLY_IN_CLOUD", "BLOCKED");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const prompt = appealPrompt(prepared.json);
      assertSafeForCloudFallback(prompt, prepared.secrets);
      assertPayloadHasNoSecrets(prepared.payload, prepared.secrets);
      let nextDraft: AppealDraft;
      let mode: RouteMode = "LOCAL_REHEARSAL";
      let badge: InferenceBadge = "LOCAL_REHEARSAL";
      let rawSource: string | undefined;
      let nextGrounding: GroundingView | null = null;
      if (active) {
        try {
          mode = "ONLY_IN_CLOUD";
          let result: { response: { text: () => string } };
          try {
            result = await active.models.appeal.generateContent(prompt);
          } catch (error) {
            const message = error instanceof Error ? error.message : "";
            if (/429|quota|rate-limit|billing details/i.test(message)) throw error;
            result = await active.models.appealText.generateContent(prompt);
          }
          const response = looseResponse(result);
          rawSource = response.inferenceSource;
          badge = normalizeInferenceSource(rawSource, "BLOCKED");
          if (badge !== "IN_CLOUD") {
            throw new AirlockBlocked("The appeal did not stay in the cloud. The payload was tokens only, and it was not retried on device.");
          }
          nextDraft = parseAppeal(response.text());
          nextGrounding = readGrounding(response);
        } catch (error) {
          if (error instanceof AirlockBlocked) throw error;
          nextDraft = rehearsalAppeal(prepared.payload);
          mode = "LOCAL_REHEARSAL";
          badge = "LOCAL_REHEARSAL";
          rawSource = undefined;
          nextGrounding = null;
          setNotice("The cloud draft is temporarily unavailable. This letter is a local draft from the tokenized payload. Identifiers never left this device.");
        }
      } else {
        nextDraft = rehearsalAppeal(prepared.payload);
      }
      setDraft(nextDraft);
      setGrounding(nextGrounding);
      setRestored("");
      setLeak(null);
      setHandout("");
      setHandoutTokenized("");
      setPhase("drafted");
      pushCall("Appeal draft", mode, badge, rawSource);
      await record({
        step: "appeal",
        mode,
        inferenceSource: badge,
        entityCounts: entityCounts(spans),
        injectionBlocked: scan?.verdict === "INJECTION_DETECTED",
        policyVersion: policy.policyVersion,
        payloadHash: await sha256Hex(prepared.json),
        rawSource,
      });
    } catch (error) {
      setError(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  async function restoreNames() {
    if (!draft || !prepared) return;
    setBusy(true);
    setError(null);
    try {
      const local = checkLeaks(draft.letter, prepared.tokenMap, prepared.json);
      let findings = [...local.findings];
      let nanoState: LeakState["nano"] = "not_run";
      let mode: RouteMode = "LOCAL_REHEARSAL";
      let badge: InferenceBadge = "LOCAL_REHEARSAL";
      let rawSource: string | undefined;
      const active = handleRef.current;
      if (nano === "ready" && active) {
        mode = "ONLY_ON_DEVICE";
        try {
          assertSafeForCloudFallback(draft.letter, prepared.secrets);
          const result = await active.models.leak.generateContent(leakPrompt(draft.letter));
          const response = looseResponse(result);
          rawSource = response.inferenceSource;
          badge = normalizeInferenceSource(rawSource, "BLOCKED");
          if (badge !== "ON_DEVICE") {
            throw new AirlockBlocked("Airlock sealed: the leak check did not stay on device.");
          }
          const parsed = parseLeakResponse(response.text());
          if (!parsed) nanoState = "failed";
          else if (parsed.verdict === "LEAK") {
            nanoState = "leak";
            for (const span of parsed.spans) {
              findings.push({ kind: "pattern", detail: span.reason, value: span.text });
            }
          } else nanoState = "clean";
        } catch (error) {
          if (error instanceof AirlockBlocked) throw error;
          nanoState = "failed";
          mode = "LOCAL_REHEARSAL";
          badge = "LOCAL_REHEARSAL";
          setError("The on-device identifier check did not run. The automatic identifier check still ran on the draft.");
        }
      }
      const unique: LeakCheck["findings"] = [];
      for (const finding of findings) {
        if (!unique.some((item) => item.value === finding.value && item.detail === finding.detail)) unique.push(finding);
      }
      setLeak({ ok: unique.length === 0, findings: unique, nano: nanoState });
      setRestored(rehydrate(draft.letter, prepared.tokenMap));
      setPhase("restored");
      pushCall("Leak check", mode, badge, rawSource);
      await record({
        step: "leak_check",
        mode,
        inferenceSource: badge,
        entityCounts: entityCounts(spans),
        injectionBlocked: scan?.verdict === "INJECTION_DETECTED",
        policyVersion: policy.policyVersion,
        payloadHash: await sha256Hex(prepared.json),
        rawSource,
      });
    } catch (error) {
      setError(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  async function writeHandout() {
    if (!draft || !prepared) return;
    setBusy(true);
    setError(null);
    try {
      assertSafeForCloudFallback(draft.letter, prepared.secrets);
      const prompt = handoutPrompt(draft.letter);
      assertSafeForCloudFallback(prompt, prepared.secrets);
      const active = handleRef.current;
      let tokenized: string;
      let mode: RouteMode = "LOCAL_REHEARSAL";
      let badge: InferenceBadge = "LOCAL_REHEARSAL";
      let rawSource: string | undefined;
      if (active) {
        try {
          mode = "PREFER_ON_DEVICE";
          const onProgress = (value: number) => setProgress(Math.round(value * 10000) / 100);
          try {
            await active.models.handout.initializeDeviceModel(onProgress);
          } catch {
            setNotice("The on-device handout model did not start. The handout still uses only the tokenized letter.");
          }
          const result = await active.models.handout.generateContent(prompt);
          const response = looseResponse(result);
          rawSource = response.inferenceSource;
          badge = normalizeInferenceSource(rawSource, "IN_CLOUD");
          tokenized = response.text().trim();
        } catch (error) {
          if (error instanceof AirlockBlocked) throw error;
          tokenized = rehearsalHandout(draft.letter);
          mode = "LOCAL_REHEARSAL";
          badge = "LOCAL_REHEARSAL";
          rawSource = undefined;
          setNotice("The cloud handout is temporarily unavailable. This handout is a local draft from the tokenized letter. Identifiers never left this device.");
        }
      } else {
        tokenized = rehearsalHandout(draft.letter);
      }
      const invented = checkLeaks(tokenized, prepared.tokenMap, prepared.json);
      if (!invented.ok) {
        throw new AirlockBlocked("Handout held. The draft contained an identifier, so names were not restored into it.");
      }
      assertSafeForCloudFallback(tokenized, prepared.secrets);
      setHandoutTokenized(tokenized);
      setHandout(rehydrate(tokenized, prepared.tokenMap));
      setPhase("handout");
      pushCall("Patient handout", mode, badge, rawSource);
      await record({
        step: "handout",
        mode,
        inferenceSource: badge,
        entityCounts: entityCounts(spans),
        injectionBlocked: scan?.verdict === "INJECTION_DETECTED",
        policyVersion: policy.policyVersion,
        payloadHash: await sha256Hex(prepared.json),
        rawSource,
      });
    } catch (error) {
      setError(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  async function copyLetter() {
    if (!leak?.ok || !restored) return;
    await navigator.clipboard.writeText(restored);
    setNotice("Copied the restored letter. It never went back to the cloud.");
  }

  function printLetter() {
    if (!leak?.ok || !restored) return;
    window.print();
  }

  async function signInEmail(email: string, password: string) {
    if (!handle) return;
    setAuthError(null);
    try {
      await signInWithEmailAndPassword(handle.auth, email.trim(), password);
    } catch (error) {
      setAuthError(authErrorText(error));
    }
  }

  async function signOutUser() {
    if (!handle) return;
    await signOut(handle.auth);
  }

  const held = Boolean(scan && needsAcknowledgement(scan.verdict, policy.scanStrictness) && !stripped);
  const sealed = nano !== "ready";

  return {
    handle,
    user,
    authReady,
    policy,
    nano,
    progress,
    online,
    caseId,
    judge,
    sourceText,
    imageUrl,
    visionNote,
    tokenNote,
    spans,
    payer,
    denial,
    patientName,
    patientMrn,
    previewMap,
    phase,
    scan,
    stripped,
    confirmed,
    setConfirmed,
    exceptionConfirmed,
    setExceptionConfirmed,
    prepared,
    calls,
    draft,
    grounding,
    restored,
    leak,
    handoutTokenized,
    handout,
    ledger,
    error,
    notice,
    busy,
    authError,
    held,
    sealed,
    appCheckEnabled: Boolean(handle?.appCheckEnabled),
    loadFixture,
    editSource,
    editPayer,
    editDenial,
    useImage,
    enableNano,
    detect,
    toggleSpan,
    addSpan,
    scanDoc,
    stripInstructions,
    release,
    draftAppeal,
    restoreNames,
    writeHandout,
    copyLetter,
    printLetter,
    signInEmail,
    signOutUser,
  };
}

export type AirlockController = ReturnType<typeof useAirlock>;
