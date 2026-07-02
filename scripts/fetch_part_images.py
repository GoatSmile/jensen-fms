#!/usr/bin/env python3
"""
Commit part hero-images to Supabase from a local manifest.

This is the *write half* of the part-image procedure (see
docs/part-image-fetch-plan.md). The *find + judge* half is done live,
in-session, by Claude (web search + vision) — no API keys. Claude downloads and
visually verifies each candidate, then hands the vetted files to this script to
upload + register. Kept as a script so the write path is deterministic,
idempotent, and reproducible across sessions.

Storage + DB match src/app/parts/[id]/_actions/upload-image.ts:
  * bytes -> `part-images` bucket at <partId>/<uuid>.<ext>
  * row   -> `attachments` (entity_type='part', purpose='hero')
Row-first is NOT used here (the app's rollback concern doesn't apply to a
batch job); we upload-then-insert and report any failures per line.

Manifest (JSON list); identify the part by internal_sku OR part_id:
  [
    {"internal_sku": "JP-Br13", "file": "br13.png", "mime": "image/png",
     "confidence": 85, "note": "Herrmans BR-13, vision-verified"},
    ...
  ]

Usage:
  python3 scripts/fetch_part_images.py --manifest run.json --images ./imgs
  python3 scripts/fetch_part_images.py --manifest run.json --images ./imgs --dry-run
Options:
  --only-missing   skip parts that already have a live hero (default: on)
  --overwrite      insert anyway even if a hero exists
  --dry-run        resolve + validate, but no upload/DB write
Reads Supabase creds from .env.local (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY).
"""
import argparse, json, os, sys, uuid, urllib.request, urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load_env():
    env = {}
    with open(os.path.join(ROOT, ".env.local")) as fh:
        for line in fh:
            line = line.strip()
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                env[k] = v.strip().strip('"').strip("'")
    return env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/"), env["SUPABASE_SECRET_KEY"]


def req(url, key, method, path, data=None, headers=None):
    h = {"apikey": key, "Authorization": f"Bearer {key}"}
    if headers:
        h.update(headers)
    r = urllib.request.Request(url + path, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            return resp.status, resp.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def resolve_part_id(url, key, sku):
    q = f"/rest/v1/parts?select=id&internal_sku=eq.{urllib.parse.quote(sku)}&deleted_at=is.null"
    status, body = req(url, key, "GET", q, headers={"Accept": "application/json"})
    rows = json.loads(body) if status == 200 and body else []
    return rows[0]["id"] if rows else None


def has_hero(url, key, pid):
    q = (f"/rest/v1/attachments?select=id&entity_type=eq.part"
         f"&entity_id=eq.{pid}&purpose=eq.hero&deleted_at=is.null")
    status, body = req(url, key, "GET", q, headers={"Accept": "application/json"})
    return bool(json.loads(body)) if status == 200 and body else False


def main():
    import urllib.parse  # noqa: F401 (used in resolve_part_id via closure)
    ap = argparse.ArgumentParser()
    ap.add_argument("--manifest", required=True)
    ap.add_argument("--images", default=".")
    ap.add_argument("--only-missing", action="store_true", default=True)
    ap.add_argument("--overwrite", action="store_true", default=False)
    ap.add_argument("--dry-run", action="store_true", default=False)
    args = ap.parse_args()

    url, key = load_env()
    manifest = json.load(open(args.manifest))
    inserts, skipped = [], 0

    for row in manifest:
        sku = row.get("internal_sku")
        pid = row.get("part_id") or (resolve_part_id(url, key, sku) if sku else None)
        label = sku or pid
        if not pid:
            print(f"SKIP  {label:20} — part not found"); continue
        if args.only_missing and not args.overwrite and has_hero(url, key, pid):
            print(f"SKIP  {label:20} — already has hero"); skipped += 1; continue
        fpath = os.path.join(args.images, row["file"])
        if not os.path.exists(fpath):
            print(f"SKIP  {label:20} — file missing: {fpath}"); continue
        blob = open(fpath, "rb").read()
        ext = os.path.splitext(row["file"])[1].lstrip(".") or "bin"
        mime = row.get("mime", "image/jpeg")
        if args.dry_run:
            print(f"DRY   {label:20} -> {pid} ({len(blob)} bytes, {mime})"); continue
        obj = f"{pid}/{uuid.uuid4()}.{ext}"
        st, body = req(url, key, "POST", f"/storage/v1/object/part-images/{obj}",
                       data=blob, headers={"Content-Type": mime, "x-upsert": "false"})
        if st not in (200, 201):
            print(f"FAIL  {label:20} — upload HTTP {st} {body[:100]}"); continue
        pub = f"{url}/storage/v1/object/public/part-images/{obj}"
        inserts.append({"entity_type": "part", "entity_id": pid, "file_url": pub,
                        "file_name": f"auto-{(sku or pid)}.{ext}",
                        "file_size_bytes": len(blob), "mime_type": mime, "purpose": "hero"})
        print(f"OK    {label:20} uploaded ({len(blob)} bytes)")

    if inserts and not args.dry_run:
        st, body = req(url, key, "POST", "/rest/v1/attachments",
                       data=json.dumps(inserts).encode(),
                       headers={"Content-Type": "application/json", "Prefer": "return=minimal"})
        print(f"\nINSERT attachments x{len(inserts)} -> HTTP {st} {body[:200] if body else 'OK'}")
    print(f"\nDone. uploaded={len(inserts)} skipped={skipped} dry_run={args.dry_run}")


if __name__ == "__main__":
    import urllib.parse
    main()
