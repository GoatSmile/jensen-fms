/**
 * The secretary's reply as it is WRITTEN (2026-10-22): the model answers
 * through the `respond` tool, whose input streams as JSON, and the voice
 * starts on the first finished sentence instead of the whole answer — about a
 * second sooner on a lookup, more on a long reply. Pure; no I/O.
 */

/**
 * The `text` field of a `respond` input that is still being written — the
 * decoded string so far, and whether it is complete. Null until the field
 * has started. Escapes are decoded; a half-written escape at the very end
 * waits for the next fragment.
 */
export function partialReplyText(json: string): { text: string; closed: boolean } | null {
  const m = /"text"\s*:\s*"/.exec(json);
  if (!m) return null;
  let i = m.index + m[0].length;
  let out = "";
  while (i < json.length) {
    const c = json[i];
    if (c === "\\") {
      if (i + 1 >= json.length) break;
      const n = json[i + 1];
      if (n === "u") {
        if (i + 6 > json.length) break;
        out += String.fromCharCode(parseInt(json.slice(i + 2, i + 6), 16));
        i += 6;
        continue;
      }
      out += ESCAPES[n] ?? n;
      i += 2;
      continue;
    }
    if (c === '"') return { text: out, closed: true };
    out += c;
    i++;
  }
  return { text: out, closed: false };
}

const ESCAPES: Record<string, string> = { n: "\n", t: "\t", r: "\r", b: "\b", f: "\f" };

/**
 * Where a sentence ends: a full stop, ! or ? followed by space and a capital
 * or a digit, or a line break — never inside "2.5" or "28. juli".
 */
const SENTENCE_END = /[.!?](?=\s+["„«]?[A-ZÆØÅ0-9])|\n+/g;

/** "kl. 9", "ca. 2 timer", "nr. 35": an abbreviation before a number is not an end. */
const ABBREVIATION = /(?:^|[\s(])(?:kl|ca|nr|pkt|tlf|str|kr|evt|inkl|ekskl|no|approx|vs)\.$/i;

/** A piece this short waits for the next, so the voice never says one word alone. */
const MIN_PIECE = 24;

/**
 * Feed it the reply text as it grows; it hands back each finished sentence
 * once. `finish()` gives the rest. What it has handed out, in order, is
 * exactly the text — so the caller can tell what the code later appended.
 */
export function sentenceSplitter(): { push: (text: string) => string[]; finish: (text: string) => string[] } {
  let sent = 0;
  const cut = (text: string, all: boolean): string[] => {
    const out: string[] = [];
    let from = sent;
    SENTENCE_END.lastIndex = sent;
    for (let m = SENTENCE_END.exec(text); m; m = SENTENCE_END.exec(text)) {
      const end = m.index + m[0].length;
      if (m[0] === "." && ABBREVIATION.test(text.slice(Math.max(0, end - 8), end))) continue;
      if (end - from >= MIN_PIECE) {
        out.push(text.slice(from, end));
        from = end;
      }
    }
    if (all && from < text.length) {
      out.push(text.slice(from));
      from = text.length;
    }
    sent = from;
    return out.filter((piece) => piece.trim());
  };
  return { push: (text) => cut(text, false), finish: (text) => cut(text, true) };
}
