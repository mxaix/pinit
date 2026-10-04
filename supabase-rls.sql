-- Current read-only public access baseline. For the complete change apply
-- migrations/20261004_hardening.sql (after the mood/reports prerequisite files).
BEGIN;
DO $$ DECLARE r record; c record; BEGIN
 FOR r IN SELECT * FROM pg_policies WHERE schemaname='public' AND tablename IN ('notes','submissions','reports') LOOP
  EXECUTE format('DROP POLICY %I ON public.%I',r.policyname,r.tablename);
 END LOOP;
 FOR r IN SELECT unnest(ARRAY['notes','submissions','reports']) AS name LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',r.name);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',r.name);
  FOR c IN SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=r.name LOOP
   EXECUTE format('REVOKE ALL (%I) ON public.%I FROM PUBLIC,anon,authenticated',c.column_name,r.name);
  END LOOP;
 END LOOP;
END $$;
CREATE POLICY notes_select_public ON public.notes FOR SELECT TO anon,authenticated USING(hidden=false);
GRANT SELECT(id,content,alias,color,country,country_code,mood,note_date,created_at,hidden) ON public.notes TO anon,authenticated;
COMMIT;
