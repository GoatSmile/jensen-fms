-- 25_supplier_country_codes.sql
--
-- One-time data correction. All 18 suppliers were seeded with
-- country_code = 'DK' (the column default), so non-Danish vendors
-- (Eastek HK, the German GmbHs, etc.) wrongly showed as Denmark once
-- the supplier admin surfaced the country.
--
-- Values inferred from each supplier's legal-form suffix and brand —
-- NOT from an authoritative source. High-confidence ones are pinned by
-- legal form (GmbH/KG → DE, A/S → DK, S.p.A. → IT, B.V. → NL, HK,
-- "(China)" → CN). A few are brand-knowledge inferences worth a
-- second look: Herrmans → FI, RYDE → NL, SAPIM → BE, Shimano Nordic →
-- SE, Cycle Service Nordic → DK. All are now editable in
-- /admin/suppliers if any are wrong.

UPDATE suppliers SET country_code = CASE name
  WHEN 'Büchel GmbH KG'                       THEN 'DE'
  WHEN 'Cycle Service Nordic'                 THEN 'DK'
  WHEN 'E. Meyer GmbH'                        THEN 'DE'
  WHEN 'Eastek Handel GmbH'                   THEN 'DE'
  WHEN 'Eastek HK'                            THEN 'HK'
  WHEN 'Herrmans Bike Company Ltd'            THEN 'FI'
  WHEN 'MessingschKG'                         THEN 'DE'
  WHEN 'Metacoat A/S'                         THEN 'DK'
  WHEN 'PortaPower (China) Limited'           THEN 'CN'
  WHEN 'Ralf Bohle GmbH'                      THEN 'DE'
  WHEN 'RYDE'                                 THEN 'NL'
  WHEN 'SAPIM'                                THEN 'BE'
  WHEN 'Selle Royal Group'                    THEN 'IT'
  WHEN 'Shimano Nordic'                       THEN 'SE'
  WHEN 'SKS metalplast Scheffer-Klute GmbH'   THEN 'DE'
  WHEN 'Søndergaard Sønner A/S'               THEN 'DK'
  WHEN 'Sunrace Sturmey Archer Europe BV'     THEN 'NL'
  WHEN 'Ursus S.p.A.'                         THEN 'IT'
  ELSE country_code
END,
updated_at = now()
WHERE deleted_at IS NULL;
