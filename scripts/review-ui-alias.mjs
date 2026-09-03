#!/usr/bin/env node
// TCP alias so the historical LAN UI port (5199) still reaches the review
// Vite on 8802. HMR, SSE, and POSTs all ride the same byte stream.
import net from "node:net";

const listenPort = Number(process.env.OMB_UI_ALIAS_PORT || 5199);
const targetPort = Number(process.env.OMB_UI_PORT || 8802);
const targetHost = process.env.OMB_UI_ALIAS_TARGET || "127.0.0.1";

const server = net.createServer((client) => {
  const upstream = net.connect(targetPort, targetHost);
  const fail = () => {
    client.destroy();
    upstream.destroy();
  };
  client.on("error", fail);
  upstream.on("error", fail);
  client.pipe(upstream);
  upstream.pipe(client);
});

server.on("error", (error) => {
  console.error(`review-ui-alias ${listenPort}->${targetPort} failed: ${error.message}`);
  process.exit(1);
});

server.listen(listenPort, "0.0.0.0", () => {
  console.log(`review-ui-alias listening on 0.0.0.0:${listenPort} -> ${targetHost}:${targetPort}`);
});
