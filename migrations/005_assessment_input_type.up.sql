-- Existing assessments require explicit classification by their section creator.
-- Preserve all scores, attendance entries and calculated results.
ALTER TABLE components ADD COLUMN input_type TEXT
    CHECK (input_type IN ('marks', 'attendance'));
