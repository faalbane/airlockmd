import type { OutboundPayload } from "../types";

export type AppealDraft = {
  title: string;
  letter: string;
  citedFacts: string[];
};

export function rehearsalAppeal(payload: OutboundPayload): AppealDraft {
  const summary = payload.clinicalSummary;
  const who = summary.match(/\[PATIENT_\d+\]/)?.[0] ?? "the member";
  const plan = summary.match(/\[PLAN_ID_\d+\]/)?.[0];
  const letter = [
    payload.payer,
    "Appeals and Grievances",
    "",
    `Re: reconsideration request for ${who}${plan ? `, member ${plan}` : ""}`,
    "",
    "To the appeals reviewer,",
    "",
    "Please reconsider the denial described below. This draft is for clinic staff to edit. It is not a coverage decision and it is not medical advice.",
    "",
    `Denial reason: ${payload.denialReason}`,
    "",
    "Tokenized clinical summary:",
    summary,
    "",
    "The summary describes conservative care and a remaining functional limit. Please review the request against the plan's published medical policy.",
    "",
    "Bracketed tokens are placeholders. The laptop restores names only after this draft returns. Do not try to guess the missing identifiers.",
    "",
    "Thank you,",
    "Prior authorization team",
    "Synthetic clinic demo",
  ].join("\n");

  return {
    title: `Request for reconsideration for ${who}`,
    letter,
    citedFacts: [
      "Rehearsal draft: Google Search grounding did not run. With Firebase AI Logic configured, this panel lists live citations and the required Search suggestions.",
    ],
  };
}

export function rehearsalHandout(tokenizedLetter: string): string {
  const who = tokenizedLetter.match(/\[PATIENT_\d+\]/)?.[0] ?? "you";
  const preview = tokenizedLetter.split("\n").slice(0, 14).join("\n");
  return [
    `A note for ${who}`,
    "",
    "The clinic is asking the health plan to take another look at a denied request. The plan's stated reason is in the appeal the staff prepared.",
    "",
    "This note does not promise that the plan will approve the request. It is not medical advice. The care team can explain the next step.",
    "",
    "A short version of the tokenized appeal follows.",
    "",
    preview,
  ].join("\n");
}
