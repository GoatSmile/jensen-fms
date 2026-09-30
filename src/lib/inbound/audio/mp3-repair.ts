/**
 * Repair an MP3 whose frames change format partway through.
 *
 * Relatel's recordings of OUTGOING mobile calls are built that way (found
 * 2026-09-29): one stereo header frame, a MONO block exactly as long as the
 * recording Relatel reports, then a STEREO block of a few seconds that matches
 * nothing in the call record. Browsers play past the seams; Gladia refuses the
 * whole file ("decoded frame channel count (2) does not match…", surfaced as
 * "Failed to fetch audio from the provided URL"). Each block on its own is a
 * valid MP3 and transcribes.
 *
 * So: split the stream into runs of one format (MPEG version, sample rate,
 * mono vs not) and keep the LONGEST run by duration — on the recordings seen,
 * that is the conversation, to the second. A homogeneous file comes back as
 * `null`, untouched. Pure and dependency-free: no ffmpeg on Vercel.
 */

export type Mp3Repair = {
  bytes: Uint8Array;
  keptSeconds: number;
  totalSeconds: number;
  /** One entry per run, in file order — kept for the record on the row. */
  runs: { format: string; frames: number; seconds: number }[];
};

// Layer III bitrates (kbps) by index: MPEG-1, and MPEG-2 / 2.5.
const BITRATE_V1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const BITRATE_V2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
// Sample rates by version bits (3 = MPEG-1, 2 = MPEG-2, 0 = MPEG-2.5).
const SAMPLE_RATES: Record<number, number[]> = {
  3: [44100, 48000, 32000],
  2: [22050, 24000, 16000],
  0: [11025, 12000, 8000],
};

type Frame = { start: number; end: number; key: string; seconds: number };

function readFrame(b: Uint8Array, i: number): Frame | null {
  if (i + 4 > b.length || b[i] !== 0xff || (b[i + 1] & 0xe0) !== 0xe0) return null;
  const version = (b[i + 1] >> 3) & 3;
  const layer = (b[i + 1] >> 1) & 3;
  const bitrateIdx = b[i + 2] >> 4;
  const rateIdx = (b[i + 2] >> 2) & 3;
  const padding = (b[i + 2] >> 1) & 1;
  const mode = b[i + 3] >> 6; // 3 = mono
  if (version === 1 || layer !== 1 || bitrateIdx === 0 || bitrateIdx === 15 || rateIdx === 3) {
    return null;
  }
  const rate = SAMPLE_RATES[version][rateIdx];
  const kbps = (version === 3 ? BITRATE_V1 : BITRATE_V2)[bitrateIdx];
  const samples = version === 3 ? 1152 : 576;
  const length = Math.floor(((samples / 8) * kbps * 1000) / rate) + padding;
  if (length < 4 || i + length > b.length) return null;
  return {
    start: i,
    end: i + length,
    key: `${version === 3 ? "1" : version === 2 ? "2" : "2.5"}/${rate}/${mode === 3 ? "mono" : "stereo"}`,
    seconds: samples / rate,
  };
}

export function repairMixedMp3(input: ArrayBuffer | Uint8Array): Mp3Repair | null {
  const b = input instanceof Uint8Array ? input : new Uint8Array(input);
  let i = 0;
  // Skip an ID3v2 tag.
  if (b.length > 10 && b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) {
    i = 10 + (((b[6] & 0x7f) << 21) | ((b[7] & 0x7f) << 14) | ((b[8] & 0x7f) << 7) | (b[9] & 0x7f));
  }

  type Run = { key: string; start: number; end: number; frames: number; seconds: number };
  const runs: Run[] = [];
  while (i < b.length - 4) {
    const f = readFrame(b, i);
    if (!f) {
      i += 1; // resync byte by byte past junk between frames
      continue;
    }
    const last = runs[runs.length - 1];
    if (last && last.key === f.key && last.end === f.start) {
      last.end = f.end;
      last.frames += 1;
      last.seconds += f.seconds;
    } else {
      runs.push({ key: f.key, start: f.start, end: f.end, frames: 1, seconds: f.seconds });
    }
    i = f.end;
  }

  // Only a change of FORMAT needs repair; a gap inside one format does not.
  if (new Set(runs.map((r) => r.key)).size <= 1) return null;

  const best = runs.reduce((a, r) => (r.seconds > a.seconds ? r : a));
  const round = (s: number) => Math.round(s * 100) / 100;
  return {
    bytes: b.slice(best.start, best.end),
    keptSeconds: round(best.seconds),
    totalSeconds: round(runs.reduce((s, r) => s + r.seconds, 0)),
    runs: runs.map((r) => ({ format: r.key, frames: r.frames, seconds: round(r.seconds) })),
  };
}

/**
 * How many channels a recording carries — 1, 2, or null when unknown. Read
 * from the bytes, not a label: a WAV's `fmt ` chunk, else the first MP3 frame
 * header (after any ID3 tag). Decides whether a two-way call can be split by
 * channel (stereo) or needs speaker separation (mono).
 */
export function audioChannelCount(input: ArrayBuffer | Uint8Array): number | null {
  const b = input instanceof Uint8Array ? input : new Uint8Array(input);
  const ascii = (i: number, n: number) => String.fromCharCode(...b.slice(i, i + n));
  if (b.length > 12 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WAVE") {
    for (let i = 12; i + 8 <= b.length; ) {
      const size = b[i + 4] | (b[i + 5] << 8) | (b[i + 6] << 16) | (b[i + 7] << 24);
      if (ascii(i, 4) === "fmt " && i + 12 <= b.length) return b[i + 10] | (b[i + 11] << 8);
      i += 8 + size + (size % 2);
    }
    return null;
  }
  let i = 0;
  if (b.length > 10 && b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) {
    i = 10 + (((b[6] & 0x7f) << 21) | ((b[7] & 0x7f) << 14) | ((b[8] & 0x7f) << 7) | (b[9] & 0x7f));
  }
  for (const limit = Math.min(b.length - 4, i + 64 * 1024); i < limit; i++) {
    const f = readFrame(b, i);
    if (f) return f.key.endsWith("/mono") ? 1 : 2;
  }
  return null;
}
