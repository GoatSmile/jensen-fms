#!/usr/bin/env python3
"""
Fleet register -> review lists (and, later, the import migration).

Source: Dennis's register "KOMMUNE og VIRKSOMHEDS OVERSIGT(1).xlsx" — one sheet
per customer, one row per bike that is already out with that customer, plus
twelve monthly sheets that are the service-agreement RENEWAL SCHEDULE (each
bike's anniversary month, years 2/3/4 invoiced or not, and its yearly price).

    python3 scripts/import_fleet.py review            # defaults below
    python3 scripts/import_fleet.py review --src X.xlsx --out DIR

`review` writes CSVs for a human to check and touches no database. It READS
production (customers, units, existing frames and identifiers) through
`supabase db query --linked`, to propose a customer for every sheet and
department and to flag collisions before anything is loaded. The load step
(`sql`, generating a numbered data migration) comes after the review, from the
checked customer mapping.

Rules this encodes (docs/plan-go-live.md §6, DECISIONS 2026-09-26):
  * Sheets holding PERSONAL data — citizens' loan registers and private buyers
    (first name / last name / email columns) — are skipped whole, never read
    into the output.
  * People's names and phone numbers are left out of every output row; the
    department, site address and EAN stay (they describe the customer).
  * Column letters differ per sheet, so every column is found by its label.
  * Frame, battery and charger numbers are split over three cells in the
    register (prefix · digits · letter); they are joined into one canonical,
    space-free, uppercase string. The frame's last letter is a year code.
  * Column A is Jensen's recognition code (BKTM01) — kept only when it looks
    like one; words there ("stjålet") become a status hint instead.
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import difflib
import json
import re
import subprocess
import sys
from collections import Counter, defaultdict
from pathlib import Path

DEFAULT_SRC = Path.home() / "Documents/1-Projects/Jensen/Outdated lists/KOMMUNE og VIRKSOMHEDS OVERSIGT(1).xlsx"
DEFAULT_OUT = Path.home() / f"Documents/1-Projects/Jensen/Fleet/import-review-{dt.date.today().isoformat()}"
REPO = Path(__file__).resolve().parent.parent

MONTHS = ["Januar", "Februar", "Marts", "April", "Maj", "Juni", "Juli",
          "August", "September", "Oktober", "November", "December"]
# Not bikes: contents, contacts, price/labour tables, one-off logs.
NOT_FLEET = {"INDHOLDSFORTEGNELSE", "Ark1", "Sheet1", "KONTAKTLISTE", "LAKERING",
             "ÅRSTAL", "TIMELØN", "AVANCE", "GPS ABONNOMENTER UDEN SERVICE",
             "Høje Tåstrup Batterier", *MONTHS}

LABELS = {  # normalised header text -> field
    "stel nummer": "frame", "stelnummer": "frame", "nøgle nr": "key_no", "model": "model",
    "batteri nummer": "battery", "lader nummer": "charger", "bat.nøg.nr": "battery_key_no",
    "køn": "gender", "str": "size", "nr": "seq", "udlev. dato": "delivered", "købs dato": "delivered",
    "købsdato": "delivered", "overtagelses dato": "takeover", "kunde": "department",
    "leverings sted": "site", "aftale": "agreement", "s aftale": "agreement", "gps": "gps",
    "gps tel": "gps_phone", "ean": "ean", "tekst": "text", "fakturering": "invoiced",
    # personal / contact columns: recognised so they can be DROPPED, never output
    "kontaktperson": "_contact", "kontakt person": "_contact", "telefon nr": "_phone",
    "mobil": "_phone", "telefon": "_phone", "kontakt 2": "_contact",
    "fornavn": "_personal", "efternavn": "_personal", "email": "_personal", "adresse": "_personal",
}
SPLIT3 = {"frame", "battery", "charger"}  # prefix · digits · letter across three cells

STATUS_WORDS = [  # (pattern, bike status, reason)
    (r"stjål|stjal", "lost_or_stolen", "stolen"),
    (r"kan ikke findes|bortkommet|forsvundet", "lost_or_stolen", "cannot be found"),
    (r"udgået|kasseret|skrottet", "retired", "retired"),
]
RECOGNITION = re.compile(r"^[A-ZÆØÅ]{2,}[A-ZÆØÅ0-9 ]*\d+[A-Z]?$")
DA_MONTHS = {m: i for i, m in enumerate(["januar", "februar", "marts", "april", "maj", "juni", "juli",
                                          "august", "september", "oktober", "november", "december"], 1)}


def norm(s) -> str:
    return re.sub(r"\s+", " ", str(s)).strip().lower().rstrip(":").strip()


def cell(v) -> str:
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return re.sub(r"\s+", " ", str(v)).strip()


def as_date(v) -> tuple[str, bool]:
    """ISO date and whether it parsed. Keeps the raw text when it does not."""
    if isinstance(v, (dt.datetime, dt.date)):
        return (v.date() if isinstance(v, dt.datetime) else v).isoformat(), True
    s = cell(v)
    if not s:
        return "", True
    m = re.fullmatch(r"(\d{1,2})[-./](\d{1,2})[-./](\d{2,4})", s)
    if m:
        d, mo, y = (int(x) for x in m.groups())
        y += 2000 if y < 100 else 0
        try:
            return dt.date(y, mo, d).isoformat(), True
        except ValueError:
            return s, False
    m = re.fullmatch(r"(\d{1,2})\.?\s*([a-zæøå]+)\.?\s*(\d{4})", s.lower())
    if m and m.group(2) in DA_MONTHS:
        try:
            return dt.date(int(m.group(3)), DA_MONTHS[m.group(2)], int(m.group(1))).isoformat(), True
        except ValueError:
            return s, False
    return s, False


def joined(parts) -> str:
    return "".join(cell(p).replace(" ", "") for p in parts if cell(p)).upper()


def find_header(rows):
    """(header row index, {col: field}) — the row with most recognised labels
    that includes the frame column; labels one row above (EAN, 'aftale') merge in."""
    best = None
    for i, r in enumerate(rows[:12]):
        hits = {j: LABELS[norm(c)] for j, c in enumerate(r or ()) if c is not None and norm(c) in LABELS}
        if "frame" in hits.values() and (best is None or len(hits) > len(best[1])):
            best = (i, hits)
    if best and best[0] > 0:
        for j, c in enumerate(rows[best[0] - 1] or ()):
            if c is not None and norm(c) in ("ean", "aftale") and j not in best[1]:
                best[1][j] = LABELS[norm(c)]
    return best


# ---------------------------------------------------------------- production

def prod_query(sql: str):
    out = subprocess.run(["supabase", "db", "query", "--linked", sql], cwd=REPO,
                         capture_output=True, text=True, check=True).stdout
    data = json.loads(out[out.index("{"):])
    row = data["rows"][0]
    val = next(iter(row.values()))
    return val if isinstance(val, (list, dict)) else json.loads(val or "null")


def load_production():
    orgs = prod_query(
        "select coalesce(json_agg(x), '[]'::json) from (select o.id, o.legal_name, "
        "(select coalesce(json_agg(json_build_object('id', u.id, 'name', u.name)), '[]'::json) "
        " from organization_units u where u.organization_id = o.id and u.deleted_at is null) units "
        "from organizations o where o.deleted_at is null) x")
    frames = prod_query("select coalesce(json_agg(upper(replace(frame_number, ' ', ''))), '[]'::json) "
                        "from bikes where deleted_at is null")
    idents = prod_query(
        "select coalesce(json_agg(json_build_object('slug', t.slug, 'value', upper(replace(i.identifier_value, ' ', ''))))"
        ", '[]'::json) from bike_identifiers i join bike_identifier_types t on t.id = i.identifier_type_id "
        "where i.is_active and t.slug in ('battery_number', 'charger_number', 'fleet_number')")
    return orgs, set(frames), {(i["slug"], i["value"]) for i in idents}


# ---------------------------------------------------------------- matching

def key(s: str) -> str:
    s = s.lower().replace("tåstrup", "taastrup").replace("tårbæk", "taarbæk").replace("-", " ").replace(".", " ")
    s = re.sub(r"\b(kommune|a/s|aps|as|i/s)\b", " ", s)
    return " ".join(re.sub(r"[^a-z0-9æøå ]", " ", s).split())


def score(a: str, b: str) -> float:
    ka, kb = key(a), key(b)
    if not ka or not kb:
        return 0.0
    r = difflib.SequenceMatcher(None, ka, kb).ratio()
    wa, wb = set(ka.split()), set(kb.split())
    return max(r, len(wa & wb) / max(len(wa), len(wb)))


def top(target: str, cands, n=3):
    return sorted(((round(score(target, label), 2), cid, label) for cid, label in cands), reverse=True)[:n]


# ---------------------------------------------------------------- parsing

def parse_fleet(wb):
    bikes, skipped = [], []
    for ws in wb.worksheets:
        if ws.title in NOT_FLEET:
            continue
        rows = [tuple(r) for r in ws.iter_rows(values_only=True)]
        found = find_header(rows)
        if not found:
            skipped.append((ws.title, "no header with a frame-number column"))
            continue
        hi, cols = found
        if "_personal" in cols.values():
            skipped.append((ws.title, "personal data (private individuals) — not imported"))
            continue
        known = set(cols)
        for k in [c for c, f in cols.items() if f in SPLIT3]:
            known |= {k + 1, k + 2}
        frame_col = next(c for c, f in cols.items() if f == "frame")
        for ri in range(hi + 1, len(rows)):
            r = rows[ri] or ()
            get = lambda j: r[j] if j < len(r) else None  # noqa: E731
            digits = cell(get(frame_col + 1)).replace(" ", "")
            if not digits:
                continue
            rec = {"sheet": ws.title.strip(), "row": ri + 1, "issues": []}
            prefix, year = cell(get(frame_col)).upper(), cell(get(frame_col + 2)).upper()
            rec["frame"] = f"{prefix}{digits}{year}".upper().replace(" ", "")
            rec["frame_display"] = " ".join(x for x in (prefix, digits, year) if x)
            if not re.fullmatch(r"[A-Z]", year or "-"):
                rec["issues"].append("frame year letter missing or odd" if not year else f"frame suffix '{year}'")
            invoiced = []
            for j, f in cols.items():
                if f in ("frame",) or f.startswith("_"):
                    continue
                if f in SPLIT3:
                    rec[f] = joined([get(j), get(j + 1), get(j + 2)])
                elif f in ("delivered", "takeover"):
                    rec[f], ok = as_date(get(j))
                    if not ok:
                        rec["issues"].append(f"{f} date unreadable: {rec[f]}")
                elif f == "invoiced":
                    d, _ = as_date(get(j))
                    done = cell(get(j + 1)).upper() == "X"
                    if d:
                        invoiced.append(f"{d}{' X' if done else ''}")
                elif f == "text":
                    rec.setdefault("notes", [])
                    if cell(get(j)):
                        rec["notes"].append(cell(get(j)))
                else:
                    rec[f] = cell(get(j))
            # free text in columns nobody labelled (repair and battery history live there)
            extra = [cell(get(j)) for j in range(len(r)) if j not in known and j != 0 and cell(get(j))
                     and not re.fullmatch(r"X|\d{1,3}", cell(get(j)))]
            rec["notes"] = rec.get("notes", []) + [e for e in extra if len(e) > 3]
            rec["service_invoiced"] = invoiced
            a = cell(get(0))
            rec["recognition_code"] = a.upper() if RECOGNITION.match(a.upper()) else ""
            if a and not rec["recognition_code"]:
                rec["notes"].insert(0, f"col A: {a}")
            text = " ".join([a, rec.get("agreement", "")] + rec["notes"]).lower()
            rec["status"], rec["status_reason"] = "in_service", ""
            for pat, status, why in STATUS_WORDS:
                if re.search(pat, text):
                    rec["status"], rec["status_reason"] = status, why
                    break
            ag = rec.get("agreement", "").lower()
            rec["agreement"] = ("cancelled" if "opsagt" in ag else "yes" if ag.startswith("j")
                                else "no" if ag.startswith("n") else "unknown" if not ag else ag)
            bikes.append(rec)
    return bikes, skipped


def parse_schedule(wb):
    out = []
    for m in MONTHS:
        ws = wb[m]
        rows = [tuple(r) for r in ws.iter_rows(values_only=True)]
        hi = next((i for i, r in enumerate(rows[:6]) if r and any(norm(c).startswith("stelnummer") for c in r if c)), None)
        if hi is None:
            continue
        h = [norm(c) if c else "" for c in rows[hi]]
        col = lambda pred: next((i for i, x in enumerate(h) if pred(x)), None)  # noqa: E731
        fi, pi, ki = col(lambda x: x.startswith("stelnummer")), col(lambda x: x.startswith("pris")), col(lambda x: x == "kommune")
        ci, bi, ei = col(lambda x: x == "cykel nr"), col(lambda x: x.startswith("købt")), col(lambda x: x.startswith("ean"))
        years = [(i, x.split()[0]) for i, x in enumerate(h) if re.fullmatch(r"\d års", x)]
        for ri in range(hi + 1, len(rows)):
            r = rows[ri] or ()
            get = lambda j: r[j] if j is not None and j < len(r) else None  # noqa: E731
            digits = cell(get(fi + 1)).replace(" ", "")
            if not digits:
                continue
            yrs = []
            for i, n in years:
                d, _ = as_date(get(i))
                if d:
                    yrs.append(f"year {n}: {d}{' X' if cell(get(i + 1)).upper() == 'X' else ''}")
            out.append({
                "month": m, "row": ri + 1,
                "frame": f"{cell(get(fi))}{digits}{cell(get(fi + 2))}".upper().replace(" ", ""),
                "recognition_code": cell(get(ci)).upper(), "customer_text": cell(get(ki)),
                "bought": as_date(get(bi))[0], "ean": cell(get(ei)),
                "renewals": "; ".join(yrs), "yearly_price": cell(get(pi)),
            })
    return out


# ---------------------------------------------------------------- review

def review(src: Path, out: Path):
    import openpyxl
    print(f"reading {src.name} …", file=sys.stderr)
    wb = openpyxl.load_workbook(src, data_only=True)
    bikes, skipped = parse_fleet(wb)
    schedule = parse_schedule(wb)
    print("reading production (read-only) …", file=sys.stderr)
    orgs, prod_frames, prod_idents = load_production()
    org_cands = [(o["id"], o["legal_name"]) for o in orgs]
    by_id = {o["id"]: o for o in orgs}

    # customers: sheet -> org; (sheet, department) -> unit or org
    sheet_best = {s: top(s, org_cands, 3) for s in {b["sheet"] for b in bikes}}
    pairs = Counter((b["sheet"], b.get("department", "")) for b in bikes)
    cust_rows, pair_pick = [], {}
    for (sheet, dept), n in sorted(pairs.items()):
        sb = sheet_best[sheet]
        org = by_id.get(sb[0][1]) if sb else None
        dcands = [(("unit", u["id"]), f"{org['legal_name']} › {u['name']}") for u in (org["units"] if org else [])]
        dcands += [(("org", o["id"]), o["legal_name"]) for o in orgs]
        db = top(f"{sheet} {dept}", dcands, 3) if dept else []
        eans = sorted({b.get("ean", "") for b in bikes if b["sheet"] == sheet and b.get("department", "") == dept} - {""})
        strong_sheet = bool(sb) and sb[0][0] >= 0.9
        strong_dept = bool(db) and db[0][0] >= 0.85
        pair_pick[(sheet, dept)] = (sb[0] if sb else None, db[0] if db else None)
        cust_rows.append({
            "sheet": sheet, "department": dept, "bikes": n, "ean": " ".join(eans),
            "customer_1": f"{sb[0][2]} ({sb[0][0]})" if sb else "",
            "customer_2": f"{sb[1][2]} ({sb[1][0]})" if len(sb) > 1 else "",
            "department_1": f"{db[0][2]} ({db[0][0]})" if db else "",
            "department_2": f"{db[1][2]} ({db[1][0]})" if len(db) > 1 else "",
            "check": "ok" if strong_sheet and (not dept or strong_dept) else
                     "customer?" if not strong_sheet else "department?",
        })

    # duplicates and collisions
    by_frame = defaultdict(list)
    for b in bikes:
        by_frame[b["frame"]].append(b)
    dup_rows = []
    for f, group in by_frame.items():
        if len(group) > 1:
            for b in group:
                dup_rows.append({"frame": f, "sheet": b["sheet"], "row": b["row"],
                                 "recognition_code": b["recognition_code"], "department": b.get("department", ""),
                                 "delivered": b.get("delivered", ""), "status": b["status"]})
    ident_uses = defaultdict(list)
    for b in bikes:
        for slug, fld in (("battery_number", "battery"), ("charger_number", "charger")):
            v = b.get(fld, "")
            if re.search(r"\d{6,}", v):
                ident_uses[(slug, v)].append(b)
    conflict_rows = []
    model_codes = set()
    for (slug, v), group in ident_uses.items():
        frames = {b["frame"] for b in group}
        # Newer bikes carry the charger's MODEL code (FY2010001 on dozens of bikes)
        # where older ones carry a serial: a model code is kept in the source row
        # only, never imported as a unique charger number.
        if slug == "charger_number" and re.fullmatch(r"(AWC)?FY\d+Z?", v):
            model_codes.add(v)
            continue
        if len(frames) > 1:
            for b in group:
                conflict_rows.append({"identifier": slug, "value": v, "frame": b["frame"], "sheet": b["sheet"], "row": b["row"],
                                      "why": "same number on several bikes (the database allows it once)"})
        if (slug, v) in prod_idents:
            conflict_rows.append({"identifier": slug, "value": v, "frame": group[0]["frame"], "sheet": group[0]["sheet"],
                                  "row": group[0]["row"], "why": "already on a bike in production"})
    for b in bikes:
        if b["frame"] in prod_frames:
            conflict_rows.append({"identifier": "frame_number", "value": b["frame"], "frame": b["frame"], "sheet": b["sheet"],
                                  "row": b["row"], "why": "frame already in production"})

    # schedule <-> fleet
    sched_by_frame = defaultdict(list)
    for s in schedule:
        sched_by_frame[s["frame"]].append(s)
        s["in_fleet_sheets"] = "yes" if s["frame"] in by_frame else "no"

    out.mkdir(parents=True, exist_ok=True)
    bike_rows = []
    for b in bikes:
        pick_org, pick_dept = pair_pick[(b["sheet"], b.get("department", ""))]
        sch = sched_by_frame.get(b["frame"], [])
        bike_rows.append({
            "sheet": b["sheet"], "row": b["row"], "recognition_code": b["recognition_code"],
            "frame": b["frame"], "frame_as_written": b["frame_display"], "model": b.get("model", ""),
            "gender": b.get("gender", ""), "size": b.get("size", ""), "battery": b.get("battery", ""),
            "charger": b.get("charger", ""), "key_no": b.get("key_no", ""), "battery_key_no": b.get("battery_key_no", ""),
            "gps": b.get("gps", ""), "gps_phone": b.get("gps_phone", ""), "delivered": b.get("delivered", ""),
            "takeover": b.get("takeover", ""), "department": b.get("department", ""), "site": b.get("site", ""),
            "ean": b.get("ean", ""), "agreement_flag": b["agreement"],
            "in_renewal_schedule": "yes" if sch else "no",
            "yearly_price": " / ".join(s["yearly_price"] for s in sch),
            "renewals": " | ".join(s["renewals"] for s in sch if s["renewals"]),
            "service_invoiced": " | ".join(b["service_invoiced"]),
            "status": b["status"], "status_reason": b["status_reason"],
            "customer": pick_org[2] if pick_org else "", "department_match": pick_dept[2] if pick_dept else "",
            "notes": " · ".join(b["notes"]), "issues": " · ".join(b["issues"]),
            "listed_twice": "yes" if len(by_frame[b["frame"]]) > 1 else "",
        })

    def write(name, rows):
        with open(out / name, "w", newline="", encoding="utf-8-sig") as fh:  # BOM: Excel reads æøå
            if rows:
                w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()), delimiter=";")
                w.writeheader()
                w.writerows(rows)
        return len(rows)

    n_b = write("1-bikes.csv", bike_rows)
    n_c = write("2-customers-and-departments.csv", cust_rows)
    n_d = write("3-frames-listed-twice.csv", dup_rows)
    n_x = write("4-number-conflicts.csv", conflict_rows)
    n_s = write("5-renewal-schedule.csv", schedule)

    st = Counter(b["status"] for b in bikes)
    ag = Counter(b["agreement"] for b in bikes)
    chk = Counter(r["check"] for r in cust_rows)
    prices = Counter(s["yearly_price"] for s in schedule)
    summary = f"""# Fleet import — review ({dt.date.today().isoformat()})

