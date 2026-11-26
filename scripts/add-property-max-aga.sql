-- Max Annual General Adjustment (AGA) percentage for the upcoming year, stored per property.
-- Nullable so properties without a configured cap remain unset.
-- Existing properties RLS (is_team_member(landlord_id)) covers the new column.

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS max_aga_percent numeric
  CHECK (
    max_aga_percent IS NULL
    OR (
      max_aga_percent >= 0
      AND max_aga_percent <= 100
      AND max_aga_percent <> 'NaN'::numeric
    )
  );
