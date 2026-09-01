-- Narrow the handle to 5..15 characters.
--
-- The adopting migration took 3..30 from what the table already allowed. A handle is an identity
-- people type at each other, and that range is wider than one: three characters is a scramble for
-- the few good ones, thirty is not a handle.
--
-- Replaces the rule rather than adding a second, and stays NOT VALID for the same reason as before:
-- it governs every write from here on without judging handles taken while the old range applied.
-- Those are corrected when their owner next saves. Nothing is rewritten and nothing is refused at
-- migration time.

alter table public.user_profiles drop constraint if exists user_profiles_username_format;

alter table public.user_profiles
  add constraint user_profiles_username_format
  check (
    username is null
    or (
      length(username) between 5 and 15
      and username ~ '^[a-zA-Z0-9](?:[a-zA-Z0-9_-]*[a-zA-Z0-9])?$'
    )
  )
  not valid;
