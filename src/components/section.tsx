/**
 * `Section` is the historical name for what is now `Panel` — the single
 * shared surface — kept as a re-export so the files already importing it need
 * no edit. Its old implementation (`rounded-md border` plus a `border-b`
 * header) was one of the 345 hand-rolled boxes; `Panel` is the Direction B
 * replacement, and everything that imports `Section` inherits it.
 *
 * New code should import `Panel` directly. The `className` passthrough
 * survives mainly so the not-yet-swept pastel tint classes keep working
 * mid-migration — prefer `hue` over a hand-written fill.
 */
export {
  Panel as Section,
  type PanelProps as SectionProps,
} from "@/components/ui/panel";
