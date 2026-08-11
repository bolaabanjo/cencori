import { createHash, timingSafeEqual } from "crypto";

export const BASECODE_CALLBACK_URL = "basecode://auth/callback";
export const BASECODE_AUTH_CODE_TTL_MS = 5 * 60 * 1000;

const CODE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const STATE_PATTERN = /^[A-Za-z0-9_-]{43,128}$/;
const VERIFIER_PATTERN = /^[A-Za-z0-9._~-]{43,128}$/;

export function isBasecodeCode(value: unknown): value is string {
  return typeof value === "string" && CODE_PATTERN.test(value);
}

export function isBasecodeChallenge(value: unknown): value is string {
  return typeof value === "string" && CHALLENGE_PATTERN.test(value);
}

export function isBasecodeState(value: unknown): value is string {
  return typeof value === "string" && STATE_PATTERN.test(value);
}

export function isBasecodeVerifier(value: unknown): value is string {
  return typeof value === "string" && VERIFIER_PATTERN.test(value);
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}

export function sameValue(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function basecodeSignInPath(challenge: string, state: string): string {
  const params = new URLSearchParams({ code_challenge: challenge, state });
  return `/basecode/sign-in?${params.toString()}`;
}

export function noStoreHeaders(): HeadersInit {
  return {
    "Cache-Control": "no-store, max-age=0",
    Pragma: "no-cache",
  };
}
