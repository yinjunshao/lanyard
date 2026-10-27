import { startRegistration, startAuthentication, browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { Api } from "./api";

export const passkeysSupported = () => {
  try { return browserSupportsWebAuthn(); } catch { return false; }
};

// Register a passkey on the current device and mark the account claimed.
export async function registerPasskey() {
  const opts = await Api.registerOptions();
  const att = await startRegistration({ optionsJSON: opts });
  await Api.registerVerify(att);
}

// Sign in with a passkey (this device, a synced one, or a phone via QR).
export async function loginPasskey() {
  const opts = await Api.loginOptions();
  const ass = await startAuthentication({ optionsJSON: opts });
  await Api.loginVerify(ass);
}
