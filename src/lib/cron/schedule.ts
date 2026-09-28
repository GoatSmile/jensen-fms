import vercelConfig from "../../../vercel.json";

import { JOBS } from "./jobs";

/**
 * The scheduled jobs as /admin/jobs lists them: vercel.json is the source of
 * WHAT runs WHEN (the platform reads it, so nothing else may claim to), the
 * JOBS map is what the code can run. A job in one and not the other is
 * reported, not hidden — that mismatch is exactly what an admin needs to see.
 */
export type ScheduledJob = {
  key: string;
  path: string | null;
  schedule: string | null;
  /** In vercel.json but no code knows how to run it by hand. */
  unknownToCode: boolean;
  /** Code exists but vercel.json never schedules it. */
  notScheduled: boolean;
};

export function listScheduledJobs(): ScheduledJob[] {
  const crons = (vercelConfig as { crons?: { path: string; schedule: string }[] })
    .crons ?? [];
  const out: ScheduledJob[] = crons.map((c) => {
    const key = c.path.replace(/^\/api\/cron\//, "");
    return {
      key,
      path: c.path,
      schedule: c.schedule,
      unknownToCode: !(key in JOBS),
      notScheduled: false,
    };
  });
  for (const key of Object.keys(JOBS)) {
    if (!out.some((j) => j.key === key)) {
      out.push({ key, path: null, schedule: null, unknownToCode: false, notScheduled: true });
    }
  }
  return out;
}

/** One cron field ("*", "5", "1-5", "1,3,5") → the numbers it allows. */
function field(spec: string, min: number, max: number): Set<number> {
  const out = new Set<number>();
  for (const part of spec.split(",")) {
    if (part === "*") {
      for (let i = min; i <= max; i++) out.add(i);
    } else if (part.includes("-")) {
      const [a, b] = part.split("-").map(Number);
      for (let i = a!; i <= b!; i++) out.add(i);
    } else {
      out.add(Number(part));
    }
  }
  return out;
}

/**
 * The next time a cron expression fires after `from`, in UTC (Vercel's clock).
 * Handles what vercel.json uses — minute, hour and weekday fields; a
 * day-of-month or month other than "*" returns null rather than a wrong date.
 */
export function nextRun(schedule: string, from = new Date()): Date | null {
  const [m, h, dom, mon, dow] = schedule.trim().split(/\s+/);
  if (!m || !h || dom !== "*" || mon !== "*" || !dow) return null;
  const minutes = field(m, 0, 59);
  const hours = field(h, 0, 23);
  const days = field(dow, 0, 6);
  for (let d = 0; d < 8; d++) {
    const day = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + d));
    if (!days.has(day.getUTCDay())) continue;
    for (const hh of [...hours].sort((a, b) => a - b)) {
      for (const mm of [...minutes].sort((a, b) => a - b)) {
        const t = new Date(day);
        t.setUTCHours(hh, mm, 0, 0);
        if (t > from) return t;
      }
    }
  }
  return null;
}
