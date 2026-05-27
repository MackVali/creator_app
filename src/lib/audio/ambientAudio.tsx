"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export const AMBIENT_AUDIO_PUBLIC_PATH = "/public/sounds/ambient/creator-aura.mp3";
export const AMBIENT_AUDIO_SRC = "/sounds/ambient/creator-aura.mp3";
export const AMBIENT_AUDIO_STORAGE_KEY = "creator:ambient-audio";

const DEFAULT_AMBIENT_VOLUME = 0.35;
const AMBIENT_AUDIO_PLAYBACK_VOLUME_CAP = 0.3;
const UNLOCK_EVENTS = ["pointerdown", "touchstart", "keydown", "click"] as const;

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
  enabled: true,
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

export function getAmbientPlaybackVolume(volume: number) {
  return clampVolume(volume) * AMBIENT_AUDIO_PLAYBACK_VOLUME_CAP;
}

function readStoredPreference(): AmbientAudioPreference {
  if (typeof window === "undefined") {
    return { enabled: true, volume: DEFAULT_AMBIENT_VOLUME };
  }

  try {
    const rawValue = window.localStorage.getItem(AMBIENT_AUDIO_STORAGE_KEY);
    if (!rawValue) {
      return { enabled: true, volume: DEFAULT_AMBIENT_VOLUME };
    }

    const parsed = JSON.parse(rawValue) as Partial<AmbientAudioPreference>;
    return {
      enabled: parsed.enabled !== false,
      volume: clampVolume(
        typeof parsed.volume === "number" ? parsed.volume : DEFAULT_AMBIENT_VOLUME
      ),
    };
  } catch {
    return { enabled: true, volume: DEFAULT_AMBIENT_VOLUME };
  }
}

function writeStoredPreference(preference: AmbientAudioPreference) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(AMBIENT_AUDIO_STORAGE_KEY, JSON.stringify(preference));
  } catch {
    // Local persistence is best-effort only.
  }
}

export function AmbientAudioProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [volume, setVolumeState] = useState(DEFAULT_AMBIENT_VOLUME);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  const ensureAudio = useCallback(() => {
    if (typeof window === "undefined") {
      return null;
    }

    if (!audioRef.current) {
      const audio = new Audio(AMBIENT_AUDIO_SRC);
      audio.loop = true;
      audio.preload = "none";
      audio.volume = getAmbientPlaybackVolume(volume);
      audio.addEventListener("ended", () => setIsPlaying(false));
      audio.addEventListener("pause", () => setIsPlaying(false));
      audio.addEventListener("error", () => setIsPlaying(false));
      audioRef.current = audio;
    }

    audioRef.current.loop = true;
    audioRef.current.volume = getAmbientPlaybackVolume(volume);
    return audioRef.current;
  }, [volume]);

  const startPlayback = useCallback(async () => {
    const audio = ensureAudio();
    if (!audio) {
      return;
    }

    try {
      audio.loop = true;
      audio.volume = getAmbientPlaybackVolume(volume);
      await audio.play();
      setIsPlaying(true);
    } catch {
      setIsPlaying(false);
    }
  }, [ensureAudio, volume]);

  const stopPlayback = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setIsPlaying(false);
  }, []);

  const start = useCallback(async () => {
    setEnabled(true);
    await startPlayback();
  }, [startPlayback]);

  const stop = useCallback(() => {
    setEnabled(false);
    stopPlayback();
  }, [stopPlayback]);

  const toggle = useCallback(async () => {
    if (enabled) {
      stop();
      return;
    }

    await start();
  }, [enabled, start, stop]);

  const setVolume = useCallback((nextVolume: number) => {
    const clampedVolume = clampVolume(nextVolume);
    setVolumeState(clampedVolume);
    if (audioRef.current) {
      audioRef.current.volume = getAmbientPlaybackVolume(clampedVolume);
    }
  }, []);

  useEffect(() => {
    const storedPreference = readStoredPreference();
    setEnabled(storedPreference.enabled);
    setVolumeState(storedPreference.volume);
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    writeStoredPreference({ enabled, volume });
  }, [enabled, isHydrated, volume]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    if (!enabled) {
      stopPlayback();
      return;
    }

    if (isPlaying) {
      return;
    }

    const unlockAudio = () => {
      UNLOCK_EVENTS.forEach((eventName) => {
        window.removeEventListener(eventName, unlockAudio);
      });
      void startPlayback();
    };

    UNLOCK_EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, unlockAudio, { once: true, passive: true });
    });

    return () => {
      UNLOCK_EVENTS.forEach((eventName) => {
        window.removeEventListener(eventName, unlockAudio);
      });
    };
  }, [enabled, isHydrated, isPlaying, startPlayback, stopPlayback]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = getAmbientPlaybackVolume(volume);
    }
  }, [volume]);

  useEffect(() => {
    return () => {
      stopPlayback();
      audioRef.current = null;
    };
  }, [stopPlayback]);

  const value = useMemo<AmbientAudioContextValue>(
    () => ({
      enabled,
      volume,
      isPlaying,
      isHydrated,
      start,
      stop,
      toggle,
      setVolume,
    }),
    [enabled, isHydrated, isPlaying, setVolume, start, stop, toggle, volume]
  );

  return (
    <AmbientAudioContext.Provider value={value}>{children}</AmbientAudioContext.Provider>
  );
}

export function useAmbientAudio() {
  return useContext(AmbientAudioContext);
}
