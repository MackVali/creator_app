export const UI_SOUND_SOURCES = {
  appOpen: "/sounds/ui/app-open.mp3",
  taskComplete: "/sounds/ui/task-complete.mp3",
  softError: "/sounds/ui/soft-error.mp3",
} as const;

export type UiSoundName = keyof typeof UI_SOUND_SOURCES;

const DEFAULT_UI_SOUND_VOLUME = 0.08;
const UI_SOUND_VOLUME_CAP = 0.15;

let audioContext: AudioContext | null = null;
const bufferCache = new Map<UiSoundName, Promise<AudioBuffer | null>>();

type WindowWithWebAudio = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

type PlayUiSoundOptions = {
  volume?: number;
};

function clampVolume(volume: number) {
  if (!Number.isFinite(volume)) {
    return DEFAULT_UI_SOUND_VOLUME;
  }

  return Math.min(1, Math.max(0, volume));
}

function getUiSoundVolume(volume = DEFAULT_UI_SOUND_VOLUME) {
  return clampVolume(volume) * UI_SOUND_VOLUME_CAP;
}

function getAudioContext() {
  if (typeof window === "undefined") {
    return null;
  }

  if (audioContext) {
    return audioContext;
  }

  const browserWindow = window as WindowWithWebAudio;
  const AudioContextConstructor =
    browserWindow.AudioContext ?? browserWindow.webkitAudioContext;

  if (!AudioContextConstructor) {
    return null;
  }

  audioContext = new AudioContextConstructor();
  return audioContext;
}

async function loadUiSoundBuffer(soundName: UiSoundName, context: AudioContext) {
  const cachedBuffer = bufferCache.get(soundName);
  if (cachedBuffer) {
    return cachedBuffer;
  }

  const bufferPromise = fetch(UI_SOUND_SOURCES[soundName])
    .then((response) => {
      if (!response.ok) {
        return null;
      }

      return response.arrayBuffer();
    })
    .then((arrayBuffer) => {
      if (!arrayBuffer) {
        return null;
      }

      return context.decodeAudioData(arrayBuffer);
    })
    .catch(() => null);

  bufferCache.set(soundName, bufferPromise);
  return bufferPromise;
}

export async function playUiSound(
  soundName: UiSoundName,
  options: PlayUiSoundOptions = {}
) {
  try {
    const context = getAudioContext();
    if (!context) {
      return false;
    }

    if (context.state === "suspended") {
      await context.resume();
    }

    const buffer = await loadUiSoundBuffer(soundName, context);
    if (!buffer) {
      return false;
    }

    const source = context.createBufferSource();
    const gain = context.createGain();

    source.buffer = buffer;
    gain.gain.value = getUiSoundVolume(options.volume);
    source.connect(gain);
    gain.connect(context.destination);
    source.start();

    return true;
  } catch {
    return false;
  }
}

// TODO: For native iOS packaging, evaluate a Capacitor/native audio plugin for
// low-latency app sounds and any future ambient layer without Safari media UI.
