#!/usr/bin/env python3
"""
One-time transform: e-conomic "Kunder.xlsx" export -> migrations/27_import_customers.sql

The SQL file is the durable, reviewable artifact (applied like every other
migration). This script is kept for reproducibility / re-runs if the source
export changes.

Strategy (the "both" model — one parent org + N units):
  * Group rows by a normalised parent key (prefix before " - ", with a small
    map fixing known kommune name variants).
  * A group becomes parent+units when the prefix is an umbrella
    (Kommune/Hospital/Universitet/Region) OR has >=2 rows and a " - " split.
  * Parent = the bare umbrella row if one exists (carries its own Nr/EAN/
    address); otherwise synthesised (no external_customer_no).
  * "X Kommune - Y" rows become units, each keeping its OWN Nr/EAN/address.
  * Everything else is a standalone organization.
  * Private persons (b2c) import as organizations too (faithful to e-conomic,
    where every Nr is a debitor).

No UUIDs are hardcoded: orgs use the gen_random_uuid() default and units are
linked via a CTE (WITH p AS (INSERT ... RETURNING id)) in the same statement.
Segments are resolved by slug subquery. Geocoding is deliberately NOT done
here — it's a separate follow-up (510 external calls).
"""
import pandas as pd
import sys
from pathlib import Path

SRC = "/Users/nt/Documents/1-Projects/Jensen/Customers/Kunder.xlsx"
OUT_SQL = Path(__file__).resolve().parent.parent / "migrations" / "27_import_customers.sql"

# gruppe -> customer_segments.slug
SEGMENT = {
    "Kommuner": "municipality",
    "Privat kunder": "b2c",
    "Firma kunder": "b2b",
    "Ejendomsmæglere": "real_estate",
    "Boligselskaber": "housing_association",
    "Hospitaler": "hospital",
    "Diverse": "other",
    "Udlands kunder": "other",
    "Privat hjemmepleje": "facility_management",
}

# country name (Land column) -> ISO-3166 alpha-2; blank => DK
COUNTRY = {
    "danmark": "DK", "denmark": "DK", "tyskland": "DE", "germany": "DE",
    "sweden": "SE", "sverige": "SE", "switzerland": "CH", "schweiz": "CH",
    "china": "CN", "bulgaria": "BG", "brazil": "BR",
}

# --- Conservative umbrella grouping ----------------------------------------
# Only PUBLIC-SECTOR umbrellas are consolidated: rows whose name explicitly
# contains "kommune", "hospital", or (Københavns) "universitet". Real-estate
# franchises (EDC/Danbolig/Nybolig) and everything else stay FLAT — they are
# independent businesses, not departments. Spelling variants of the same
# kommune are merged to one canonical name. Every source row keeps its own
# external_customer_no (parents are synthesised with NO number), so no
# e-conomic account is lost in a merge.
import re

KOMMUNE_TOWNS = {  # substring in lowercased name -> canonical kommune
    "furesø": "Furesø Kommune", "furresø": "Furesø Kommune",
    "lyngby": "Lyngby-Taarbæk Kommune",
    "rødov": "Rødovre Kommune",
    "gentofte": "Gentofte Kommune", "gladsaxe": "Gladsaxe Kommune",
    "herlev": "Herlev Kommune", "ballerup": "Ballerup Kommune",
    "allerød": "Allerød Kommune", "hørsholm": "Hørsholm Kommune",
    "albertslund": "Albertslund Kommune", "halsnæs": "Halsnæs Kommune",
    "helsingør": "Helsingør Kommune", "frederiksberg": "Frederiksberg Kommune",
    "fredensborg": "Fredensborg Kommune", "kerteminde": "Kerteminde Kommune",
}


