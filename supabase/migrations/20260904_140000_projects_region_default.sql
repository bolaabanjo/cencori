-- Stop projects.region defaulting to a value its own check constraint rejects.
--
-- The column defaulted to 'auto' while projects_region_check accepts only the region identifiers
-- the console offers, so any insert that omitted region built a row the constraint then refused.
-- Nothing has ever been created that way: across the live table, no project holds 'auto'. The
-- console hid it because its form sends a region -- except that its default was also 'auto', so
-- creating a project without opening the dropdown failed for everyone.
--
-- 'europe' is the value most of the existing estate already carries, and is one of the general
-- groups that route to the nearest region rather than pinning one.
--
-- Existing rows are untouched: this changes what happens to the next insert that stays silent.

alter table public.projects alter column region set default 'europe';
