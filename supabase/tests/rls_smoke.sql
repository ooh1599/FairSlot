-- Smoke test for migrations + RLS. Runs against a plain Postgres with Supabase-like stubs (see supabase/tests/run.sh).
\set ON_ERROR_STOP on
\pset tuples_only on

-- ---- helpers ----
create or replace function pg_temp.expect_fail(sql text, needle text) returns void language plpgsql as $$
begin
  begin
    execute sql;
  exception when others then
    if position(needle in sqlerrm) = 0 then
      raise exception 'expected error containing "%", got "%"', needle, sqlerrm;
    end if;
    return;
  end;
  raise exception 'expected failure but statement succeeded: %', sql;
end $$;

insert into auth.users (id) values ('aaaaaaaa-0000-0000-0000-000000000001'), ('bbbbbbbb-0000-0000-0000-000000000002');

-- ---- organizer A creates a draft event and imports 3 entries ----
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);

insert into public.events (public_id, organizer_id, title, draw_not_before, winner_count)
values ('fs_0123456789abcdefghjk', 'aaaaaaaa-0000-0000-0000-000000000001', 'Test', now() + interval '1 day', 1);

insert into public.entries (event_id, external_id, display_name, email)
select id, v.ext, v.name, v.mail from public.events,
  (values ('1', 'Somchai', 'a@example.com'), ('2', 'Mali', null), ('3', 'Mali', null)) as v(ext, name, mail)
where public_id = 'fs_0123456789abcdefghjk';

do $$ begin
  if (select count(*) from public.entries) <> 3 then raise exception 'A should see 3 entries'; end if;
  if (select count(*) from public.entries where public_entry_id !~ '^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$') > 0 then
    raise exception 'public entry ids must be well formed';
  end if;
  if (select count(*) from public.audit_log where action = 'entries_added') <> 1 then raise exception 'import must be audited once'; end if;
end $$;

-- duplicate external id is rejected, public id cannot be chosen, status cannot be forged
select pg_temp.expect_fail($$insert into public.entries (event_id, external_id, display_name) select id, '1', 'dup' from public.events$$, 'duplicate key');
select pg_temp.expect_fail($$insert into public.entries (event_id, external_id, display_name) select id, '8', 'tab' || chr(9) || 'bed' from public.events$$, 'entries_no_control_chars');
select pg_temp.expect_fail($$insert into public.entries (event_id, external_id, display_name, email) select id, '8', 'ok', 'not-an-email' from public.events$$, 'entries_email_format');
select pg_temp.expect_fail($$insert into public.entries (event_id, external_id, display_name, public_entry_id) select id, '9', 'x', 'AAAA-AAAA-AAAA' from public.events$$, 'permission denied');
select pg_temp.expect_fail($$update public.events set status = 'locked'$$, 'permission denied');
select pg_temp.expect_fail($$update public.events set manifest_hash = '0x1'$$, 'permission denied');

-- edits are audited
update public.entries set display_name = 'Somchai J.' where external_id = '1';
do $$ begin
  if (select count(*) from public.audit_log where action = 'entry_edited') <> 1 then raise exception 'edit must be audited'; end if;
  if (select detail::text from public.audit_log where action = 'entry_edited') like '%@%' then raise exception 'audit log must not hold emails'; end if;
end $$;

select set_config('t.eid', (select id::text from public.events limit 1), false) as _eid \gset
-- ---- organizer B sees nothing of A ----
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false);
do $$ begin
  if (select count(*) from public.events) <> 0 then raise exception 'B must not see A events'; end if;
  if (select count(*) from public.entries) <> 0 then raise exception 'B must not see A entries'; end if;
  if (select count(*) from public.audit_log) <> 0 then raise exception 'B must not see A audit log'; end if;
end $$;
select pg_temp.expect_fail($$insert into public.entries (event_id, external_id, display_name) values (current_setting('t.eid')::uuid, 'z', 'z')$$, 'row-level security');
select pg_temp.expect_fail($$insert into public.events (public_id, organizer_id, title, draw_not_before) values ('fs_zzzzzzzzzzzzzzzzzzzz', 'aaaaaaaa-0000-0000-0000-000000000001', 'x', now())$$, 'row-level security');

-- anonymous visitors cannot read tables, only public functions
reset role;
set role anon;
select pg_temp.expect_fail($$select * from public.entries$$, 'permission denied');
select pg_temp.expect_fail($$select * from public.events$$, 'permission denied');
do $$ begin
  if (select count(*) from public.public_event('fs_0123456789abcdefghjk')) <> 0 then raise exception 'draft events are not public'; end if;
end $$;

-- ---- server locks the event (service role bypasses RLS) ----
reset role;
update public.events set status = 'locked', manifest_hash = '0xabc', manifest_uri = 'https://x/m.json',
  chain_id = 5042, contract_address = '0x000000000000000000000000000000000000fa15',
  organizer_wallet = '0x00000000000000000000000000000000000abc01', locked_at = now()
where public_id = 'fs_0123456789abcdefghjk';

set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
select pg_temp.expect_fail($$insert into public.entries (event_id, external_id, display_name) select id, 'late', 'late' from public.events$$, 'locked');
select pg_temp.expect_fail($$delete from public.entries$$, 'locked');
select pg_temp.expect_fail($$update public.entries set display_name = 'x'$$, 'locked');
-- RLS hides locked events from update/delete: zero rows are touched
update public.events set title = 'changed';
delete from public.events;
do $$ begin
  if (select title from public.events) <> 'Test' then raise exception 'locked event title must not change'; end if;
end $$;

reset role;
-- even the server cannot rewrite committed content or the commitment
select pg_temp.expect_fail($$update public.events set title = 'changed'$$, 'cannot change');
select pg_temp.expect_fail($$update public.events set manifest_hash = '0xdef'$$, 'write-once');
select pg_temp.expect_fail($$update public.events set status = 'draft'$$, 'backwards');

-- public function now exposes the event, without any personal data columns
set role anon;
do $$ begin
  if (select count(*) from public.public_event('fs_0123456789abcdefghjk')) <> 1 then raise exception 'locked event must be public'; end if;
end $$;
select pg_temp.expect_fail($$select * from public.wallet_nonces$$, 'permission denied');

-- ---- follow-ups only after commit ----
reset role;
update public.events set status = 'committed', commit_tx_hash = '0xtx', onchain_event_id = '0xid', committed_at = now();
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
insert into public.winner_followups (event_id, entry_id, rank)
select e.event_id, e.id, 1 from public.entries e where e.external_id = '2';
select pg_temp.expect_fail($$insert into public.winner_followups (event_id, entry_id, rank) select e.event_id, e.id, 99 from public.entries e where e.external_id = '3'$$, 'rank is outside');
update public.winner_followups set status = 'delivered';
set role anon;
do $$ begin
  if (select status from public.public_delivery('fs_0123456789abcdefghjk')) <> 'delivered' then raise exception 'delivery status visible'; end if;
end $$;
select 'RLS smoke test passed' as result;
