const FREQUENCY_HZ = 520;
const LOWPASS_HZ = 1500;
const INAUDIBLE_GAIN = 0.0001;
const STOP_PADDING_SECONDS = 0.005;

type ValueVoice = {
  attackSeconds: number;
  decaySeconds: number;
  peakGain: number;
};

const VALUE_PULSE: ValueVoice = {
  attackSeconds: 0.005,
  decaySeconds: 0.045,
  peakGain: 0.025,
};

// Short enough for successive slider steps to remain discrete instead of
// overlapping into a sustained tone.
const SLIDER_STEP_PULSE: ValueVoice = {
  attackSeconds: 0.003,
  decaySeconds: 0.018,
  peakGain: 0.018,
};

const TOKEN_HOVER_CLICK: ValueVoice = {
  attackSeconds: 0.002,
  decaySeconds: 0.012,
  peakGain: 0.02,
};

let sharedContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (sharedContext) return sharedContext;
  if (typeof window === "undefined") return null;

  const AudioContextConstructor =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioContextConstructor) return null;

  try {
    sharedContext = new AudioContextConstructor();
  } catch {
    return null;
  }

  return sharedContext;
}

function renderValueSound(context: AudioContext, voice: ValueVoice) {
  const startTime = context.currentTime;
  const releaseTime =
    startTime + voice.attackSeconds + voice.decaySeconds;
  const oscillator = context.createOscillator();
  const lowpass = context.createBiquadFilter();
  const gain = context.createGain();

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(FREQUENCY_HZ, startTime);
  lowpass.type = "lowpass";
  lowpass.frequency.setValueAtTime(LOWPASS_HZ, startTime);
  gain.gain.setValueAtTime(INAUDIBLE_GAIN, startTime);
  gain.gain.exponentialRampToValueAtTime(
    voice.peakGain,
    startTime + voice.attackSeconds,
  );
  gain.gain.exponentialRampToValueAtTime(INAUDIBLE_GAIN, releaseTime);

  oscillator.connect(lowpass).connect(gain).connect(context.destination);
  oscillator.addEventListener(
    "ended",
    () => {
      oscillator.disconnect();
      lowpass.disconnect();
      gain.disconnect();
    },
    { once: true },
  );
  oscillator.start(startTime);
  oscillator.stop(releaseTime + STOP_PADDING_SECONDS);
}

function playValueVoice(voice: ValueVoice): void {
  const context = getAudioContext();
  if (!context) return;

  if (context.state === "running") {
    renderValueSound(context, voice);
    return;
  }

  try {
    void context.resume().then(() => {
      if (context.state === "running") renderValueSound(context, voice);
    }, () => {});
  } catch {
    // Web Audio is optional and may be blocked before a user gesture.
  }
}

/** The 50ms chart pulse; kept separate so sliders can evolve independently. */
export function playCustomChartValueSound(): void {
  playValueVoice(VALUE_PULSE);
}

/** A compact slider tick, semantically independent from chart feedback. */
export function playCustomSliderValueSound(): void {
  playValueVoice(SLIDER_STEP_PULSE);
}

/** A related 14ms click for entering portfolio token rows. */
export function playCustomTokenHoverSound(): void {
  playValueVoice(TOKEN_HOVER_CLICK);
}
