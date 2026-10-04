-- Schedule as the database owner once daily. Not executed by this PR.
BEGIN;
DELETE FROM pinit_private.daily_notes WHERE note_date < (now() AT TIME ZONE 'UTC')::date - 2;
DELETE FROM pinit_private.rate_limits WHERE expires_at < now() - interval '1 day';
DELETE FROM public.admin_sessions WHERE expires_at < now();
COMMIT;
