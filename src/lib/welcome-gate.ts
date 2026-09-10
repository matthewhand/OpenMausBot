/** First-run email/onboarding overlay must not sticky-block Console paint.

A fresh Edge profile has empty localStorage, so `emailGateDone()` is false even
when the server already has a profile and bots. Showing an opaque full-screen
Welcome overlay in that case paints a black pane over sidebar/main. */
export type WelcomeGateDecision =
  | { show: false; reason: "already-done" }
  | { show: false; reason: "pending-hydration" }
  | { show: false; reason: "existing-install" }
  | { show: true; reason: "first-run" };

export function welcomeGateDecision(opts: {
  emailGateDone: boolean;
  connected: boolean;
  profile?: { name?: string; email?: string } | null;
  botCount: number;
}): WelcomeGateDecision {
  if (opts.emailGateDone) return { show: false, reason: "already-done" };
  // Paint the shell while config/bots hydrate. Overlaying Welcome here is the
  // black-pane FAIL: a reseeded browser looks like a first run until SSE lands.
  if (!opts.connected) return { show: false, reason: "pending-hydration" };
  const named = Boolean(opts.profile?.name?.trim() || opts.profile?.email?.trim());
  if (named || opts.botCount > 0) return { show: false, reason: "existing-install" };
  return { show: true, reason: "first-run" };
}
