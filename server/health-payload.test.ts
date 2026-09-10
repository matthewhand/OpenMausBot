import { describe, expect, it } from "vitest";

import { healthPayload, withViteSotHealth } from "./health-payload.ts";

describe("healthPayload", () => {
  it("reports static:true only when OMB_STATIC_DIR is configured", () => {
    expect(
      healthPayload({ pid: 12, staticDirConfigured: true, authRequired: false }),
    ).toEqual({
      app: "openmausbot",
      pid: 12,
      static: true,
      authRequired: false,
    });
    expect(
      healthPayload({ pid: 12, staticDirConfigured: false, authRequired: false }).static,
    ).toBe(false);
  });

  it("marks Vite-proxied health as static:false even if the API has dist", () => {
    expect(withViteSotHealth({ app: "openmausbot", pid: 9, static: true, authRequired: false })).toEqual({
      app: "openmausbot",
      pid: 9,
      static: false,
      authRequired: false,
    });
  });
});
