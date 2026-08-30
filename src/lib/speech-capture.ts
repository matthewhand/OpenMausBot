/** Mic capture for call mode.
 *
 * The macOS desktop app uses the native helper (`window.ogb.speechStart`).
 * Everywhere else — LAN browser, Windows — we fall back to the Web Speech
 * API so the call button is not a dead macOS-only control. */
export type SpeechTranscript = { partial?: boolean; text?: string; error?: string };
export type SpeechEnd = { code: number | null; reason?: string };

type RecognitionCtor = new () => BrowserRecognition;

interface BrowserRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: BrowserRecognitionEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
}

interface BrowserRecognitionEvent {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0?: { transcript?: string };
  }>;
}

const transcriptWatchers = new Set<(line: SpeechTranscript) => void>();
const endWatchers = new Set<(info: SpeechEnd) => void>();

let rec: BrowserRecognition | null = null;
let intentionalStop = false;
let emittedFinal = false;
let lastText = "";
let endpointMs = 0;
let endpointTimer: ReturnType<typeof setTimeout> | null = null;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function useNative(): boolean {
  return Boolean(typeof window !== "undefined" && window.ogb?.speechStart && window.ogb.platform === "darwin");
}

export function nativeSpeechAvailable(): boolean {
  return useNative();
}

export function browserSpeechAvailable(): boolean {
  return Boolean(recognitionCtor());
}

/** True when a call can capture speech on this page. */
export function callSpeechAvailable(): boolean {
  return nativeSpeechAvailable() || browserSpeechAvailable();
}

export function speechEndUserMessage(code: number | null, reason?: string): string | null {
  if (code === 2) return "Calls need speech recognition, which isn't available here yet.";
  if (code !== 1) return null;
  if (reason === "helper-build-failed") {
    return "The dictation helper couldn't be built. Install Apple's Command Line Tools and try again.";
  }
  if (reason === "insecure-origin") {
    return "This browser blocks the microphone on plain HTTP. Open the UI over HTTPS or localhost.";
  }
  return "Allow the microphone for this site, then try the call again.";
}

function emitTranscript(line: SpeechTranscript) {
  for (const fn of [...transcriptWatchers]) fn(line);
}

function emitEnd(info: SpeechEnd) {
  for (const fn of [...endWatchers]) fn(info);
}

function emitFinal(text: string) {
  if (emittedFinal) return;
  emittedFinal = true;
  emitTranscript({ partial: false, text });
}

function clearEndpoint() {
  if (endpointTimer) {
    clearTimeout(endpointTimer);
    endpointTimer = null;
  }
}

function bumpEndpoint() {
  clearEndpoint();
  if (!endpointMs || !lastText) return;
  endpointTimer = setTimeout(() => {
    endpointTimer = null;
    if (!rec || emittedFinal) return;
    try {
      rec.stop();
    } catch {
      /* already stopped */
    }
  }, endpointMs);
}

function stopBrowser(abort: boolean) {
  clearEndpoint();
  const recognition = rec;
  if (!recognition) return;
  intentionalStop = abort;
  rec = null;
  try {
    if (abort) recognition.abort();
    else recognition.stop();
  } catch {
    /* already stopped */
  }
}

function startBrowser(options?: { endpointMs?: number }): void {
  const Ctor = recognitionCtor();
  if (!Ctor) {
    emitEnd({ code: 2, reason: "unsupported-platform" });
    return;
  }
  if (typeof window !== "undefined" && window.isSecureContext === false) {
    emitEnd({ code: 1, reason: "insecure-origin" });
    return;
  }
  stopBrowser(true);
  intentionalStop = false;
  emittedFinal = false;
  lastText = "";
  const requested = Number(options?.endpointMs);
  endpointMs = Number.isFinite(requested) && requested > 0 ? Math.min(5_000, Math.max(250, Math.round(requested))) : 0;

  const recognition = new Ctor();
  rec = recognition;
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = typeof navigator !== "undefined" && navigator.language ? navigator.language : "en-US";

  recognition.onresult = (event) => {
    if (rec !== recognition) return;
    let interim = "";
    let finalText = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const piece = event.results[i][0]?.transcript ?? "";
      if (event.results[i].isFinal) finalText += piece;
      else interim += piece;
    }
    const trimmedFinal = finalText.trim();
    if (trimmedFinal) {
      clearEndpoint();
      emitFinal(trimmedFinal);
      try {
        recognition.stop();
      } catch {
        /* already stopping */
      }
      return;
    }
    const partial = interim.trim();
    if (!partial) return;
    lastText = partial;
    emitTranscript({ partial: true, text: partial });
    bumpEndpoint();
  };

  recognition.onerror = (event) => {
    if (rec !== recognition) return;
    const error = "error" in event ? String((event as { error?: string }).error) : "";
    if (error === "aborted" || error === "no-speech") return;
    if (error === "not-allowed" || error === "service-not-allowed") {
      emitTranscript({ error: "not-allowed" });
      return;
    }
    emitEnd({ code: 1, reason: error || "helper-start-failed" });
  };

  recognition.onend = () => {
    if (rec === recognition) rec = null;
    clearEndpoint();
    if (intentionalStop) {
      intentionalStop = false;
      return;
    }
    if (!emittedFinal && lastText) emitFinal(lastText);
    emitEnd({ code: 0, reason: "completed" });
  };

  try {
    recognition.start();
  } catch {
    rec = null;
    emitEnd({ code: 1, reason: "helper-start-failed" });
  }
}

/** Ask for the mic during a click so later `speechStart()` is not blocked
 * by Chrome's user-gesture + permission rules. Native capture does this
 * inside the helper. */
export async function primeBrowserMic(): Promise<void> {
  if (useNative()) return;
  const media = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
  if (!media?.getUserMedia) return;
  try {
    const stream = await media.getUserMedia({ audio: true });
    for (const track of stream.getTracks()) track.stop();
  } catch {
    /* speechStart reports the failure once capture actually begins */
  }
}

export async function speechStart(options?: { endpointMs?: number }): Promise<void> {
  stopBrowser(true);
  if (useNative()) return window.ogb!.speechStart!(options);
  startBrowser(options);
}

export async function speechStop(): Promise<void> {
  stopBrowser(true);
  await window.ogb?.speechStop?.();
}

export async function speechFinish(): Promise<void> {
  if (useNative()) {
    await window.ogb?.speechFinish?.();
    return;
  }
  if (!rec) return;
  try {
    rec.stop();
  } catch {
    /* already stopped */
  }
}

export function onSpeechTranscript(cb: (line: SpeechTranscript) => void): () => void {
  if (useNative()) return window.ogb!.onSpeechTranscript(cb);
  transcriptWatchers.add(cb);
  return () => {
    transcriptWatchers.delete(cb);
  };
}

export function onSpeechEnd(cb: (info: SpeechEnd) => void): () => void {
  if (useNative()) return window.ogb!.onSpeechEnd(cb);
  endWatchers.add(cb);
  return () => {
    endWatchers.delete(cb);
  };
}
