# Part image fetch — BATCH 2 (committed)

**Run:** parts 11–40 (30 parts) · **Date:** 2026-07-02 · **Mode:** committed
**Engine:** Claude in-session (web search + vision) · **No API keys**
**Policy (defaults):** trust 75 / floor 50 · provisional → hero, flagged ·
generic hardware → hold
**Running total after this batch: 14 / 176 parts imaged.**

## Result: 8 attached · 4 deferred · 18 held

This batch was much harder than batch 1: Shimano-heavy (internal-gear hubs,
brakes, shifters) plus many generic/custom parts. **Key process finding:**
Shimano's own site, Gates, Amazon, and several shops **block automated image
fetch (HTTP 403)**, so the no-key method has to route through *open* retailers
(treefortbikes, bikable, bikeparts, ryde, herrmans). When no open source turns
up on the first pass, the item is **deferred** (not failed) for a retry.

### ✅ Attached (8) — all images visually inspected
| SKU | Part | Conf. | Source |
|-----|------|------:|--------|
| JP-ASL3 | Shimano Nexus 3 Revoshift shifter | 90 | treefortbikes (SL-3S41E) |
| JP-B-CDX 120 | Gates Carbon Drive CDX belt 120T | 90 | bikeparts.com |
| EBRC6001FB | Shimano BR-C6001 roller brake | 88 | pushys (BR-C6001) |
| JP-ASG3dx | Shimano Nexus 3 coaster hub (kit) | 82 | treefortbikes (SG-3C41) |
| JP-AHBIM40PDC | Shimano HB-IM40 front roller-brake hub | 72 ⚠️ | bikable |
| JP-And20 | Ryde Andra 25 rim (406) | 65 ⚠️ | ryde.nl |
| JP-And24 | Ryde Andra 25 rim (507, "Kopi") | 65 ⚠️ | ryde.nl |
| JP-And700 | Ryde Andra 25 rim (622) | 65 ⚠️ | ryde.nl |

⚠️ flags: HB-IM40 = front hub, exact axle length not confirmed. Andra rims =
Ryde's canonical image is a **cross-section profile diagram, not a photo**;
same section used for all three diameters (visually identical).

### ⏸ Deferred (4) — findable, but image source blocked on first pass
| SKU | Part | Why |
|-----|------|-----|
| EMT4102JHFPRA100 | Shimano BR-MT410 hydraulic front disc brake | Shimano site 403; retry via an open retailer |
| JP-7gCADXR | Shimano Nexus 7 coaster hub | evelostore/modernbike 403; retry |
| JP-7gDAAS | Shimano Nexus 7 disc-brake hub | not fetched this pass; retry |
| JP-AND-DSP-NTC | Ananda 36V canbus display | not fetched this pass; retry |

### ⛔ Held (18) — generic/custom, low photo value
- **Custom (no findable image):** CJ700CST201-1 (stainless women's frame),
  JP-BasJen (custom Jensen front basket), JP-BK01 (WOLT fork, white),
  JP-AND-M100-CS (M100 cable set), JP-AND-M100-PWR (M100 power cable).
- **Parts bags / small hardware:** JP-ASM3, JP-ASM7R, JP-ASM7RF (Shimano
  small-parts sets), JP-AX-FD (SA adjuster screw), JP-AARD000039 (brake
  adapter), JP-AART000162 (180mm rotor).
- **Commodities — representative image available on request** (held under the
  generic-hardware default, but a stock photo would have some value):
  JP-AL16 (moustache handlebar), JP-AL28 (swept handlebar), JP-B12-r (rear alu
  carrier), JP-BJB-445 (rear basket), JP-504KL (36V battery), JP-BH CWF1
  (rack battery box).

## Takeaways
- **Branded + real model code still wins** — the Shimano/Gates/Ryde items with a
  recognisable model number all resolved and inspected cleanly.
- **The no-key method's real bottleneck is image-source access, not findability.**
  Deferred items are known and locatable; they just need an open image host on a
  retry pass. Worth keeping a short allow-list of reachable retailers.
- **Diagram-vs-photo** is a new flag (Ryde rims): correct part, but a schematic —
  fine as a stopgap, replace with a photo when convenient.
- ~27% attached this batch (vs 60% in batch 1) purely because of the parts mix
  (hardware/custom-heavy) + fetch blocks — not a findability ceiling.

## Next
- **Deferred retry:** re-fetch the 4 via open retailers (quick, high-value —
  they're real Shimano/Ananda parts).
- **Commodity pass:** if wanted, attach representative photos for the 6 commodity
  holds (handlebars/baskets/carrier/battery).
- **Continue:** batch 3 = next 30 (parts 41–70).
