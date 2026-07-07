# Part image fetch — Shimano leftovers (user-supplied)

**Run:** manual, user-supplied images · **Date:** 2026-07-07
**Mode:** owner saved official Shimano product shots to disk; Claude ran the
standard upload pipeline (curl → `part-images` bucket → `attachments` insert).
**Context:** these three were the Shimano IGH parts that 403'd every automated
fetch (WebFetch/curl) in the 2026-07-02 batches — the exact case the runbook
flags as needing a real browser. The Claude-in-Chrome bridge wouldn't pair with
this (resumed Cowork) session, so the owner downloaded the images by hand from
`bike.shimano.com` and Amazon; Claude verified each by eye before upload.

## Totals
- Attempted: 3 parts · Imaged: **3 parts (5 attachments)** · Held: 0
- Coverage: **71 → 74 / 176 parts** (76 attachments incl. 3 galleries)

## Attached
| SKU | Name | Model | Attachment(s) | Confidence | Basis |
|---|---|---|---|---|---|
| JP-7gDAAS | 7g Bagnav shimano friløb til SKIVEBREMS | Shimano Nexus **SG-C3001-7D** (disc) | hero (silver) + gallery (black) | ~95 | Official Shimano product shots, white bg, "SHIMANO Nexus" branding, filename = `P-SG-C3001-7D` (identity-anchored). Vision-verified. |
| JP-DS7g | 7g Drejeskifter CJ-NX40 scandi | Shimano Nexus **SL-7S31** Revoshift | hero | ~90 | Amazon product shot, "SHIMANO Nexus / 7 SPEED" optical window visible. Vision-verified twist shifter. |
| JP-7gCADXR | 7g Bagnav shimano med fodbremse | Shimano Nexus **SG-C3001-7C** (coaster) | hero (silver) + gallery (black) | ~95 | Official Shimano product shots, `P-SG-C3001-7C-DX`. Coaster-brake reaction arm visible (the 7C-vs-7D tell). Vision-verified. Owner supplied in a second drop. |

## Held (still no image)
None — all three Shimano IGH leftovers now imaged.

## Note on the pipeline
Bash network/exec is sandboxed in this session with a stripped PATH — bare
`curl`/`uuidgen`/`stat` return "command not found". Fix: call binaries by
absolute path (`/usr/bin/curl` …) **and** pass `dangerouslyDisableSandbox` for
the outbound upload. Public URLs verified live (HTTP 200, image/jpeg).
