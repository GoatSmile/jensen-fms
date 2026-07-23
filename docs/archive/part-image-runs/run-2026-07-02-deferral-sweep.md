# Part image fetch — DEFERRAL SWEEP (committed)

**Date:** 2026-07-02 · **Mode:** committed · **Engine:** Claude in-session
(web search + vision), no API keys
**Running total: 71 / 176 parts imaged** (65 after batches → +6 here).

Focused open-retailer pass over the branded parts that resolved during batches
1–7 but hadn't been fetched (source blocked / not yet pulled).

## ✅ Resolved & attached (6)
| SKU | Part | Conf. | Note |
|-----|------|------:|------|
| JP-EDHC60003RNDHSG | Shimano DH-C60003 dynamo hub, **silver** | 90 | fixes batch-3 color hold (had black) |
| JP-BR001 | Tektro brake lever w/ integrated bell | 85 | leoguar (e-bike cutoff variant) |
| 4117-0011 | Herrmans Slyde 38 chainguard, **matte black** | 82 | fixes batch-1 color hold (had silver) |
| JP-FL10 | Herrmans H-Black MR4 E front light | 80 | herrmans.eu |
| JP-CW G3320.1A | Bafang 38T chainring (M410) | 80 | e-bike-parts.com |
| JP-Kis | Ursus King kickstand | 60 ⚠️ | black shown, part silver — color cosmetic on a kickstand, flagged |

Two of these close **color-mismatch holds** from earlier batches with the
correct-variant image — the reason those were held in the first place.

## ⛔ Still held after the sweep (~17) — with reason
- **Shimano source blocked (403 everywhere tried):** JP-7gCADXR (Nexus-7 coaster
  hub), JP-7gDAAS (Nexus-7 disc hub), JP-DS7g (Nexus-7 twist shifter).
- **No clean branded image found:** JP-CA170 ("Gates EC03" crank — only generic
  square-taper arms), JP-SP4-34 (Gates SP4 spider), JP-SRC01DK (Selle Royal
  "County" — model not indexed), JP-D4 sølv (Büchel D4 rim), JP-QR (Ursus 31.8
  QR clamp — only generic look-alikes), JP-5104-0025 (black Slyde *bracket* —
  distinct from the guard; source blocked).
- **Source returned an error page:** JP-CK A01 170 (Bafang crank arms — CDN gave
  XML; retry another shop).
- **Low-value commodity / generic (deprioritised):** JP-PC1 (chain), JP-Ni42
  (stainless mudguards), JP-SH18 / JP-SH20 (Shimano single cogs), JP-ESRT54 /
  JP-TRT 4p (rotors), JP-VDE 42v (charger), JP-K32170 (silver crankset).

## Where we landed
**71 / 176 imaged (40%).** The remainder is genuinely hard: ~100 held/excluded
are custom Jensen/WOLT frames-forks-baskets (no catalog image exists), painting
services (`JP-lak*`, excluded by policy), and generic cables/spokes/fasteners;
the ~17 above are the only *branded-but-unfetched* leftovers, and most are either
Shimano-source-blocked or low-value.

**To push higher later:** a second source pass on the Shimano IGH hubs/shifter +
Bafang crank arms + Gates spider (different retailers / an image-search API key)
would add ~6–8 more, realistic ceiling ~80/176. Everything else is imageless by
nature.

## Reusable tool
`scripts/fetch_part_images.py` — manifest-driven, idempotent uploader (see
`docs/part-image-fetch-plan.md`).