def canonical_umbrella(name):
    """Return (canonical_name, type) if the row is a public-sector umbrella
    member, else (None, None). Honours the conservative rule: must literally
    contain kommune / hospital / universitet."""
    p = name.lower().replace(".", " ")
    if "hospital" in p:
        if "rigshospital" in p:
            return "Rigshospitalet", "hospital"
        if "herlev" in p:
            return "Herlev Hospital", "hospital"
        return name.split(" - ")[0].strip(), "hospital"
    if "universitet" in p and "københav" in p:
        return "Københavns Universitet", "universitet"
    if "høje" in p and ("tåstrup" in p or "taastrup" in p) and "kommune" in p:
        return "Høje-Taastrup Kommune", "kommune"
    if "københavns kommune" in p:
        return "Københavns Kommune", "kommune"
    if "kommune" in p:
        for town, canon in KOMMUNE_TOWNS.items():
            if town in p:
                return canon, "kommune"
        return name.split(" - ")[0].strip(), "kommune"  # e.g. "Kommune Leasing"
    return None, None


def unit_remainder(name, utype):
    """Strip the umbrella token + leading separators to get the unit name.
    Empty result => a bare 'main account' row (kept, named as-is)."""
    pat = {"kommune": r"^.*?kommunes?\b", "hospital": r"^.*?hospital\w*",
           "universitet": r"^.*?universitet\w*"}[utype]
    rem = re.sub(pat + r"[\s.\-]*", "", name, count=1, flags=re.IGNORECASE).strip()
    return rem


def s(v):
    """SQL string literal or NULL."""
    if v is None:
        return "NULL"
    t = str(v).strip()
    if t == "" or t.lower() == "nan":
        return "NULL"
    return "'" + t.replace("'", "''") + "'"


def num(v):
    if v is None:
        return "NULL"
    try:
        return str(int(float(v)))
    except (ValueError, TypeError):
        return "NULL"


def zip_str(v):
    """Postnr. floats -> 4-digit text."""
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return "NULL"
    try:
        return s(str(int(float(v))))
    except (ValueError, TypeError):
        return s(v)


def country(land):
    if land is None or (isinstance(land, float) and pd.isna(land)):
        return "'DK'"
    return "'" + COUNTRY.get(str(land).strip().lower(), "DK") + "'"


