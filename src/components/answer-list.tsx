import type { AnswerListItem } from "@/lib/assistant/answer";

/** The rows of a reply — shown, never spoken. The conversation and the panel both show them (2026-10-22). */
export function AnswerList({ rows }: { rows: AnswerListItem[] }) {
  return (
    <ul className="bg-ground flex flex-col gap-1 rounded-xl px-3 py-2 text-sm">
      {rows.map((row, i) => (
        <li key={i} className="flex min-w-0 items-baseline justify-between gap-3">
          <span className="min-w-0 truncate">{row.label}</span>
          {row.detail ? <span className="text-ink-2 shrink-0 text-xs">{row.detail}</span> : null}
        </li>
      ))}
    </ul>
  );
}
