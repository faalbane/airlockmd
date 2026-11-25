import { fetchAndActivate, getValue, type RemoteConfig } from "firebase/remote-config";
import { DEFAULT_POLICY, type Policy } from "../types";

export async function loadPolicy(remoteConfig: RemoteConfig): Promise<Policy> {
  remoteConfig.defaultConfig = {
    phiCloudFallback: "false",
    injectionPolicy: "block",
    scanStrictness: "high",
    policyVersion: DEFAULT_POLICY.policyVersion,
  };
  remoteConfig.settings.minimumFetchIntervalMillis = 60_000;
  try {
    await fetchAndActivate(remoteConfig);
  } catch {
    return DEFAULT_POLICY;
  }
  const injection = getValue(remoteConfig, "injectionPolicy").asString();
  const strictness = getValue(remoteConfig, "scanStrictness").asString();
  const version = getValue(remoteConfig, "policyVersion").asString();
  return {
    phiCloudFallback: getValue(remoteConfig, "phiCloudFallback").asString() === "true",
    injectionPolicy: injection === "redact_and_warn" ? "redact_and_warn" : "block",
    scanStrictness: strictness === "standard" ? "standard" : "high",
    policyVersion: version || DEFAULT_POLICY.policyVersion,
  };
}