Source: `{src.name}`. Nothing has been written to any database.

| | |
|---|---|
| Bike rows (customer sheets) | {n_b} — {len(by_frame)} distinct frames |
| Frames listed more than once | {len({r['frame'] for r in dup_rows})} (file 3) |
| Status from the register's words | in service {st['in_service']} · lost/stolen {st['lost_or_stolen']} · retired {st['retired']} |
| Agreement flag in the fleet sheets | yes {ag['yes']} · no {ag['no']} · unknown {ag['unknown']} · cancelled {ag['cancelled']} |
| Renewal schedule rows (monthly sheets) | {n_s} — {sum(1 for s in schedule if s['in_fleet_sheets'] == 'yes')} match a fleet-sheet bike |
| Yearly prices in the schedule | {', '.join(f'{p or "blank"} ×{c}' for p, c in prices.most_common(8))} |
| Customer / department pairs | {n_c} — ok {chk['ok']} · customer? {chk['customer?']} · department? {chk['department?']} (file 2) |
| Number conflicts | {n_x} rows (file 4) |
| Charger model codes (not serials; kept in the source row only) | {', '.join(sorted(model_codes)) or 'none'} |

## Skipped sheets
{chr(10).join(f'- **{s}** — {why}' for s, why in skipped) or '- none'}

## What to check
1. **File 2** — the customer (and department) each sheet's bikes go to. Anything not `ok` needs a
   decision: pick the right customer, or say it must be created (WOLT, Aleris and KL are not in
   the system).
2. **File 3** — frames listed twice: moved between customers, replaced, or a typo? Only one row
   per frame can be imported.
3. **File 4** — battery/charger numbers on more than one bike (the database takes each once).
4. **File 1, column `status`** — derived from words like *stjålet* / *udgået*; everything else is
   in service. Blank agreement flags are common; the renewal schedule (file 5) is what gets billed.
"""
    (out / "0-summary.md").write_text(summary, encoding="utf-8")
    print(summary)
    print(f"→ {out}", file=sys.stderr)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("review", help="parse the register and write review CSVs (no database writes)")
    r.add_argument("--src", type=Path, default=DEFAULT_SRC)
    r.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = ap.parse_args()
    if args.cmd == "review":
        review(args.src, args.out)


if __name__ == "__main__":
    main()
