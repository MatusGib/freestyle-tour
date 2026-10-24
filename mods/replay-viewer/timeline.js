// Pure helpers for the replay viewer, shared with the tests.
export const STEPS_PER_SECOND = 120;
export const SPEEDS = [0.25, 0.5, 1, 2, 4];
export const MAX_CLIP_STEPS = 60 * STEPS_PER_SECOND;

// Offsets for the game's cameraView (distance 0.45-2.2, elevation -0.18-0.8).
export const CAMERAS = {
  Follow: { distance: 1, azimuth: 0, elevation: 0 },
  Side: { distance: 1.3, azimuth: Math.PI / 2, elevation: 0.05 },
  High: { distance: 1.8, azimuth: 0, elevation: 0.75 },
};

const VIDEO_TYPES = ["video/mp4;codecs=avc1.42E01F", "video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];

export function formatTime(steps) {
  const seconds = Math.floor(steps / STEPS_PER_SECOND);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

// Turns frame times into whole steps at the chosen speed, carrying the
// remainder to the next frame. A long frame (say, after a tab switch) counts
// as 0.1 s so playback doesn't jump.
export function createStepClock() {
  let carry = 0;
  return (speed, seconds) => {
    carry += speed * Math.min(seconds, 0.1) * STEPS_PER_SECOND;
    const steps = Math.floor(carry);
    carry -= steps;
    return steps;
  };
}

export const moveMarkers = (attempts) =>
  attempts.map((a) => ({ id: a.id, step: Math.round(a.startedAt * STEPS_PER_SECOND), label: a.label, tack: a.tack, score: a.score, status: a.status }));

// Orders the ends, keeps them inside the heat and limits the clip to 60 s.
export function normalizeClip(a, b, totalSteps) {
  const start = Math.max(0, Math.min(a, b));
  const end = Math.min(totalSteps, Math.max(a, b), start + MAX_CLIP_STEPS);
  return { start, end };
}

// Attempts store only their start, so a move's clip runs from 2 s before it to 8 s after.
export const clipAround = (marker, totalSteps) => normalizeClip(marker.step - 2 * STEPS_PER_SECOND, marker.step + 8 * STEPS_PER_SECOND, totalSteps);

export function clipFileName(nickname, finishedAt, startStep, extension) {
  const slug = nickname.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "rider";
  const date = new Date(finishedAt).toISOString().slice(0, 10);
  return `freestyle-tour-${slug}-${date}-${Math.round(startStep / STEPS_PER_SECOND)}s.${extension}`;
}

export const pickVideoType = (isSupported) => VIDEO_TYPES.find((type) => isSupported(type)) ?? null;
export const extensionFor = (type) => (type.startsWith("video/mp4") ? "mp4" : "webm");
