// The sound of the machine. Everything here is synthesized in code —
// no audio assets. The needle drop is a three-part composite (contact
// tick, woofer thunk, settle bounce), the crackle bed is a looping
// procedurally-generated buffer of dust impulses over a pink-ish noise
// floor, and track previews run through a gain + analyser chain so the
// scene can react to loudness.
//
// Client-only: importing this module on the server is harmless; calling
// methods that need audio hardware server-side throws.

const NEEDLE_TICK_FREQ_HZ = 1800;
const NEEDLE_TICK_Q = 6;
const NEEDLE_TICK_DURATION_S = 0.018;
const NEEDLE_TICK_GAIN = 0.4;

const THUNK_START_HZ = 95;
const THUNK_END_HZ = 55;
const THUNK_DURATION_S = 0.16;
const THUNK_GAIN = 0.5;

const BOUNCE_DELAY_S = 0.12;
const BOUNCE_DURATION_S = 0.012;
const BOUNCE_GAIN = 0.14;

const CRACKLE_DURATION_S = 2.5;
const CRACKLE_IMPULSES_PER_S = 25;
const CRACKLE_FLOOR_AMPLITUDE = 0.004;
const CRACKLE_LOWPASS_HZ = 7000;
const CRACKLE_GAIN = 0.12;
const CRACKLE_FADE_S = 0.4;

const PREVIEW_GAIN = 0.9;
const PREVIEW_FADE_IN_S = 0.7;
const PREVIEW_FADE_OUT_S = 0.35;
const PREVIEW_WIND_DOWN_RATE = 0.3;

// Web Audio exponential ramps cannot reach zero.
const SILENT = 0.0001;

type WindowWithWebkitAudio = Window & {
  webkitAudioContext?: typeof AudioContext;
};

type PitchControlledMediaElement = HTMLAudioElement & {
  preservesPitch?: boolean;
  webkitPreservesPitch?: boolean;
};

export type PreviewHandlers = {
  onEnded?: () => void;
};

export class TurntableAudio {
  private context: AudioContext | null = null;
  private disposed = false;

  // Short reusable white-noise buffer for the needle ticks.
  private noiseBuffer: AudioBuffer | null = null;

  // Crackle bed.
  private crackleBuffer: AudioBuffer | null = null;
  private crackleSource: AudioBufferSourceNode | null = null;
  private crackleFilter: BiquadFilterNode | null = null;
  private crackleGain: GainNode | null = null;
  private crackleStopTimer: number | null = null;

  // Preview chain. createMediaElementSource can only ever be called once
  // per element, so the element + source live for the instance lifetime
  // and we swap .src per track.
  private audioEl: PitchControlledMediaElement | null = null;
  private mediaSource: MediaElementAudioSourceNode | null = null;
  private previewGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private analyserData: Uint8Array<ArrayBuffer> | null = null;
  private endedListener: (() => void) | null = null;

  private previewActive = false;
  private onEndedHandler: (() => void) | null = null;
  // Bumped on every play/stop/dispose so a stale in-flight playPreview
  // can tell it has been superseded.
  private playToken = 0;
  private rateRampHandle: number | null = null;
  private previewStopTimer: number | null = null;

  /**
   * Lazily create (and resume) the AudioContext. Call this — or any of
   * the play methods, which call it internally — from a user-gesture
   * handler so autoplay policy lets the context run.
   */
  async ensureContext(): Promise<AudioContext> {
    this.assertBrowser();
    if (this.disposed) {
      throw new Error("TurntableAudio has been disposed.");
    }
    if (!this.context) {
      const Ctor =
        window.AudioContext ??
        (window as WindowWithWebkitAudio).webkitAudioContext;
      if (!Ctor) {
        throw new Error("Web Audio API is not supported in this browser.");
      }
      this.context = new Ctor();
    }
    if (this.context.state === "suspended") {
      // Resolves immediately inside a user gesture; if called outside
      // one, the next gesture-driven call retries.
      try {
        await this.context.resume();
      } catch {
        /* ignored — context stays suspended until a real gesture */
      }
    }
    return this.context;
  }

  /**
   * The needle drop: arm contact tick, woofer thunk, settle bounce.
   * Fire-and-forget; safe to call directly from a click handler.
   */
  playNeedleDrop(): void {
    this.assertBrowser();
    void this.ensureContext()
      .then((ctx) => {
        if (this.disposed) return;
        this.scheduleNeedleDrop(ctx);
      })
      .catch(() => {
        /* context unavailable — stay silent */
      });
  }

