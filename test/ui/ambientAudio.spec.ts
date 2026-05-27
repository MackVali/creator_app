import { describe, expect, it } from "vitest";

import { getAmbientPlaybackVolume } from "../../src/lib/audio/ambientAudio";

describe("ambient audio playback volume", () => {
  it("caps UI volume at 30% playback volume", () => {
    expect(getAmbientPlaybackVolume(1)).toBe(0.3);
    expect(getAmbientPlaybackVolume(0.5)).toBe(0.15);
    expect(getAmbientPlaybackVolume(0.25)).toBe(0.075);
  });
});
