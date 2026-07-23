import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { Logo } from "@/components/logo";
import { safeNextPath } from "@/lib/auth/gate";
import { readGate } from "@/lib/auth/read-session";
import { localizedName } from "@/i18n/vocab";
import { loadPeopleForRole } from "@/lib/people/queries";
import { createClient } from "@/lib/supabase/server";

import { PersonPicker } from "./_components/person-picker";

/**
 * Tap-your-name (people & roles P3) — the Netflix-profile moment after a
 * role login: pick who is actually standing at the screen. Self-claimed
 * (locked decision); stores the person in the signed session cookie.
 * Reachable any time via the person chip in the nav to switch.
 */
export default async function WhoAmIPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next: nextParam } = await searchParams;
  const next = safeNextPath(nextParam);

  const gate = await readGate();
  // Person identity only exists on role sessions; everyone else has
  // nothing to pick here.
  if (gate.kind !== "role") redirect(next);

  const [t, locale] = await Promise.all([
    getTranslations("whoami"),
    getLocale(),
  ]);
  const supabase = await createClient();
  const [people, roleRes] = await Promise.all([
    loadPeopleForRole(supabase, gate.session.role),
    supabase
      .from("roles")
      .select("name_en, name_da")
      .eq("key", gate.session.role)
      .maybeSingle(),
  ]);
  if (people.length === 0) redirect(next);

  const roleName = roleRes.data
    ? localizedName(locale, roleRes.data.name_en, roleRes.data.name_da)
    : gate.session.role;

  return (
    <div className="flex min-h-[70vh] flex-1 items-center justify-center p-6">
      <div className="flex w-full max-w-md flex-col items-center gap-6">
        <Logo heightClass="h-10" />
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("title")}
          </h1>
          <p className="text-muted-foreground text-sm">
            {t("subtitle", { role: roleName })}
          </p>
        </div>
        <PersonPicker
          people={people}
          currentId={gate.session.person ?? null}
          next={next}
        />
      </div>
    </div>
  );
}
