/**
 * The TEST marker, carried from a parent document to what it generates.
 *
 * Test data wears "TEST" at the front of whatever a human reads first — for a
 * document with a gapless number, its notes (CLAUDE.md, owner's rule
 * 2026-09-02). A human types it on the order they create; the app then
 * generates bikes, MOs and paint orders from that order, and until this
 * helper those children inherited nothing — 14 of the 20 documents in the
 * 15 Sep test chain carried no marker and had to be found by date.
 *
 * So a child of a TEST parent starts its own notes with the marker, and the
 * next cleanup stays a query (`notes like 'TEST%'`).
 */
export function isTestMarked(text: string | null | undefined): boolean {
  return /^\s*TEST\b/.test(text ?? "");
}

/**
 * A generated TITLE (a calendar entry) from a TEST parent starts with "TEST",
 * so test entries in a shared calendar are found the same way (owner,
 * 2026-10-07: testing may write to *Servicebesøg* with TEST in the title).
 */
export function inheritTestTitle(parentText: string | null | undefined, title: string): string {
  return isTestMarked(parentText) && !isTestMarked(title) ? `TEST ${title}` : title;
}

/**
 * The child's notes: its own, prefixed with "TEST" when the parent is marked
 * and the child is not already. A child of an unmarked parent is untouched.
 */
export function inheritTestMarker(
  parentNotes: string | null | undefined,
  childNotes: string | null | undefined,
): string | null {
  const own = childNotes?.trim() ? childNotes : null;
  if (!isTestMarked(parentNotes) || isTestMarked(own)) return own;
  return own ? `TEST — ${own}` : "TEST";
}
