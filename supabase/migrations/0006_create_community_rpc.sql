-- 0006 — replace direct INSERT-into-communities with an RPC that handles
--        slug generation, invite code, and owner-membership atomically.
--
-- Why: the previous "create community" RLS policy keeps tripping for some
-- users. An RPC running as SECURITY DEFINER sidesteps RLS for the
-- community insert AND for the owner's community_members row, removing the
-- whole class of failure.
--
-- Idempotent.

create or replace function public.create_community(
  c_name        text,
  c_description text default null,
  c_visibility  text default 'private'
)
returns public.communities
language plpgsql
security definer
set search_path = public
as $$
declare
  uid           uuid := auth.uid();
  slug_base     text;
  slug_attempt  text;
  result_row    public.communities;
  attempts      int := 0;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  if c_visibility not in ('private', 'listed', 'public', 'open') then
    raise exception 'Invalid visibility: %', c_visibility;
  end if;

  if c_name is null or length(trim(c_name)) = 0 then
    raise exception 'Name is required';
  end if;

  -- Slugify
  slug_base := lower(regexp_replace(c_name, '[^a-zA-Z0-9]+', '-', 'g'));
  slug_base := regexp_replace(slug_base, '^-+|-+$', '', 'g');
  slug_base := left(slug_base, 64);
  if length(slug_base) < 3 then
    slug_base := 'c-' || floor(extract(epoch from now()))::text;
  end if;

  loop
    slug_attempt := case
      when attempts = 0 then slug_base
      else slug_base || '-' || substring(md5(random()::text) from 1 for 3)
    end;
    begin
      insert into public.communities (slug, name, description, visibility, invite_code, owner_id)
      values (
        slug_attempt,
        c_name,
        c_description,
        c_visibility,
        case when c_visibility in ('private', 'listed')
             then upper(substring(md5(random()::text) from 1 for 8))
             else null
        end,
        uid
      )
      returning * into result_row;
      return result_row;
    exception when unique_violation then
      attempts := attempts + 1;
      if attempts > 5 then raise; end if;
    end;
  end loop;
end;
$$;

grant execute on function public.create_community(text, text, text) to authenticated;
