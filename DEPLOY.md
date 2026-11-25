# Deploy AirlockMD

The hosting target is the Vite build in `dist/`.

## 1. Point the Firebase CLI at your project

Edit `.firebaserc` and replace `YOUR_FIREBASE_PROJECT_ID` with the real project id.

```json
{
  "projects": {
    "default": "your-project-id"
  }
}
```

## 2. Supply web config at build time

Create `.env.local` from `.env.example`, or create `public/firebase-config.json` from `firebase-config.example.json`.

You need:

- `apiKey`
- `authDomain`
- `projectId`
- `storageBucket`
- `messagingSenderId`
- `appId`
- reCAPTCHA Enterprise site key, or a v3 site key with `VITE_RECAPTCHA_PROVIDER=v3`
- App Check debug token only on machines that use the debug provider. Do not commit it.

Build so Vite can inline `VITE_*` values:

```bash
npm install
npm run build
```

If you use `public/firebase-config.json`, that file is copied into `dist/` and read when the page loads. It is gitignored. Do not put a debug token in it.

## 3. Console setup before the first cloud call

- Enable Firebase AI Logic.
- Enforce App Check for Firebase AI Logic (Security, App Check, APIs).
- Register the web app with reCAPTCHA Enterprise for the hosted origin. v3 is supported if you set the provider to `v3`.
- For local or judge machines without a production attestation, register the App Check debug token. Set `VITE_APPCHECK_DEBUG_TOKEN` in `.env.local` only.
- Enable Authentication (email and password, and Google if you want the second button). Create the judge user.
- Create a Firestore database. Rules in `firestore.rules` allow a signed in user to create and read only their own audit metadata.
- Publish Remote Config from `remoteconfig.template.json`. `phiCloudFallback` must stay false. The client also refuses identifier fallback if the flag is flipped.

## 4. Deploy

```bash
npx firebase-tools@latest deploy --only hosting
```

To publish rules and Remote Config in the same pass:

```bash
npx firebase-tools@latest deploy --only hosting,firestore:rules,remoteconfig
```

The judge URL is the Hosting domain Firebase prints. Open it in Chrome Desktop 139 or newer.

`firebase.json` serves `dist/` as a single page app. After you change the project id and provide config, `firebase deploy --only hosting` is the hosting step. The package script that produces `dist/` is `npm run build`.
