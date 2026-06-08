#!/usr/bin/env python3
"""
Loads the STANDALONE organizations from Kunder.xlsx into Supabase via PostgREST
(service key, bypasses RLS). The umbrella parents+units were applied separately
via migration 27 (apply_migration). This finishes the import without shuttling
70KB of SQL through the agent. Reuses import_customers.py's grouping helpers so
"standalone" means exactly the same set as the SQL generator.

Idempotency: external_customer_no is UNIQUE per table, so a re-run conflicts
(409) rather than duplicating — safe to retry. Run from repo root.
"""
import json
import urllib.request
import urllib.error
import pandas as pd
import import_customers as ic

env = {}
for line in open(".env.local"):
    line = line.strip()
    if "=" in line and not line.startswith("#"):
        k, v = line.split("=", 1)
        env[k] = v.strip().strip('"')
URL = env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
KEY = env["SUPABASE_SECRET_KEY"]


def req(method, path, body=None, extra=None):
    h = {"apikey": KEY, "Authorization": f"Bearer {KEY}",
         "Content-Type": "application/json"}
    if extra:
        h.update(extra)
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(URL + path, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(r) as resp:
            return resp.status, resp.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def clean(v):
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    s = str(v).strip()
    return s if s and s.lower() != "nan" else None


def zipc(v):
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    try:
        return str(int(float(v)))
    except (ValueError, TypeError):
        return clean(v)


def cc(land):
    if land is None or (isinstance(land, float) and pd.isna(land)):
        return "DK"
    return ic.COUNTRY.get(str(land).strip().lower(), "DK")


def extno(v):
    try:
        return int(float(v))
    except (ValueError, TypeError):
        return None


# segment slug -> id
_, seg_json = req("GET", "/rest/v1/customer_segments?select=slug,id")
seg = {s["slug"]: s["id"] for s in json.loads(seg_json)}

# recompute the standalone set with the SAME logic as the SQL generator
df = pd.read_excel(ic.SRC, header=5).dropna(how="all")
df.columns = ["gruppe", "nr", "navn", "adr", "postnr", "by", "land",
              "tlf", "attn", "deres_ref", "email"]
df["navn"] = df["navn"].astype(str).str.strip()
df = df[df["navn"].str.lower() != "nan"]

buckets, standalone = {}, []
for _, r in df.iterrows():
    canon, _u = ic.canonical_umbrella(r["navn"])
    if canon is None:
        standalone.append(r)
    else:
        buckets.setdefault(canon, []).append(r)
for canon, rows in buckets.items():
    if len(rows) == 1:
        standalone.append(rows[0])

payload = []
for r in standalone:
    name = clean(r["navn"])
    payload.append({
        "legal_name": name, "display_name_da": name,
        "external_customer_no": extno(r["nr"]),
        "customer_segment_id": seg.get(ic.SEGMENT.get(r["gruppe"], "other")),
        "address_line1": clean(r["adr"]), "zip_code": zipc(r["postnr"]),
        "city": clean(r["by"]), "country_code": cc(r["land"]),
        "phone": clean(r["tlf"]), "email": clean(r["email"]),
    })

print(f"standalone rows to insert: {len(payload)}")
ok = 0
for i in range(0, len(payload), 200):
    chunk = payload[i:i + 200]
    st, resp = req("POST", "/rest/v1/organizations", chunk,
                   {"Prefer": "return=minimal"})
    print(f"  chunk {i}-{i+len(chunk)}: HTTP {st} {resp[:150]}")
    if st in (200, 201):
        ok += len(chunk)
print(f"inserted: {ok}/{len(payload)}")
