import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import process from "node:process";
import type { ApiResult } from "@fineos/contracts";
import { apiErr, apiOk } from "./api-result";

// ponytail: stateless HMAC-SHA256 session token in stdlib node:crypto, no DB session table.
// Upgrade path: move to server-side session store if per-session revocation is needed.
const DEFAULT_DEV_PASSWORD = "fineos";
const HASH_ALGORITHM = "sha256";
const TOKEN_SEPARATOR = ".";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const SECRET_BYTES = 32;
const DEFAULT_SECRET = randomBytes(SECRET_BYTES).toString("hex");
const INVALID_CREDENTIALS_MESSAGE = "The supplied credentials were not recognized.";
const UNAUTHORIZED_MESSAGE = "Authentication required.";

export interface Credentials {
  readonly username: string;
  readonly password: string;
}

export interface Session {
  readonly token: string;
  readonly username: string;
}

interface TokenPayload {
  readonly username: string;
  readonly exp: number;
}

const expectedPassword = (): string =>
  process.env.FINEOS_PASSWORD ?? DEFAULT_DEV_PASSWORD;

const sessionSecret = (): string =>
  process.env.FINEOS_SESSION_SECRET ?? DEFAULT_SECRET;

const digest = (value: string): Buffer =>
  createHash(HASH_ALGORITHM).update(value).digest();

const safeEquals = (left: string, right: string): boolean =>
  timingSafeEqual(digest(left), digest(right));

const signPayload = (payloadB64: string): string =>
  createHmac(HASH_ALGORITHM, sessionSecret()).update(payloadB64).digest("base64url");

const encodePayload = (username: string): string =>
  Buffer.from(JSON.stringify({ username, exp: Date.now() + SESSION_TTL_MS })).toString("base64url");

const issueToken = (username: string): string => {
  const payloadB64 = encodePayload(username);
  return `${payloadB64}${TOKEN_SEPARATOR}${signPayload(payloadB64)}`;
};

const decodePayload = (payloadB64: string): TokenPayload | null => {
  try {
    return JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as TokenPayload;
  } catch {
    return null;
  }
};

const isValidPayload = (payload: TokenPayload | null): payload is TokenPayload =>
  Boolean(payload && typeof payload.username === "string" && payload.exp > Date.now());

const verifySignedParts = (payloadB64: string | undefined, signature: string | undefined): TokenPayload | null => {
  if (!payloadB64 || !signature || !safeEquals(signature, signPayload(payloadB64))) return null;
  const payload = decodePayload(payloadB64);
  return isValidPayload(payload) ? payload : null;
};

export const authenticate = (
  input: Credentials,
): ApiResult<Session, "invalid_credentials"> =>
  safeEquals(input.password, expectedPassword())
    ? apiOk({ token: issueToken(input.username), username: input.username })
    : apiErr("invalid_credentials", INVALID_CREDENTIALS_MESSAGE);

export const verifySessionToken = (
  token: string | undefined,
): ApiResult<Session, "unauthorized"> => {
  const [payloadB64, signature] = (token ?? "").split(TOKEN_SEPARATOR);
  const payload = verifySignedParts(payloadB64, signature);
  return payload
    ? apiOk({ token: token as string, username: payload.username })
    : apiErr("unauthorized", UNAUTHORIZED_MESSAGE);
};
