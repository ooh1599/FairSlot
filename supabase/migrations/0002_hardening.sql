-- Hardening found during the security review.

-- 1. Serialize entry changes against locking. Entry writes now take a shared lock on the event row, so the
--    server's "lock" update waits for in-flight entry transactions and the manifest always sees every entry.
create or replace function public.entries_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  ev uuid;
  st public.event_status;
begin
  ev := case when tg_op = 'DELETE' then old.event_id else new.event_id end;
  select status into st from public.events where id = ev for share;
  if st is distinct from 'draft' then
    raise exception 'the participant list is locked' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' then
    if new.event_id is distinct from old.event_id or new.public_entry_id is distinct from old.public_entry_id then
      raise exception 'event and public entry id are immutable' using errcode = 'P0001';
    end if;
    new.updated_at := now();
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

-- 2. Follow-up rows may only describe real positions of the same event.
create or replace function public.followups_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  picks int;
  entry_event uuid;
begin
  select winner_count + reserve_count into picks from public.events where id = new.event_id;
  if picks is null or new.rank < 1 or new.rank > picks then
    raise exception 'rank is outside the number of winners and reserves' using errcode = 'P0001';
  end if;
  select event_id into entry_event from public.entries where id = new.entry_id;
  if entry_event is distinct from new.event_id then
    raise exception 'entry belongs to another event' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and (new.rank is distinct from old.rank or new.entry_id is distinct from old.entry_id or new.event_id is distinct from old.event_id) then
    raise exception 'rank and entry are write-once' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger followups_guard_trg before insert or update on public.winner_followups
  for each row execute function public.followups_guard();

-- 3. Storage abuse limit: at most 500 events per organizer.
create or replace function public.events_cap() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.events where organizer_id = new.organizer_id) >= 500 then
    raise exception 'event limit reached' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger events_cap_trg before insert on public.events
  for each row execute function public.events_cap();

-- 4. Defense in depth for participant data typed in by hand (the CSV path validates the same rules in the app).
alter table public.entries
  add constraint entries_no_control_chars check (
    external_id !~ '[[:cntrl:]]' and display_name !~ '[[:cntrl:]]' and coalesce(email, '') !~ '[[:cntrl:]]'
  ),
  add constraint entries_email_format check (email is null or email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$');
