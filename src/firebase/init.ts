import { getApps, initializeApp, type FirebaseApp, type FirebaseOptions } from "firebase/app";
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  ReCaptchaV3Provider,
  type AppCheck,
} from "firebase/app-check";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getRemoteConfig, type RemoteConfig } from "firebase/remote-config";
import { createAirlockModels, type AirlockModels } from "./models";

export type FirebaseHandle = {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  remoteConfig: RemoteConfig;
  models: AirlockModels;
  appCheckEnabled: boolean;
};

type RuntimeConfig = FirebaseOptions & {
  recaptchaSiteKey?: string;
  recaptchaProvider?: string;
};

function fromEnv(): RuntimeConfig | null {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY?.trim();
  const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN?.trim();
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim();
  const appId = import.meta.env.VITE_FIREBASE_APP_ID?.trim();
  if (!apiKey || !authDomain || !projectId || !appId) return null;
  return {
    apiKey,
    authDomain,
    projectId,
    appId,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET?.trim() || undefined,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID?.trim() || undefined,
    recaptchaSiteKey: import.meta.env.VITE_RECAPTCHA_SITE_KEY?.trim() || undefined,
    recaptchaProvider: import.meta.env.VITE_RECAPTCHA_PROVIDER?.trim() || "enterprise",
  };
}

function usable(config: RuntimeConfig | null): config is RuntimeConfig {
  if (!config?.apiKey || !config.authDomain || !config.projectId || !config.appId) return false;
  if (config.apiKey.includes("YOUR_")) return false;
  if (config.projectId.includes("YOUR_")) return false;
  return true;
}

async function fromRuntimeFile(): Promise<RuntimeConfig | null> {
  try {
    const response = await fetch("/firebase-config.json", { cache: "no-store" });
    if (!response.ok) return null;
    const json = (await response.json()) as RuntimeConfig;
    return usable(json) ? json : null;
  } catch {
    return null;
  }
}

let boot: Promise<FirebaseHandle | null> | null = null;

export function bootFirebase(): Promise<FirebaseHandle | null> {
  if (!boot) boot = start();
  return boot;
}

async function start(): Promise<FirebaseHandle | null> {
  const envConfig = fromEnv();
  const config = usable(envConfig) ? envConfig : await fromRuntimeFile();
  if (!config) return null;

  const app = getApps()[0] ?? initializeApp(config);
  const appCheckEnabled = enableAppCheck(app, config);
  return {
    app,
    auth: getAuth(app),
    db: getFirestore(app),
    remoteConfig: getRemoteConfig(app),
    models: createAirlockModels(app),
    appCheckEnabled,
  };
}

function enableAppCheck(app: FirebaseApp, config: RuntimeConfig): boolean {
  const debug = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN?.trim();
  if (debug) {
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = debug === "true" ? true : debug;
  }
  const siteKey = config.recaptchaSiteKey?.trim();
  if (!siteKey || siteKey.includes("YOUR_")) return false;
  const provider =
    (config.recaptchaProvider || "enterprise").toLowerCase() === "v3"
      ? new ReCaptchaV3Provider(siteKey)
      : new ReCaptchaEnterpriseProvider(siteKey);
  initializeAppCheck(app, {
    provider,
    isTokenAutoRefreshEnabled: true,
  });
  return true;
}

export type { AppCheck };
