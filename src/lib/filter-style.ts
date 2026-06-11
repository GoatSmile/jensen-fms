/**
 * App-wide convention: a list-page filter control that is NOT at its default
 * ("all" / empty) gets a primary-blue tint so active filters are visible at a
 * glance. Link-pill filter bars express the same state with a solid primary
 * fill (`variant="default"` buttons / FilterChip).
 */
export const FILTER_ACTIVE_CLASS =
  "border-primary/50 bg-primary/10 dark:bg-primary/25";
