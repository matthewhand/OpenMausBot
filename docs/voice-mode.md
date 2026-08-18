# Voice in OpenMausBot

Decision doc, 2026-08-14. How bots speak, and how you hold a conversation with
one.

## Shape

```
Renderer (src/)                        Harness (server/)
├── lib/tts/index.ts   the speaker     ├── tts/speech-text.ts         markdown → speakable
│     queue · prefetch · interrupt     ├── tts/elevenlabs.ts          verify · voices · synthesize
└── components/CallView.tsx            └── tts/openai-compatible.ts   OpenAI /audio/speech
      Apple STT endpointing            POST /api/tts/prepare → utterances
                                       POST /api/tts/speak   → mp3 bytes
```

Two voice providers: **ElevenLabs** (cloud, high quality) and
**OpenAI-compatible** (local servers like Kokoro, or any service using the
OpenAI `/v1/audio/speech` API). Choose in App Settings. No fallback ladder — if
credentials aren't configured, voice is off and the buttons say so.

## Why credentials stay on the harness

The renderer never talks to TTS providers directly. `GET /api/config` reports
configured-or-not booleans and nothing else, which is the same rule every other
credential follows, and it is worth more than a saved round trip. So the app
asks the harness for audio and the harness holds the secrets.

Two states worth distinguishing, because they need different instructions:
`configured` (credentials are saved) and `ready` (credentials *and* a chosen
voice). Speaking without either throws `NoVoiceConfigured`, which the route
turns into a 409 — "you haven't set this up" is not a provider failure and
should not look like one.

For **ElevenLabs**: `configured` means a key is saved; `ready` means key + voice.

For **OpenAI-compatible**: `configured` means a base URL is saved (`openaiKey` is
optional for local unauthenticated servers like Kokoro); `ready` means base URL
+ voice. The ElevenLabs `key` and the OpenAI-compatible `openaiKey` are stored
separately. Switching the provider dropdown must not wipe or send the other
provider's secret.

Voice ids are per provider too: `tts.voice` is ElevenLabs and `tts.openaiVoice`
is OpenAI-compatible. Switching the dropdown keeps both ids and uses only the
active one — an ElevenLabs id is not valid on Kokoro and vice versa. App
Settings binds the voice select to the active id, and a text field next to it
saves a custom id. If that id is not in the listed voices, it stays visible as
a custom option with the field filled. OpenAI-compatible also has
`tts.openaiModel` (placeholder `tts-1` or `kokoro`; speak/verify default to
`tts-1` when unset).

## The spoken register

The half that decides whether this is pleasant. Agents write for a screen:
fenced code, file paths, tables, link soup. Read aloud verbatim, a diff is four
minutes of punctuation and `server/drivers/acp/core.ts` is "server slash drivers
slash a c p slash core dot t s".

`speech-text.ts` says the prose, names the artifacts, drops the syntax. It also
splits into utterances, because that is the unit of work — one request, one clip,
and the client fetches the next while the current one plays. One request per
utterance rather than the streaming-input WebSocket: same perceived latency, far
fewer moving parts, and no socket to leak when a turn is interrupted.

## Call mode

**Half-duplex, on purpose.** The dictation helper is `SFSpeechRecognizer` on raw
`AVAudioEngine` input with no acoustic echo cancellation. A microphone left open
through playback transcribes the bot's own voice back into the conversation and
the two of them talk forever. So the mic is live only when the bot is not
speaking, and interrupting is a tap, the Space bar, or Escape. Full-duplex
barge-in needs AEC on the capture path — a real follow-up, not a footnote.

**Turn detection stays native and local.** A buffer-backed
`SFSpeechRecognizer` does not emit `isFinal` just because the speaker becomes
quiet; it finalizes only after its audio stream ends. Call mode therefore starts
the native helper with a silence timeout. Once a non-empty transcript stops
changing for 850ms, the helper stops capture and calls `endAudio()`, which
produces the final transcript sent to the renderer. Composer dictation omits the
timeout and keeps its press-to-stop behavior. No cloud STT or bundled VAD model
is involved.

**Narration is what makes it bearable.** An agent turn is 5–60 seconds of tool
calls, and silence that long reads as a dropped call. Every activity chip the
harness narrates is read aloud as it happens. The phrase is computed once,
server-side, into `tool.spoken` at fold time — so the chip you see and the phrase
you hear cannot drift apart.

