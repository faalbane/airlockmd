# Devpost write up

Use this on the #BuildHybridAI 2026 form. Edit it if the hosted build differs.

**Name:** AirlockMD

**Tagline:** Cloud intelligence, local identity.

**Built with:** Firebase AI Logic Hybrid Inference, Gemini Nano 4 on Chrome, Gemini 3.5 Flash Lite, Grounding with Google Search, App Check, Authentication, Cloud Firestore, Remote Config, Firebase Hosting.

## Description

I built AirlockMD for prior auth and billing staff at small practices. They already spend too much of the week writing insurance appeals. A cloud model is useful for payer policy and guideline citations, but dropping a chart note or a photo of a referral into a consumer chatbot sends patient identifiers off the device. A lot of clinics still do it because they do not have a better option.

AirlockMD splits the work by trust, using Firebase AI Logic hybrid inference.

Gemini Nano 4 runs only on the device. It reads the note or the JPEG/PNG, flags likely identifiers across the HIPAA Safe Harbor categories, and helps the staff review and tokenize them. A regex net sits underneath so obvious patterns like SSNs and phone numbers are not left to the model alone. A second on-device pass looks for hidden instructions in the incoming document, the kind of thing you would see in a poisoned fax, and strips them before anything is released. If Nano is not available, the airlock stays sealed. That stage never falls back to the cloud.

Cloud Gemini only ever sees the tokenized summary. It drafts the appeal with Grounding with Google Search so citations can be checked. The letter comes back still tokenized. The browser puts the real names back, then Nano and the regex net check the result for leaks. A plain language patient handout uses the prefer on device mode, but only on the tokenized letter, so a cloud fallback is still safe.

The Airlock Inspector is the proof. It shows the exact payload that left the browser, and you can search it for the patient's name. You should get zero matches. Images never leave memory. The token map never leaves the session. The Firestore ledger stores counts, inference source, and whether an injection was blocked, not the chart.

I built this as a web app on Firebase Hosting so judges can open it in Chrome. I work on AI security and privacy for a living, and I wanted a demo where hybrid inference is the product: the device holds identity, the cloud holds knowledge, and the device checks what comes back.

All cases in the demo are synthetic.

If Firebase config is not present, the same desk runs as a local rehearsal. That path does not call another model API. It does not send raw notes anywhere. Judge mode is a pre tokenized synthetic case for the cloud draft when Nano is absent.

## How I used Firebase AI Logic

- `InferenceMode.ONLY_ON_DEVICE` for identifier extraction (structured JSON), image intake, the integrity scan, and the leak check. `initializeDeviceModel()` runs on a user gesture, with download progress in the UI.
- `InferenceMode.ONLY_IN_CLOUD` with `inCloudParams.model = "gemini-3.5-flash-lite"` and `tools: [{ googleSearch: {} }]` for the appeal.
- `InferenceMode.PREFER_ON_DEVICE` for the patient handout, on de identified text only. Rehydrated text is refused before that call.
- Every response surfaces `inferenceSource` in the UI.
- App Check is enforced, with limited use tokens, once the project is configured. Auth, Firestore, Remote Config, and Hosting complete the app.

## Testing instructions

1. Open the hosted URL in Chrome Desktop 139 or newer.
2. For on-device features, enable the Gemini Nano and Prompt API flags listed in the README, restart Chrome, and click "Enable on-device model." The first download can take several minutes.
3. Use the published test login in this form (judge account, no real personal data). Suggested email: judge@airlockmd.example. The password is only in this form.
4. Click the "Referral with identifiers" fixture, run Release, then Draft Appeal. In the Inspector, search the patient name. You should see 0 matches.
5. Run the "Poisoned fax" fixture and confirm the hidden instruction is blocked.
6. If Nano is not available on your machine, use Judge mode. The banner will say the local model is absent, intake will not send raw notes to the cloud, and a pre tokenized case can still show the cloud draft path.
7. To run the repo without a Firebase project, `npm install` and `npm run dev`. The sealed banner stays up, synthetic cases still tokenize, and the letter is a local template until config is added.

## Claims this write up does not make

The app is not described as HIPAA compliant, certified, or covered by a BAA. Detection is not described as complete or guaranteed. The scan is not described as immune to prompt injection. The letter is not medical advice or a coverage decision. The app is not claimed to work fully offline. The ledger is not called a HIPAA audit log. No accuracy number or time saved figure is stated.
