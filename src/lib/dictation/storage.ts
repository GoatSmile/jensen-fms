/**
 * Where a dictation's audio lives while it is being transcribed — shared by the
 * action that mints the upload URL, the route that transcribes it, and the
 * retention cron that sweeps whatever the two of them dropped.
 *
 * It shares the inbound bucket (private, EU) but NOT the voicemail lifecycle:
 * a dictation's audio is deleted the moment its text comes back. Nothing about
 * it is worth keeping — the transcript goes straight into a field the tech is
 * looking at, and the recording is a worker's own voice.
 */
export const INBOUND_BUCKET = "inbound";
export const DICTATION_PREFIX = "dictation";

export function dictationObjectPath(): string {
  return `${DICTATION_PREFIX}/${crypto.randomUUID()}.wav`;
}

/**
 * Would this path be one of ours? The browser hands the path back, so it is
 * untrusted input — anything outside the prefix is refused rather than signed.
 * Munin's tenant-prefix check, same reasoning.
 */
export function isDictationPath(path: string): boolean {
  return (
    path.startsWith(`${DICTATION_PREFIX}/`) &&
    !path.includes("..") &&
    path.endsWith(".wav")
  );
}
