import { describe, expect, it } from "vitest";
import { FAILED_LOGIN_WINDOW_MS, MAX_FAILED_LOGINS } from "../src/application/login-throttle";
import { A_CLIENT, ANOTHER_CLIENT, aClock, aThrottleWithFailures } from "./builders";

describe("Login throttle", () => {
  it("should allow sign in when a client has fewer failures than the limit", () => {
    const throttle = aThrottleWithFailures(MAX_FAILED_LOGINS - 1);
    expect(throttle.check(A_CLIENT)).toEqual({ ok: true, value: true });
  });

  it("should refuse sign in when a client reaches the failure limit", () => {
    const throttle = aThrottleWithFailures(MAX_FAILED_LOGINS);
    expect(throttle.check(A_CLIENT)).toMatchObject({ ok: false, error: "too_many_attempts" });
  });

  it("should not refuse another client when one client reaches the failure limit", () => {
    const throttle = aThrottleWithFailures(MAX_FAILED_LOGINS);
    expect(throttle.check(ANOTHER_CLIENT)).toEqual({ ok: true, value: true });
  });

  it("should allow sign in again when the failure window has passed", () => {
    const clock = aClock();
    const throttle = aThrottleWithFailures(MAX_FAILED_LOGINS, clock);
    clock.advanceBy(FAILED_LOGIN_WINDOW_MS);
    expect(throttle.check(A_CLIENT)).toEqual({ ok: true, value: true });
  });

  it("should clear the failures when the client signs in successfully", () => {
    const throttle = aThrottleWithFailures(MAX_FAILED_LOGINS);
    throttle.recordSuccess(A_CLIENT);
    expect(throttle.check(A_CLIENT)).toEqual({ ok: true, value: true });
  });
});
