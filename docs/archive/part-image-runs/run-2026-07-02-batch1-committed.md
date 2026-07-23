# Part image fetch — BATCH 1 (committed)

**Run:** first 10 parts · **Date:** 2026-07-02 · **Mode:** committed (images written)
**Engine:** Claude in-session (web search + vision) · **No API keys used**
**Policy (defaults):** trust 75 / floor 50 · provisional (50–74) → hero, flagged ·
generic hardware → hold

## Result: 6 attached, 4 held

Every attachable candidate was **downloaded and visually inspected** before
committing. Two verdicts flipped versus the search-only dry run — see "changed on
inspection" below. That's the whole point of the look-before-attach step.

### ✅ Attached (hero images written)
| SKU | Part | Conf. | Basis | Source |
|-----|------|------:|-------|--------|
| 11688010300381 | Ananda M100 motor | 92 | vision-verified | ananda-drive.com (M100, logo visible) |
| 3090-0006 | BR-7 rear reflector | 88 | vision-verified | herrmans.eu BR-7 |
| 5050-0008 | Double cable holder | 85 | vision-verified | herrmans.eu (exact match) |
| 4053-0005 | E-bike rear light 6-12V | 78 | vision-verified | herrmans.eu H-Trace |
| 1715-0001 | Rim tape 22-622 | 55 ⚠️ | vision-verified | herrmans.eu HPM (representative coil) |
| 1715-0008 | Rim tape 22-540 24" | 55 ⚠️ | vision-verified | herrmans.eu HPM (representative coil) |

⚠️ = attached but **flagged**: right product type, but exact size/colour not
confirmed (same representative Herrmans coil used for both rim-tape sizes).

### ⛔ Held (no image written)
| SKU | Part | Conf. | Why held |
|-----|------|------:|----------|
| 4117-0011 | Chainguard Slyde 38 matte black | ~48 | Found the Slyde 38 guard but in **silver/chrome** — part is **matte black**. Wrong variant; black exists (herrmans slyde-38 / hollandbikeshop 849012). |
| 5104-0025 | Chainguard bracket 38t | — | Candidate source (hollandbikeshop) blocked automated fetch (403) + guard-vs-bracket ambiguity. Retry with a reachable image. |
| 1BR-ST4 - RCM01 | 48T crankset | 45 | Below floor — supplier code didn't resolve to a branded page; only a generic crankset. |
| 5101-0025.1 | DIN 7981 screw 4.2x9.5 | 40 | Generic hardware (held by default) — a stock screw photo adds nothing. |

### Changed on inspection (vs the dry run's search-only guess)
- **Chainguard #7:** dry run guessed 75 → actually **held**. The canonical image is
  silver, our part is matte black. A search-rank score would have attached a
  wrong-colour hero; looking caught it.
- **Bracket #10:** dry run guessed 58 (attach-flag) → **held**, image unreachable
  this run.

## What this confirms about the procedure
- **Branded part + real article number = high confidence.** Herrmans/Ananda items
  with a `supplier_sku` resolved to canonical pages; the top 4 were dead-on.
- **Vision matters most on variant/ambiguity** (colour, guard-vs-bracket) — where
  a pure search score is confidently wrong.
- **Biggest quality lever remains supplier-number completeness** — the held
  crankset would likely resolve once its real brand code is entered, then a
  `--only-missing` re-run picks it up.

## Extrapolation to the full 176
On this sample: ~40% high (≥75), ~20% provisional (50–74), ~40% held — but the
held bucket is skewed by generic hardware + one colour miss, and shrinks as
supplier numbers get filled in. Expect the "attached" share to climb well past
60% once the catalogue's brand codes are complete.

## Next
- Re-run held items later with better sources / after supplier numbers land.
- Continue with batch 2 (next N parts) on request.
- To swap/replace any attached image: it's a normal `attachments` hero row in the
  `part-images` bucket — deletable/replaceable from the part page.
