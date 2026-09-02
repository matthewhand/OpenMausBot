import { afterEach, describe, expect, it, vi } from "vitest";

class FakeRec {
  static instances: FakeRec[] = [];
  continuous = false;
  interimResults = false;
  lang = "";
  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onend: (() => void) | null = null;
  started = false;
  stopped = false;
  aborted = false;

  constructor() {
    FakeRec.instances.push(this);
  }

  start() {
    this.started = true;
  }

  stop() {
    this.stopped = true;
    this.onend?.();
  }

  abort() {
    this.aborted = true;
    this.onend?.();
  }

  result(transcript: string, isFinal: boolean) {
    this.onresult?.({
      resultIndex: 0,
      results: [{ isFinal, 0: { transcript } }],
    });
  }
}

async function load() {
  FakeRec.instances = [];
  vi.resetModules();
  vi.stubGlobal("window", {
    isSecureContext: true,
    webkitSpeechRecognition: FakeRec,
  });
  return import("./speech-capture");
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("callSpeechAvailable", () => {
  it("is true when the browser exposes speech recognition", async () => {
    const speech = await load();
    expect(speech.browserSpeechAvailable()).toBe(true);
    expect(speech.nativeSpeechAvailable()).toBe(false);
    expect(speech.callSpeechAvailable()).toBe(true);
  });

  it("is false when nothing can capture", async () => {
    vi.resetModules();
    vi.stubGlobal("window", { isSecureContext: true });
    const speech = await import("./speech-capture");
    expect(speech.callSpeechAvailable()).toBe(false);
  });
});

describe("browser speechStart", () => {
  it("emits a final transcript then a completed end", async () => {
    const speech = await load();
    const lines: unknown[] = [];
    const ends: unknown[] = [];
    speech.onSpeechTranscript((line) => lines.push(line));
    speech.onSpeechEnd((info) => ends.push(info));

    await speech.speechStart({ endpointMs: 850 });
    const rec = FakeRec.instances[0];
    expect(rec?.started).toBe(true);
    expect(rec?.continuous).toBe(true);
    expect(rec?.interimResults).toBe(true);

    rec!.result("hello there", false);
    rec!.result("hello there", true);

    expect(lines).toEqual([
      { partial: true, text: "hello there" },
      { partial: false, text: "hello there" },
    ]);
    expect(ends).toEqual([{ code: 0, reason: "completed" }]);
  });

  it("does not emit end when hush aborts capture", async () => {
    const speech = await load();
    const ends: unknown[] = [];
    speech.onSpeechEnd((info) => ends.push(info));
    await speech.speechStart({ endpointMs: 850 });
    await speech.speechStop();
    expect(FakeRec.instances[0]?.aborted).toBe(true);
    expect(ends).toEqual([]);
  });

  it("refuses insecure origins before starting the recognizer", async () => {
    FakeRec.instances = [];
    vi.resetModules();
    vi.stubGlobal("window", {
      isSecureContext: false,
      webkitSpeechRecognition: FakeRec,
    });
    const speech = await import("./speech-capture");
    const ends: unknown[] = [];
    speech.onSpeechEnd((info) => ends.push(info));
    await speech.speechStart({ endpointMs: 850 });
    expect(FakeRec.instances).toHaveLength(0);
    expect(ends).toEqual([{ code: 1, reason: "insecure-origin" }]);
    expect(speech.speechEndUserMessage(1, "insecure-origin")).toMatch(/HTTPS or localhost/);
  });
});
