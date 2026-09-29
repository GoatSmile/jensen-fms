"use server";

import { dictationReady } from "@/lib/dictation/ready";

/**
 * Asked when the command sheet opens, not on every page render: the sheet
 * lives in the app chrome, and the layout should not pay a settings query
 * for a button most page views never press.
 */
export async function readDictationReady(): Promise<boolean> {
  return dictationReady();
}
