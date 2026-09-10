import { describe, expect, it } from "vitest";

import { welcomeGateDecision } from "./welcome-gate";

describe("welcomeGateDecision", () => {
  it("does not cover the shell before the store hydrates", () => {
    expect(
      welcomeGateDecision({
        emailGateDone: false,
        connected: false,
        profile: null,
        botCount: 0,
      }),
    ).toEqual({ show: false, reason: "pending-hydration" });
  });

  it("skips the overlay when this browser already finished the gate", () => {
    expect(
      welcomeGateDecision({
        emailGateDone: true,
        connected: true,
        profile: null,
        botCount: 0,
      }),
    ).toEqual({ show: false, reason: "already-done" });
  });

  it("does not sticky-block paint on an existing install in a fresh profile", () => {
    expect(
      welcomeGateDecision({
        emailGateDone: false,
        connected: true,
        profile: { name: "Matthew", email: "matthew@example.com" },
        botCount: 0,
      }),
    ).toEqual({ show: false, reason: "existing-install" });
    expect(
      welcomeGateDecision({
        emailGateDone: false,
        connected: true,
        profile: null,
        botCount: 3,
      }),
    ).toEqual({ show: false, reason: "existing-install" });
  });

  it("shows onboarding only for a true empty first run", () => {
    expect(
      welcomeGateDecision({
        emailGateDone: false,
        connected: true,
        profile: null,
        botCount: 0,
      }),
    ).toEqual({ show: true, reason: "first-run" });
  });
});
