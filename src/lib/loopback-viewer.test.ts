import { describe, expect, it } from "vitest";
import { canOpenExternalUrl, loopbackViewerUsable } from "./loopback-viewer";

describe("loopbackViewerUsable", () => {
  it("allows noVNC only when the page itself is on loopback", () => {
    expect(loopbackViewerUsable("127.0.0.1")).toBe(true);
    expect(loopbackViewerUsable("localhost")).toBe(true);
    expect(loopbackViewerUsable("[::1]")).toBe(true);
    expect(loopbackViewerUsable("::1")).toBe(true);
    expect(loopbackViewerUsable("127.0.0.2")).toBe(true);
    expect(loopbackViewerUsable("::ffff:127.0.0.1")).toBe(true);
    expect(loopbackViewerUsable("[::ffff:127.0.0.1]")).toBe(true);
    expect(loopbackViewerUsable("[::ffff:7f00:1]")).toBe(true);
  });

  it("hides noVNC when the UI is opened over LAN", () => {
    expect(loopbackViewerUsable("10.0.0.32")).toBe(false);
    expect(loopbackViewerUsable("192.168.1.10")).toBe(false);
    expect(loopbackViewerUsable("::ffff:10.0.0.32")).toBe(false);
  });
});

describe("canOpenExternalUrl", () => {
  it("opens cloud desktop URLs from a LAN page", () => {
    expect(canOpenExternalUrl("https://desktop.box.test/join?t=1", "10.0.0.32")).toBe(true);
  });

  it("blocks loopback viewer URLs when the page is on LAN", () => {
    expect(canOpenExternalUrl("http://127.0.0.1:6080/vnc.html", "10.0.0.32")).toBe(false);
    expect(canOpenExternalUrl("http://localhost:6080/vnc.html", "192.168.1.10")).toBe(false);
    expect(canOpenExternalUrl("http://[::1]:6080/vnc.html", "10.0.0.32")).toBe(false);
    expect(canOpenExternalUrl("http://[::ffff:127.0.0.1]:6080/vnc.html", "10.0.0.32")).toBe(false);
  });

  it("allows loopback viewer URLs when the page is on loopback", () => {
    expect(canOpenExternalUrl("http://127.0.0.1:6080/vnc.html", "127.0.0.1")).toBe(true);
    expect(canOpenExternalUrl("http://localhost:6080/vnc.html", "localhost")).toBe(true);
    expect(canOpenExternalUrl("http://[::1]:6080/vnc.html", "::1")).toBe(true);
    expect(canOpenExternalUrl("http://[::ffff:127.0.0.1]:6080/vnc.html", "::ffff:127.0.0.1")).toBe(true);
  });

  it("refuses an unparseable join URL instead of opening it", () => {
    expect(canOpenExternalUrl("not a url", "127.0.0.1")).toBe(false);
    expect(canOpenExternalUrl("", "127.0.0.1")).toBe(false);
  });
});