**Approvals are spoken.** A `request.opened` card is read out and answered with
"yes"/"no". Anything that is not clearly a decision is refused and re-asked:
consent must never be inferred from a sentence that merely contained the word
"sure". Non-permission questions are read too, and the next complete spoken
turn is returned as the answer, so an agent asking for input does not strand the
call behind an invisible card.

**Latency, honestly.** Endpointing is 300–700ms and time-to-first-byte is
~100–250ms, against an agent turn of 5–60s. The agent dominates by 50–100x, so
voice choice is a quality decision, not a latency one. The way to make a call
feel conversational is to put the bot you call on a fast model and let it
delegate real work to specialists over `ask_bot` — no new machinery required.

## OpenAI-compatible provider

The **OpenAI-compatible** provider talks to any server that implements the
OpenAI `/v1/audio/speech` endpoint. Common use cases:

- **Local Kokoro** (Kokoro-FastAPI running in Docker on the same machine)
- **LiteLLM** (proxy to multiple TTS backends)
- **Real OpenAI** (for users who already have OpenAI credits)

The key is **optional** — local unauthenticated servers like Kokoro need none.
When a key is provided, it's sent as `Authorization: Bearer <key>`. The
settings panel reports `openaiKeyConfigured` (never the secret) and can
explicitly clear a saved key.

There is no silent default base URL. The UI example is
`http://127.0.0.1:8880/v1` for Kokoro-FastAPI; point it at LiteLLM, a local
proxy, or `https://api.openai.com/v1` as needed.

The speech model is `tts.openaiModel` (e.g. `tts-1`, `kokoro`). Speak and
verify POST `{ model, input, voice, response_format: "mp3" }` using the saved
model and the per-provider voice; unset model defaults to `tts-1` so real
OpenAI still works.

Voice lists try `{baseUrl}/audio/voices` then `{baseUrl}/voices`. If both
miss, `api.openai.com` gets the OpenAI built-ins (alloy, echo, fable, onyx,
nova, shimmer, ash, coral, sage); anything else gets the Kokoro-style
fallback. Users can type a custom voice id in the field under the voice
select; Save writes `openaiVoice` (or `voice` on ElevenLabs). A saved id that
is not in the list remains selected as a custom option.

## Rejected alternatives

| Option | Why not |
| --- | --- |
| OS voices (macOS/Windows) | Audibly synthetic; would cheapen the feature |
| Piper | Same complaint, one tier up |
| Kokoro-82M in the renderer | Genuinely good and free, but embedding it means a 2.2MB chunk, an ONNX runtime, and a first-run model download. The OpenAI-compatible provider gives the same result with less complexity: users run Kokoro-FastAPI in Docker and this app talks to it over HTTP. |
| Cartesia as a third provider | Was cheaper and faster to first byte in 2025, but a third provider earns its keep only when two isn't enough |
| ElevenLabs Agents | Its custom-LLM `cascade_timeout_seconds` maxes at 15s and agent turns exceed that; it also wants to own turn-taking and tool calls, which is what the harness owns |
| OpenAI Realtime / Gemini Live (speech-to-speech) | They replace the brain, and the brain being Claude Code on your own machine *is* the product |

## Known gaps

- **Calls are macOS-only**, because dictation is. The voice half works everywhere.
- **Rooms don't speak yet**, though per-bot voices already exist (`bot.voice`).
- **No spend meter.** ElevenLabs bills per character. Auto-speak is off by
  default partly for that reason, but the app should eventually show usage.
- **No voice barge-in** — see half-duplex above.

## Failure boundaries

- Intentional microphone stops (playback, hang-up, or replacement) do not emit
  a natural `speech:end`; otherwise the renderer could reopen capture during
  the bot's audio.
- Call phases are updated synchronously alongside React state, so a helper exit
  in the same event-loop turn as a final transcript cannot observe a stale
  `listening` phase.
- Leaving the bot view owns and ends its call. A hidden overlay cannot leave a
  microphone session or a stale `currentCall` behind.
- Synthesis requests are abortable from the renderer and individual utterances
  are capped server-side to bound accidental hosted-voice spend.