def main():
    df = pd.read_excel(SRC, header=5).dropna(how="all")
    df.columns = ["gruppe", "nr", "navn", "adr", "postnr", "by", "land",
                  "tlf", "attn", "deres_ref", "email"]
    df["navn"] = df["navn"].astype(str).str.strip()
    df = df[df["navn"].str.lower() != "nan"]

    # Bucket rows by canonical umbrella; non-umbrella rows are standalone.
    buckets = {}   # canonical_name -> {"type":..., "rows":[(row, unit_name_or_None)]}
    standalone = []
    for _, r in df.iterrows():
        canon, utype = canonical_umbrella(r["navn"])
        if canon is None:
            standalone.append(r)
        else:
            rem = unit_remainder(r["navn"], utype)
            buckets.setdefault(canon, {"type": utype, "rows": []})
            buckets[canon]["rows"].append((r, rem if rem else r["navn"]))

    # A bucket with a single row is just a standalone org (no point making a
    # 1-unit parent). Multi-row buckets become synthesised parent + units.
    parents = []   # (canonical, seg, [(row, unit_name)])
    flags = []
    for canon, b in buckets.items():
        if len(b["rows"]) == 1:
            standalone.append(b["rows"][0][0])
            continue
        seg = "hospital" if b["type"] == "hospital" else \
              ("municipality" if b["type"] == "kommune" else "other")
        parents.append((canon, seg, b["rows"]))
        spellings = {row["navn"].split(" - ")[0].strip() for row, _ in b["rows"]}
        if len(spellings) > 1:
            flags.append(f"MERGED variants -> '{canon}': " + " | ".join(sorted(spellings)))

    # Emit SQL ----------------------------------------------------------------
    out = []
    out.append("-- 27_import_customers.sql")
    out.append("-- One-time import of the e-conomic Kunder.xlsx export (generated by")
    out.append("-- scripts/import_customers.py). Greenfield + reversible: undo with")
    out.append("--   DELETE FROM organization_units WHERE external_customer_no IS NOT NULL;")
    out.append("--   DELETE FROM organizations WHERE external_customer_no IS NOT NULL;")
    out.append("-- (synthesised parents have no external_customer_no — see report).")
    out.append("")

    def seg_sub(slug):
        return f"(SELECT id FROM customer_segments WHERE slug='{slug}')"

    # Parents (synthesised umbrella, no customer no.) + their units. One CTE
    # per group so unit rows reference the parent id without a hardcoded UUID.
    for canon, seg, urows in parents:
        out.append("WITH p AS (")
        out.append("  INSERT INTO organizations (legal_name, display_name_da, "
                   "customer_segment_id)")
        out.append(f"  VALUES ({s(canon)}, {s(canon)}, {seg_sub(seg)}) RETURNING id)")
        out.append("INSERT INTO organization_units (organization_id, name, "
                   "external_customer_no, address, zip_code, city, country_code, phone, email)")
        sel = []
        for i, (u, uname) in enumerate(urows):
            cast = ("::int", "::text", "::text", "::text", "::char(2)", "::text", "::citext") if i == 0 else ("",) * 7
            sel.append(
                f"  SELECT id, {s(uname)}, {num(u['nr'])}{cast[0]}, "
                f"{s(u['adr'])}{cast[1]}, {zip_str(u['postnr'])}{cast[2]}, {s(u['by'])}{cast[3]}, "
                f"{country(u['land'])}{cast[4]}, {s(u['tlf'])}{cast[5]}, {s(u['email'])}{cast[6]} FROM p")
        out.append("\n  UNION ALL\n".join(sel) + ";")
        out.append("")

    # Standalone orgs (one multi-row INSERT)
    out.append("-- Standalone organizations")
    out.append("INSERT INTO organizations (legal_name, display_name_da, "
               "external_customer_no, customer_segment_id, address_line1, "
               "zip_code, city, country_code, phone, email) VALUES")
    rows_sql = []
    for r in standalone:
        seg = SEGMENT.get(r["gruppe"], "other")
        rows_sql.append(
            f"  ({s(r['navn'])}, {s(r['navn'])}, {num(r['nr'])}, {seg_sub(seg)}, "
            f"{s(r['adr'])}, {zip_str(r['postnr'])}, {s(r['by'])}, {country(r['land'])}, "
            f"{s(r['tlf'])}, {s(r['email'])})")
    out.append(",\n".join(rows_sql) + ";")
    out.append("")

    OUT_SQL.write_text("\n".join(out))

    # Report ------------------------------------------------------------------
    n_units = sum(len(u) for _, _, u in parents)
    print(f"Source rows:            {len(df)}")
    print(f"Synthesised parents:    {len(parents)}  (umbrella orgs, no customer no.)")
    print(f"  -> units under them:  {n_units}  (each keeps its own customer no.)")
    print(f"Standalone orgs:        {len(standalone)}")
    print(f"Total organizations:    {len(parents) + len(standalone)}")
    print(f"Accounted rows:         {n_units + len(standalone)} of {len(df)}")
    print()
    print("Segment breakdown (source rows):")
    print(df["gruppe"].map(lambda g: SEGMENT.get(g, "other")).value_counts().to_string())
    print()
    print("Umbrella parents (synthesised):")
    for canon, seg, urows in sorted(parents, key=lambda x: -len(x[2])):
        print(f"  {canon:26s} {len(urows):2d} units  ({seg})")
    print()
    print(f"FLAGS / merges to verify ({len(flags)}):")
    for f in flags:
        print("  -", f)
    print(f"\nWrote {OUT_SQL}")


if __name__ == "__main__":
    main()
