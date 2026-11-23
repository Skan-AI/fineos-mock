import type { ApiResult } from "@fineos/contracts";
import { apiErr, apiOk } from "./api-result";

export const MAX_FAILED_LOGINS = 10;
export const FAILED_LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_TRACKED_CLIENTS = 10_000;
const TOO_MANY_ATTEMPTS_MESSAGE = "Too many failed sign-in attempts. Try again later.";

interface FailureWindow {
  readonly count: number;
  readonly resetsAt: number;
}

type FailureLog = Map<string, FailureWindow>;

export interface LoginThrottle {
  readonly check: (clientId: string) => ApiResult<true, "too_many_attempts">;
  readonly recordFailure: (clientId: string) => void;
  readonly recordSuccess: (clientId: string) => void;
}

const activeWindow = (failures: FailureLog, clientId: string, at: number): FailureWindow | undefined => {
  const window = failures.get(clientId);
  return window && window.resetsAt > at ? window : undefined;
};

const nextWindow = (current: FailureWindow | undefined, at: number): FailureWindow => ({
  count: (current?.count ?? 0) + 1,
  resetsAt: current?.resetsAt ?? at + FAILED_LOGIN_WINDOW_MS,
});

const isBlocked = (failures: FailureLog, clientId: string, at: number): boolean =>
  (activeWindow(failures, clientId, at)?.count ?? 0) >= MAX_FAILED_LOGINS;

const addFailure = (failures: FailureLog, clientId: string, at: number): void => {
  if (failures.size >= MAX_TRACKED_CLIENTS) failures.clear();
  failures.set(clientId, nextWindow(activeWindow(failures, clientId, at), at));
};

// ponytail: in-memory and per instance, so each Cloud Run instance counts on its own and a
// restart clears the counts. Move the counts to a shared store if the service scales out.
export const createLoginThrottle = (now: () => number = Date.now): LoginThrottle => {
  const failures: FailureLog = new Map();
  return {
    check: (clientId) =>
      isBlocked(failures, clientId, now()) ? apiErr("too_many_attempts", TOO_MANY_ATTEMPTS_MESSAGE) : apiOk(true),
    recordFailure: (clientId) => addFailure(failures, clientId, now()),
    recordSuccess: (clientId) => void failures.delete(clientId),
  };
};
