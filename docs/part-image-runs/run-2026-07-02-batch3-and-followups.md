# Part image fetch — BATCH 3 + follow-ups (committed)

**Date:** 2026-07-02 · **Mode:** committed · **Engine:** Claude in-session (web
search + vision), no API keys · **Policy:** trust 75 / floor 50, provisional→hero
flagged, generic hardware held.
**Running total after this session: 27 / 176 parts imaged.**

---

## Follow-ups from batches 1–2 (deferred + commodity)

**Deferred — resolved (2):**
| SKU | Part | Conf. |
|-----|------|------:|
| EMT4102JHFPRA100 | Shimano BR-MT410 hydraulic front disc brake | 85 |
| JP-AND-DSP-NTC | Ananda display (D23, representative) | 60 ⚠️ |

**Deferred — still blocked (2):** JP-7gCADXR (Nexus-7 coaster hub),
JP-7gDAAS (Nexus-7 disc hub) — every open retailer tried returned 403. Real,
locatable parts; need another source pass.

**Commodity representatives — attached (5):**
| SKU | Part | Conf. |
|-----|------|------:|
| JP-AL16 | North Road / moustache handlebar (polished) | 62 ⚠️ |
| JP-AL28 | Swept-back handlebar (polished) | 62 ⚠️ |
| JP-B12-r | Rear alu carrier w/ spring clip | 60 ⚠️ |
| JP-BJB-445 | Folding wire rear basket | 60 ⚠️ |
| JP-504KL | 36V rear-rack battery (kit shot) | 62 ⚠️ |

**Commodity — held (1):** JP-BH CWF1 (rack battery box/cradle) — no distinct
source; the rack-battery image would misrepresent it.

---

## Batch 3 (parts 41–70): 6 attached · ~24 held/deferred

This batch was **~50% Bafang wiring** (10+ motor/sensor/light/display extension
cables) plus controllers and small fasteners — nearly all generic → held.

**✅ Attached (6) — all inspected:**
| SKU | Part | Conf. | Source |
|-----|------|------:|--------|
| JP-CDX CT11555AA | Gates CDX CenterTrack 55T front sprocket | 85 | universalcycles |
| JP-Br13 | Herrmans BR-13 rear reflector | 85 | herrmans.eu |
| JP-brc6001f | Shimano BR-C6001 front roller brake | 85 | reused batch-2 image (same part) |
| JP-DP-C080 | Bafang DP C080 colour display | 82 | urbanbiker |
| JP-DP C080.C | Bafang DP C080 (700c variant) | 80 | reused C080 image |
| JP-DP-C15 | Bafang DP C15 LCD display | 82 | classic-cycle |

**⛔ Held/deferred (24):**
- **Color mismatch (hold):** JP-EDHC60003RNDHSG — Shimano DH-C6000 dynamo hub;
  found **black**, part is **silver** ("sølv"). Silver variant exists at
  performancebike (URL matches our exact SKU) — deferred, not failed.
- **Generic Bafang cables (10):** JP-EB 180, EB 1T1 q, EB 1T1 U, EB 1T1.FX,
  EB 40, EB D180, EB D40, EB D80, EB S1T1 013, EB S1T1 013r — extension/sensor/
  light/display wiring, no useful photo.
- **Controllers / small hardware / custom:** JP-CR A101.C, JP-CR S105.250.SN
  (controller boxes), JP-Br13s (reflector screw), JP-CBX-FD (SA cable-holder
  bolt), JP-CO40 (basket reflector cover), JP-EC100 (another rear carrier),
  JP-ES54 (160mm rotor — generic).
- **Deferrable branded (not fetched this pass):** JP-BR001 (Tektro brake lever
  w/ bell), JP-CA170 (Gates EC03 crank), JP-CK A01 170 (Bafang crank arms),
  JP-CW G3320.1A (Bafang 38T chainwheel), JP-D4 sølv (Büchel D4 rim),
  JP-DS7g (Shimano Nexus-7 twist shifter). Findable on a later pass.

---

## Session takeaways
- **27 / 176 imaged** across 3 batches (parts 1–70) + follow-ups.
- **Attach rate tracks the parts mix, not a findability ceiling:** batch 1 (finished
  goods) 60%; batches 2–3 (Shimano/Bafang hardware + cables + custom) far lower —
  most holds are cables, fasteners, and controllers with no meaningful photo.
- **Two consistent quality rules earned their keep:** color-variant mismatch
  (chainguard, dynamo hub → held) and diagram-vs-photo (Ryde rims → flagged).
- **The bottleneck is image-source access** (Shimano/Gates/Amazon 403), not
  whether the part exists online. A short allow-list of open retailers
  (herrmans.eu, ryde.nl, ananda-drive.com, bikable, treefortbikes, bikeparts,
  universalcycles, classic-cycle, urbanbiker, biria, templecycles) covers most.

## Reusable tool
`scripts/fetch_part_images.py` — hand it a JSON manifest of vetted images and it
uploads + registers hero attachments (idempotent via `--only-missing`,
`--dry-run` supported). See `docs/part-image-fetch-plan.md`.

## Next
- Source pass for the ~8 deferrable branded parts (2 Nexus-7 hubs, silver dynamo,
  Tektro lever, Gates crank, Bafang crank/chainwheel, Büchel rim, Nexus-7 shifter).
- Batch 4 = parts 71–100.
