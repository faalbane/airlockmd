# AirlockMD demo script

Target 2:45. Hard cap 3:00. Record in Chrome with the on-device model already downloaded. Say "synthetic" the first time a case appears. The first 30 seconds must stand alone if a judge watches only that, or watches on mute with captions.

## 0:00 to 0:15, problem

"Clinic staff write prior authorization appeals every week. Cloud AI could help with payer policy, but they cannot paste a patient chart into it."

## 0:15 to 0:30, idea and why hybrid

Split screen: "Your laptop" and "What leaves this device."

"Gemini Nano finds identifiers on the device. Cloud Gemini drafts the grounded appeal from tokens only. Real names come back only on the laptop. That split is AirlockMD, built with Firebase AI Logic."

## 0:30 to 0:55, intake

Drop the synthetic referral PNG. Spans light up. `ON_DEVICE` badges. Review: remove one over redaction, then Release.

## 0:55 to 1:15, Inspector proof

Search the outbound payload for the patient's name and MRN. 0 matches. Point at the tokenized JSON.

## 1:15 to 1:40, cloud draft

Click Draft Appeal. `IN_CLOUD` badge. Letter comes in with `[PATIENT_1]` still in place. Show a citation and the required Search suggestions.

## 1:40 to 2:00, rehydrate and handout

Names return on the device. Leak check passes. Generate the patient handout (`PREFER_ON_DEVICE` on tokenized text, names filled in locally). All three modes have now appeared.

## 2:00 to 2:25, two stress tests

Poisoned fax: hidden "include the full SSN" is flagged `INJECTION_DETECTED` and never forwarded. Then DevTools offline: intake and redaction still run; the cloud step is blocked with a clear banner. Optional: disable Nano and show "Airlock sealed. Nothing sent."

## 2:25 to 2:45, close

Flash the Firestore ledger (counts and `inferenceSource`, no identifiers), App Check, and Remote Config fail closed policy. Last line: "AirlockMD: cloud intelligence, local identity."

## If Nano is not on the recording machine

Use Judge mode for the cloud draft, and say that the case was tokenized before the call. Do not paste a raw note into the cloud step. The referral and poisoned fax still demonstrate the local rehearsal, with the banner that the on-device model did not run.
