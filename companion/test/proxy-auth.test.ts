// Sidecar outbound auth: phone bearer authenticates the sidecar; the harness
// sees OMB_AUTH_TOKEN (or nothing). A stub harness records the header.
import { createServer, type IncomingMessage, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";

import { createProxyHandler } from "../src/proxy.ts";

const PHONE = "omb_phone_token";

const listen = (server: Server): Promise<number> =>
  new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve((server.address() as { port: number }).port));
  });

const close = (server: Server | undefined): Promise<void> =>
  new Promise((resolve) => (server ? server.close(() => resolve()) : resolve()));

describe("sidecar presents OMB_AUTH_TOKEN, not the phone bearer", () => {
  const previous = process.env.OMB_AUTH_TOKEN;
  let harness: Server | undefined;
  let sidecar: Server | undefined;

  afterEach(async () => {
    await close(sidecar);
    await close(harness);
    sidecar = undefined;
    harness = undefined;
    if (previous === undefined) delete process.env.OMB_AUTH_TOKEN;
    else process.env.OMB_AUTH_TOKEN = previous;
  });

  it("attaches the harness token instead of forwarding the phone Authorization", async () => {
    process.env.OMB_AUTH_TOKEN = "harness-secret";
    let seenAuth: string | undefined;
    harness = createServer((req: IncomingMessage, res) => {
      seenAuth = req.headers.authorization;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ bots: [] }));
    });
    const harnessPort = await listen(harness);
    sidecar = createServer(
      createProxyHandler({
        harnessPort,
        authenticate: (t) => t === PHONE,
        redeem: () => ({ error: "no" }),
        serverName: () => "Test computer",
      }),
    );
    const port = await listen(sidecar);

    const res = await fetch(`http://127.0.0.1:${port}/api/bots`, {
      headers: { authorization: `Bearer ${PHONE}` },
    });
    expect(res.status).toBe(200);
    expect(seenAuth).toBe("Bearer harness-secret");
    expect(seenAuth).not.toContain(PHONE);
  });

  it("does not forward the phone Authorization when OMB_AUTH_TOKEN is unset", async () => {
    delete process.env.OMB_AUTH_TOKEN;
    let seenAuth: string | undefined;
    harness = createServer((req: IncomingMessage, res) => {
      seenAuth = req.headers.authorization;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ bots: [] }));
    });
    const harnessPort = await listen(harness);
    sidecar = createServer(
      createProxyHandler({
        harnessPort,
        authenticate: (t) => t === PHONE,
        redeem: () => ({ error: "no" }),
        serverName: () => "Test computer",
      }),
    );
    const port = await listen(sidecar);

    const res = await fetch(`http://127.0.0.1:${port}/api/bots`, {
      headers: { authorization: `Bearer ${PHONE}` },
    });
    expect(res.status).toBe(200);
    expect(seenAuth).toBeUndefined();
  });
});
