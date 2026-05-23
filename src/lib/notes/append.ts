/**
 * Append a block of dictated/captured text to an existing free-form notes
 * field, stamping it with the current local date+time so each entry is
 * visually separated.
 *
 * Format:
 *
 *     prior notes
 *
 *     [2026-05-23 14:52]
 *     new content
 *
 * Used by the /work technician workspace so multiple dictation passes
 * accumulate as a chronological log instead of a smeared run-on.
 */
export function appendTimestamped(existing: string, addition: string): string {
  const add = addition.trim();
  if (add.length === 0) return existing;
  const prior = existing.trim();
  const stamp = formatLocalStamp(new Date());
  const block = `[${stamp}]\n${add}`;
  return prior.length === 0 ? block : `${prior}\n\n${block}`;
}

function formatLocalStamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    ` ${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}
