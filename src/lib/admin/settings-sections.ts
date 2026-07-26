import type { PanelHue } from "@/components/ui/panel";

/**
 * The `/admin/settings` sub-rail.
 *
 * One route carrying seven unrelated domains and ~40 controls is what made the
 * page overwhelming — the inbound block alone is 13 inputs. Stacking them
 * vertically means every visit scrolls past six things you didn't come for.
 * Grouping them behind a sub-rail shows one panel at a time and adds no routes.
 *
 * The active section lives in a `?section=` SEARCH PARAM rather than client
 * state, which follows the project's "URL search-params drive views" rule and
 * buys three things: a deep link straight to Accounting, no hydration shift
 * (the page is server-rendered), and only the active panel's markup in the DOM.
 *
 * Trade-off worth knowing: switching sections is a navigation, so unsaved edits
 * in the section you leave are dropped. Each panel has its own Save button and
 * the same is already true of navigating away, so this is predictable rather
 * than surprising — but it is why sections are grouped by domain and kept
 * small, not split arbitrarily.
 */
export type SettingsSectionId =
  | "general"
  | "communication"
  | "accounting"
  | "phone"
  | "public";

export type SettingsSection = {
  id: SettingsSectionId;
  /** Key into the `adminSettings` message namespace. */
  labelKey: string;
  /** Rail hue — matches the hue of the panels inside. */
  hue: PanelHue;
};

export const SETTINGS_SECTIONS: SettingsSection[] = [
  // General collects the app-wide knobs that aren't a domain of their own:
  // working language and the default transport %.
  { id: "general", labelKey: "sectionGeneral", hue: "system" },
  { id: "communication", labelKey: "sectionCommunication", hue: "brand" },
  { id: "accounting", labelKey: "sectionAccounting", hue: "money" },
  { id: "phone", labelKey: "sectionPhone", hue: "brand" },
  { id: "public", labelKey: "sectionPublic", hue: "good" },
];

export const DEFAULT_SETTINGS_SECTION: SettingsSectionId = "general";

/**
 * Resolve `?section=` to a real section. An unknown or absent value falls back
 * to the default rather than rendering an empty page — this param is
 * hand-editable and arrives from bookmarks.
 */
export function resolveSettingsSection(raw: string | undefined): SettingsSectionId {
  return SETTINGS_SECTIONS.some((s) => s.id === raw)
    ? (raw as SettingsSectionId)
    : DEFAULT_SETTINGS_SECTION;
}