  /** Start (or fade back in) the looping vinyl crackle bed. */
  startCrackle(): void {
    this.assertBrowser();
    void this.ensureContext()
      .then((ctx) => {
        if (this.disposed) return;
        const now = ctx.currentTime;

        if (this.crackleSource && this.crackleGain) {
          // Already running (possibly mid fade-out): ramp back up.
          const gainParam = this.crackleGain.gain;
          const current = gainParam.value;
          gainParam.cancelScheduledValues(now);
          gainParam.setValueAtTime(current, now);
          gainParam.linearRampToValueAtTime(CRACKLE_GAIN, now + CRACKLE_FADE_S);
          if (this.crackleStopTimer !== null) {
            window.clearTimeout(this.crackleStopTimer);
            this.crackleStopTimer = null;
          }
          return;
        }

        const source = ctx.createBufferSource();
        source.buffer = this.getCrackleBuffer(ctx);
        source.loop = true;

        const filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = CRACKLE_LOWPASS_HZ;

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(CRACKLE_GAIN, now + CRACKLE_FADE_S);

        source.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        source.start(now);

        this.crackleSource = source;
        this.crackleFilter = filter;
        this.crackleGain = gain;
      })
      .catch(() => {
        /* context unavailable — stay silent */
      });
  }

  /** Fade the crackle bed out over 400ms and stop it. */
  stopCrackle(): void {
    const ctx = this.context;
    const source = this.crackleSource;
    const filter = this.crackleFilter;
    const gain = this.crackleGain;
    if (!ctx || !source || !gain) return;

    const now = ctx.currentTime;
    const gainParam = gain.gain;
    const current = gainParam.value;
    gainParam.cancelScheduledValues(now);
    gainParam.setValueAtTime(current, now);
    gainParam.linearRampToValueAtTime(0, now + CRACKLE_FADE_S);

    this.crackleSource = null;
    this.crackleFilter = null;
    this.crackleGain = null;
    this.crackleStopTimer = window.setTimeout(() => {
      this.crackleStopTimer = null;
      try {
        source.stop();
      } catch {
        /* already stopped */
      }
      source.disconnect();
      filter?.disconnect();
      gain.disconnect();
    }, CRACKLE_FADE_S * 1000 + 40);
  }

  /**
   * Play a preview track through the gain/analyser chain, fading in over
   * 700ms. Resolves once playback has actually started; rejects if the
   * track fails to load/play or this call is superseded by a newer one.
   */
  async playPreview(url: string, handlers?: PreviewHandlers): Promise<void> {
    this.assertBrowser();
    const ctx = await this.ensureContext();
    const token = ++this.playToken;
    const { element, gain } = this.ensurePreviewChain(ctx);

    // Hard-reset whatever the element was doing (including a pending
    // pitch-warp wind-down) before swapping in the new track.
    this.cancelRateRamp();
    this.clearPreviewStopTimer();
    element.pause();
    element.playbackRate = 1;
    this.previewActive = false;
    this.onEndedHandler = handlers?.onEnded ?? null;

    const now = ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(0, now);

    element.src = url;

    await new Promise<void>((resolve, reject) => {
      const onError = () => {
        cleanup();
        reject(new Error(`Turntable preview failed to load: ${url}`));
      };
      const cleanup = () => element.removeEventListener("error", onError);
      element.addEventListener("error", onError);
      element.play().then(
        () => {
          cleanup();
          resolve();
        },
        (error: unknown) => {
          cleanup();
          reject(
            error instanceof Error
              ? error
              : new Error("Turntable preview playback was blocked.")
          );
        }
      );
    });

    if (token !== this.playToken || this.disposed) {
      // stopPreview/dispose (or a newer play) won the race while play()
      // was in flight. A newer play would have aborted this play() by
      // swapping src, so pausing here can only silence a stale track.
      element.pause();
      throw new Error("Turntable preview superseded before it started.");
    }

    const startAt = ctx.currentTime;
    gain.gain.cancelScheduledValues(startAt);
    gain.gain.setValueAtTime(0, startAt);
    gain.gain.linearRampToValueAtTime(PREVIEW_GAIN, startAt + PREVIEW_FADE_IN_S);
    this.previewActive = true;
  }

  /**
   * Lift the needle: fade the preview out over 350ms while warping
   * playbackRate down to 0.3 (the record-slowing-to-a-stop effect), then
   * pause. The crackle bed is untouched — stop it separately.
   */
  stopPreview(): void {
    this.playToken++;
    // Manual lift never counts as a natural finish.
    this.onEndedHandler = null;

    const ctx = this.context;
    const element = this.audioEl;
    const gain = this.previewGain;
    if (!ctx || !element || !gain) return;
    if (!this.previewActive || element.paused) return;
    if (this.previewStopTimer !== null) return; // already winding down

    const now = ctx.currentTime;
    const gainParam = gain.gain;
    const current = gainParam.value;
    gainParam.cancelScheduledValues(now);
    gainParam.setValueAtTime(current, now);
    gainParam.linearRampToValueAtTime(0, now + PREVIEW_FADE_OUT_S);

    this.rampPlaybackRate(
      element,
      element.playbackRate,
      PREVIEW_WIND_DOWN_RATE,
      PREVIEW_FADE_OUT_S * 1000
    );

    this.previewStopTimer = window.setTimeout(() => {
      this.previewStopTimer = null;
      this.cancelRateRamp();
      element.pause();
      element.playbackRate = 1;
      this.previewActive = false;
    }, PREVIEW_FADE_OUT_S * 1000 + 30);
  }

