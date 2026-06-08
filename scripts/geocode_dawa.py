#!/usr/bin/env python3
"""
Bulk-geocode imported organizations + organization_units via DAWA
(Danmarks Adressers Web API, api.dataforsyningen.dk) — free, unlimited, and
accurate on Danish addresses. Writes latitude/longitude/geocoded_at back via
PostgREST (service key). Non-DK rows are skipped (Nominatim fallback later).

Strategy per row:
  1. adgangsadresser?q=<cleaned address>&postnr=<zip>  (fuzzy, best match)
  2. if no hit, retry q = last "<street> <number>" fragment
  3. if still no hit, fall back to the postnr's visual centre (town-level pin)
Re-runnable: only touches rows where latitude IS NULL.
"""
import json
import re
import time
import urllib.request
import urllib.parse
import urllib.error
from datetime import datetime, timezone

env = {}
for line in open(".env.local"):
    line = line.strip()
    if "=" in line and not line.startswith("#"):
        k, v = line.split("=", 1)
        env[k] = v.strip().strip('"')
URL = env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
KEY = env["SUPABASE_SECRET_KEY"]
DAWA = "https://api.dataforsyningen.dk"
NOW = datetime.now(timezone.utc).isoformat()


def pg(method, path, body=None, extra=None):
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


def dawa_get(path):
    try:
        with urllib.request.urlopen(DAWA + path, timeout=20) as resp:
            return json.loads(resp.read().decode())
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError):
        return None


_pcache = {}


def centroid(zip_code):
    if zip_code in _pcache:
        return _pcache[zip_code]
    d = dawa_get(f"/postnumre/{urllib.parse.quote(zip_code)}")
    out = None
    if isinstance(d, dict) and d.get("visueltcenter"):
        out = (d["visueltcenter"][1], d["visueltcenter"][0])  # (lat, lon)
    _pcache[zip_code] = out
    return out


def clean_addr(a):
    if not a:
        return ""
    a = a.replace('""', " ").replace('"', " ").replace(",", " ")
    return re.sub(r"\s+", " ", a).strip()


def street_guess(a):
    # last "<street words> <number><letter?>" fragment in the cleaned string
    matches = re.findall(r"[A-Za-zÆØÅæøå][\wÆØÅæøå.\-]*(?:\s+[\wÆØÅæøå.\-]+)*?\s+\d+[A-Za-z]?", a)
    return matches[-1].strip() if matches else a


def geocode(addr, zip_code):
    cleaned = clean_addr(addr)
    for q in [cleaned, street_guess(cleaned)]:
        if not q:
            continue
        qs = urllib.parse.urlencode({"q": q, "postnr": zip_code,
                                     "srid": "4326", "struktur": "mini", "per_side": "1"})
        d = dawa_get(f"/adgangsadresser?{qs}")
        if d:
            return (d[0]["y"], d[0]["x"]), "address"  # (lat, lon)
    c = centroid(zip_code)
    return (c, "centroid") if c else (None, "miss")


def run(table, addr_field):
    sel = f"select=id,{addr_field},zip_code,country_code"
    flt = "&latitude=is.null&zip_code=not.is.null&country_code=eq.DK"
    st, body = pg("GET", f"/rest/v1/{table}?{sel}{flt}&limit=2000")
    rows = json.loads(body)
    print(f"\n{table}: {len(rows)} rows to geocode")
    stats = {"address": 0, "centroid": 0, "miss": 0}
    for i, r in enumerate(rows):
        coords, how = geocode(r.get(addr_field), str(r["zip_code"]))
        stats[how] += 1
        if coords:
            pg("PATCH", f"/rest/v1/{table}?id=eq.{r['id']}",
               {"latitude": round(coords[0], 6), "longitude": round(coords[1], 6),
                "geocoded_at": NOW}, {"Prefer": "return=minimal"})
        if (i + 1) % 100 == 0:
            print(f"  {i+1}/{len(rows)}  {stats}")
        time.sleep(0.02)
    print(f"  done {table}: {stats}")
    return stats


if __name__ == "__main__":
    run("organizations", "address_line1")
    run("organization_units", "address")
