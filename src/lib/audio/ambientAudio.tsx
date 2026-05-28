"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export const AMBIENT_AUDIO_PUBLIC_PATH = "/public/sounds/ambient/creator-aura.mp3";
export const AMBIENT_AUDIO_SRC = "/sounds/ambient/creator-aura.mp3";
export const AMBIENT_AUDIO_STORAGE_KEY = "creator:ambient-audio";

const DEFAULT_AMBIENT_VOLUME = 0.08;

type AmbientAudioPreference = {
  enabled: boolean;
  volume: number;
};

type AmbientAudioContextValue = AmbientAudioPreference & {
  isPlaying: boolean;
  isHydrated: boolean;
  start: () => Promise<void>;
  stop: () => void;
  toggle: () => Promise<void>;
  setVolume: (volume: number) => void;
};

const noopAsync = async () => undefined;
const noop = () => undefined;

const AmbientAudioContext = createContext<AmbientAudioContextValue>({
  enabled: false,
  volume: DEFAULT_AMBIENT_VOLUME,
  isPlaying: false,
  isHydrated: false,
  start: noopAsync,
  stop: noop,
  toggle: noopAsync,
  setVolume: noop,
});

function clampVolume(volume: number) {
  if (!Number.isFinite(volume)) {
    return DEFAULT_AMBIENT_VOLUME;
  }
  return Math.min(1, Math.max(0, volume));
}

function readStoredPreference(): AmbientAudioPreference {
  if (typeof window === "undefined") {
    return { enabled: false, volume: DEFAULT_AMBIENT_VOLUME };
  }

  try {
    const rawValue = window.localStorage.getItem(AMBIENT_AUDIO_STORAGE_KEY);
    if (!rawValue) {
      return { enabled: false, volume: DEFAULT_AMBIENT_VOLUME };
    }

    const parsed = JSON.parse(rawValue) as Partial<AmbientAudioPreference>;
    return {
      enabled: false,
      volume: clampVolume(
        typeof parsed.volume === "number" ? parsed.volume : DEFAULT_AMBIENT_VOLUME
      ),
    };
  } catch {
    return { enabled: false, volume: DEFAULT_AMBIENT_VOLUME };
  }
}

function writeStoredPreference(preference: AmbientAudioPreference) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      AMBIENT_AUDIO_STORAGE_KEY,
      JSON.stringify({ ...preference, enabled: false })
    );
  } catch {
    // Local persistence is best-effort only.
  }
}

export function AmbientAudioProvider({ children }: { children: React.ReactNode }) {
  const [volume, setVolumeState] = useState(DEFAULT_AMBIENT_VOLUME);
  const [isHydrated, setIsHydrated] = useState(false);

  const start = useCallback(async () => {
    // TODO: Revisit ambient audio through a native iOS path, such as a Capacitor
    // native audio plugin, before enabling any app-wide background sound again.
  }, []);

  const stop = useCallback(() => {
    // Ambient background playback is intentionally disabled.
  }, []);

  const toggle = useCallback(async () => {
    // Ambient background playback is intentionally disabled.
  }, []);

  const setVolume = useCallback((nextVolume: number) => {
    setVolumeState(clampVolume(nextVolume));
  }, []);

  useEffect(() => {
    const storedPreference = readStoredPreference();
    setVolumeState(storedPreference.volume);
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    writeStoredPreference({ enabled: false, volume });
  }, [isHydrated, volume]);

  const value = useMemo<AmbientAudioContextValue>(
    () => ({
      enabled: false,
      volume,
      isPlaying: false,
      isHydrated,
      start,
      stop,
      toggle,
      setVolume,
    }),
    [isHydrated, setVolume, start, stop, toggle, volume]
  );

  return (
    <AmbientAudioContext.Provider value={value}>{children}</AmbientAudioContext.Provider>
  );
}

export function useAmbientAudio() {
  return useContext(AmbientAudioContext);
}