  /** 0..1 RMS loudness of the current preview, 0 when idle. */
  getLevel(): number {
    const analyser = this.analyser;
    const data = this.analyserData;
    if (!analyser || !data || !this.previewActive) return 0;

    analyser.getByteTimeDomainData(data);
    let sumSquares = 0;
    for (let i = 0; i < data.length; i++) {
      const centered = (data[i] - 128) / 128;
      sumSquares += centered * centered;
    }
    const rms = Math.sqrt(sumSquares / data.length);
    // A full-scale sine has RMS ~0.707; stretch so loud passages
    // approach 1 while staying clamped.
    return Math.min(1, rms * 1.4);
  }

  /** Full teardown. The instance is dead afterwards — make a new one. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.playToken++;

    this.cancelRateRamp();
    this.clearPreviewStopTimer();
    if (this.crackleStopTimer !== null) {
      window.clearTimeout(this.crackleStopTimer);
      this.crackleStopTimer = null;
    }

    if (this.crackleSource) {
      try {
        this.crackleSource.stop();
      } catch {
        /* already stopped */
      }
      this.crackleSource.disconnect();
    }
    this.crackleFilter?.disconnect();
    this.crackleGain?.disconnect();
    this.crackleSource = null;
    this.crackleFilter = null;
    this.crackleGain = null;
    this.crackleBuffer = null;

    if (this.audioEl) {
      this.audioEl.pause();
      if (this.endedListener) {
        this.audioEl.removeEventListener("ended", this.endedListener);
      }
      this.audioEl.removeAttribute("src");
      this.audioEl.load();
    }
    this.mediaSource?.disconnect();
    this.previewGain?.disconnect();
    this.analyser?.disconnect();
    this.audioEl = null;
    this.mediaSource = null;
    this.previewGain = null;
    this.analyser = null;
    this.analyserData = null;
    this.endedListener = null;
    this.previewActive = false;
    this.onEndedHandler = null;
    this.noiseBuffer = null;

    if (this.context) {
      void this.context.close().catch(() => {
        /* already closed */
      });
      this.context = null;
    }
  }

  // ----------------------------------------------------------------- //

  private assertBrowser(): void {
    if (typeof window === "undefined") {
      throw new Error(
        "TurntableAudio methods are client-only; do not call them on the server."
      );
    }
  }

  private scheduleNeedleDrop(ctx: AudioContext): void {
    const t0 = ctx.currentTime + 0.01;

    // 1. Arm contact: an 18ms bandpassed white-noise tick.
    this.scheduleTick(
      ctx,
      t0,
      NEEDLE_TICK_DURATION_S,
      NEEDLE_TICK_FREQ_HZ,
      NEEDLE_TICK_GAIN
    );

    // 2. The thunk: a sine gliding 95Hz -> 55Hz, the woofer thump of the
    // stylus settling into the groove. Starts a hair after contact.
    const thunkAt = t0 + 0.006;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(THUNK_START_HZ, thunkAt);
    osc.frequency.exponentialRampToValueAtTime(
      THUNK_END_HZ,
      thunkAt + THUNK_DURATION_S
    );

    const thunkGain = ctx.createGain();
    thunkGain.gain.setValueAtTime(THUNK_GAIN, thunkAt);
    thunkGain.gain.exponentialRampToValueAtTime(
      SILENT,
      thunkAt + THUNK_DURATION_S
    );

    osc.connect(thunkGain);
    thunkGain.connect(ctx.destination);
    osc.start(thunkAt);
    osc.stop(thunkAt + THUNK_DURATION_S + 0.04);
    osc.onended = () => {
      osc.disconnect();
      thunkGain.disconnect();
    };

    // 3. A tiny settle bounce 120ms later — quieter, slightly brighter.
    this.scheduleTick(
      ctx,
      t0 + BOUNCE_DELAY_S,
      BOUNCE_DURATION_S,
      NEEDLE_TICK_FREQ_HZ * 1.18,
      BOUNCE_GAIN
    );
  }

  private scheduleTick(
    ctx: AudioContext,
    at: number,
    duration: number,
    frequency: number,
    peakGain: number
  ): void {
    const source = ctx.createBufferSource();
    source.buffer = this.getNoiseBuffer(ctx);

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = frequency;
    filter.Q.value = NEEDLE_TICK_Q;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(peakGain, at);
    gain.gain.exponentialRampToValueAtTime(SILENT, at + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    source.start(at);
    source.stop(at + duration + 0.01);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
  }

  private getNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noiseBuffer && this.noiseBuffer.sampleRate === ctx.sampleRate) {
      return this.noiseBuffer;
    }
    const length = Math.ceil(ctx.sampleRate * 0.05);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buffer;
    return buffer;
  }

  private getCrackleBuffer(ctx: AudioContext): AudioBuffer {
    if (
      this.crackleBuffer &&
      this.crackleBuffer.sampleRate === ctx.sampleRate
    ) {
      return this.crackleBuffer;
    }

    const length = Math.floor(ctx.sampleRate * CRACKLE_DURATION_S);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    // Pink-ish noise floor via octaved white noise (Voss-McCartney):
    // row r holds a fresh random value every 2^r samples; the sum rolls
    // off ~3dB/octave, which reads as dusty air rather than hiss.
    const rows = 6;
    const rowValues = new Float32Array(rows);
    for (let r = 0; r < rows; r++) {
      rowValues[r] = Math.random() * 2 - 1;
    }
    for (let i = 0; i < length; i++) {
      let sum = 0;
      for (let r = 0; r < rows; r++) {
        if (i % (1 << r) === 0) {
          rowValues[r] = Math.random() * 2 - 1;
        }
        sum += rowValues[r];
      }
      data[i] = (sum / rows) * CRACKLE_FLOOR_AMPLITUDE;
    }

    // Sparse dust impulses: ~25/sec, 1-3 samples wide, with the
    // occasional bigger pop. Kept clear of the loop seam.
    const impulseCount = Math.round(CRACKLE_DURATION_S * CRACKLE_IMPULSES_PER_S);
    for (let n = 0; n < impulseCount; n++) {
      const isPop = Math.random() < 0.08;
      const amplitude = isPop
        ? 0.3 + Math.random() * 0.25
        : 0.02 + Math.random() * 0.28;
      const width = isPop
        ? 2 + Math.floor(Math.random() * 3)
        : 1 + Math.floor(Math.random() * 3);
      const start = Math.floor(Math.random() * (length - width - 1));
      const sign = Math.random() < 0.5 ? -1 : 1;
      for (let s = 0; s < width; s++) {
        data[start + s] += sign * amplitude * (1 - s / width);
      }
    }

    this.crackleBuffer = buffer;
    return buffer;
  }

  private ensurePreviewChain(ctx: AudioContext): {
    element: PitchControlledMediaElement;
    gain: GainNode;
    analyser: AnalyserNode;
  } {
    if (this.audioEl && this.previewGain && this.analyser) {
      return {
        element: this.audioEl,
        gain: this.previewGain,
        analyser: this.analyser
      };
    }

    const element = new Audio() as PitchControlledMediaElement;
    element.crossOrigin = "anonymous";
    element.preload = "auto";
    // Let the wind-down warp pitch like a real platter spinning down
    // instead of time-stretching.
    element.preservesPitch = false;
    element.webkitPreservesPitch = false;

    this.endedListener = () => {
      this.previewActive = false;
      const handler = this.onEndedHandler;
      this.onEndedHandler = null;
      handler?.();
    };
    element.addEventListener("ended", this.endedListener);

    const source = ctx.createMediaElementSource(element);
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;

    source.connect(gain);
    gain.connect(analyser);
    analyser.connect(ctx.destination);

    this.audioEl = element;
    this.mediaSource = source;
    this.previewGain = gain;
    this.analyser = analyser;
    this.analyserData = new Uint8Array(analyser.fftSize);

    return { element, gain, analyser };
  }

  /**
   * playbackRate is a plain property, not an AudioParam, so the wind-down
   * is animated on rAF. The stopPreview timeout is the safety net that
   * pauses regardless (rAF stalls in hidden tabs).
   */
  private rampPlaybackRate(
    element: HTMLAudioElement,
    from: number,
    to: number,
    durationMs: number
  ): void {
    this.cancelRateRamp();
    const startedAt = performance.now();
    const step = () => {
      const t = Math.min((performance.now() - startedAt) / durationMs, 1);
      element.playbackRate = from + (to - from) * t;
      if (t < 1) {
        this.rateRampHandle = window.requestAnimationFrame(step);
      } else {
        this.rateRampHandle = null;
      }
    };
    this.rateRampHandle = window.requestAnimationFrame(step);
  }

  private cancelRateRamp(): void {
    if (this.rateRampHandle !== null) {
      window.cancelAnimationFrame(this.rateRampHandle);
      this.rateRampHandle = null;
    }
  }

  private clearPreviewStopTimer(): void {
    if (this.previewStopTimer !== null) {
      window.clearTimeout(this.previewStopTimer);
      this.previewStopTimer = null;
    }
  }
}
