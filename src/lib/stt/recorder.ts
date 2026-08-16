// WebRTC audio recorder for speech-to-text. Captures microphone input using
// MediaRecorder and sends audio chunks to the harness for transcription.
//
// This replaces Apple Speech on non-macOS platforms or when the user selects
// OpenAI-compatible Whisper as their STT provider.

export interface RecorderOptions {
  /** Called when a transcript is available */
  onTranscript: (text: string, isFinal: boolean) => void;
  /** Called when recording ends */
  onEnd: (code: number, reason: string) => void;
  /** Called on errors */
  onError: (error: string) => void;
  /** Silence detection threshold in milliseconds (for endpoint detection) */
  endpointMs?: number;
}

export class AudioRecorder {
  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private options: RecorderOptions;
  private silenceTimer: number | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private silenceCheckInterval: number | null = null;
  private hasAudio = false;

  constructor(options: RecorderOptions) {
    this.options = options;
  }

  /**
   * Start recording audio from the microphone.
   */
  async start(): Promise<void> {
    try {
      // Request microphone access
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // Create MediaRecorder with webm format (widely supported)
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "";

      this.mediaRecorder = new MediaRecorder(this.mediaStream, {
        mimeType: mimeType || undefined,
      });

      this.audioChunks = [];
      this.hasAudio = false;

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
          this.hasAudio = true;
        }
      };

      this.mediaRecorder.onstop = async () => {
        await this.processAudio();
        this.cleanup();
      };

      this.mediaRecorder.onerror = (event) => {
        const error = (event as ErrorEvent).error;
        this.options.onError(error?.message || "Recording failed");
        this.cleanup();
      };

      // Set up silence detection if endpointMs is provided
      if (this.options.endpointMs && this.options.endpointMs > 0) {
        this.setupSilenceDetection(this.mediaStream, this.options.endpointMs);
      }

      // Start recording (collect data in chunks)
      this.mediaRecorder.start(100);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.options.onError(`Microphone access failed: ${message}`);
      this.cleanup();
    }
  }

  /**
   * Stop recording and send the audio for transcription.
   */
  stop(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      this.mediaRecorder.stop();
    } else {
      this.cleanup();
    }
  }

  /**
   * Finish recording (for push-to-talk mode).
   * This is like stop() but indicates the user intentionally finished speaking.
   */
  finish(): void {
    this.stop();
  }

  /**
   * Check if the recorder is currently active.
   */
  isActive(): boolean {
    return this.mediaRecorder !== null && this.mediaRecorder.state === "recording";
  }

  /**
   * Set up silence detection for automatic endpoint detection.
   */
  private setupSilenceDetection(stream: MediaStream, silenceMs: number): void {
    try {
      this.audioContext = new AudioContext();
      const source = this.audioContext.createMediaStreamSource(stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.8;
      source.connect(this.analyser);

      const bufferLength = this.analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      // Check for silence every 100ms
      this.silenceCheckInterval = window.setInterval(() => {
        if (!this.analyser) return;

        this.analyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((sum, value) => sum + value, 0) / bufferLength;

        // Silence threshold (adjust as needed)
        const SILENCE_THRESHOLD = 5;

        if (average < SILENCE_THRESHOLD) {
          // Silence detected
          if (!this.silenceTimer && this.hasAudio) {
            // Start the silence timer (only if we've captured some audio)
            this.silenceTimer = window.setTimeout(() => {
              // Silence lasted long enough — end recording
              this.stop();
            }, silenceMs);
          }
        } else {
          // Audio detected — cancel the silence timer
          if (this.silenceTimer) {
            clearTimeout(this.silenceTimer);
            this.silenceTimer = null;
          }
        }
      }, 100);
    } catch (error) {
      console.warn("Silence detection setup failed:", error);
      // Continue without silence detection
    }
  }

  /**
   * Send the recorded audio to the harness for transcription.
   */
  private async processAudio(): Promise<void> {
    if (this.audioChunks.length === 0) {
      this.options.onEnd(0, "no-audio");
      return;
    }

    try {
      const audioBlob = new Blob(this.audioChunks, { type: "audio/webm" });

      // Send to the harness
      const response = await fetch("/api/stt/transcribe", {
        method: "POST",
        body: audioBlob,
        headers: {
          "Content-Type": "audio/webm",
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        if (response.status === 409) {
          // STT not configured
          this.options.onError(errorData.error || "Speech-to-text is not configured");
          this.options.onEnd(2, errorData.reason || "stt-not-configured");
        } else {
          this.options.onError(errorData.error || `Transcription failed: ${response.status}`);
          this.options.onEnd(1, "transcription-failed");
        }
        return;
      }

      const result = (await response.json()) as { text?: string };
      const text = result.text?.trim() || "";

      // Report the transcript
      if (text) {
        // Send a partial transcript first (for immediate feedback)
        this.options.onTranscript(text, false);
        // Then the final one
        this.options.onTranscript(text, true);
      }

      this.options.onEnd(0, "completed");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.options.onError(`Transcription error: ${message}`);
      this.options.onEnd(1, "transcription-failed");
    }
  }

  /**
   * Clean up resources.
   */
  private cleanup(): void {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }

    if (this.silenceCheckInterval) {
      clearInterval(this.silenceCheckInterval);
      this.silenceCheckInterval = null;
    }

    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }

    this.analyser = null;

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    this.mediaRecorder = null;
    this.audioChunks = [];
    this.hasAudio = false;
  }
}
