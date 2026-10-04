-- ONLY for a NEW, EMPTY staging Supabase project (pinit-staging).
-- Refuse existing Pinit databases, including production. Creates no note data.
BEGIN;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public'
   AND table_name IN ('notes','submissions','reports')) THEN
  RAISE EXCEPTION 'Refusing existing Pinit database: choose a new empty staging project';
 END IF;
END $$;
CREATE TABLE public.notes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 content text NOT NULL, alias text NOT NULL,
 color text NOT NULL DEFAULT '#fef08a', country text NOT NULL DEFAULT 'Unknown',
 country_code text, ip_hash text NOT NULL,
 created_at timestamp DEFAULT now(), lat double precision, lng double precision,
 note_date date DEFAULT CURRENT_DATE, mood text,
 hidden boolean NOT NULL DEFAULT false, hidden_at timestamptz
);
CREATE TABLE public.submissions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), ip_hash text NOT NULL,
 created_at timestamp DEFAULT now(), sub_date date DEFAULT CURRENT_DATE,
 UNIQUE(ip_hash,sub_date)
);
CREATE TABLE public.reports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 note_id uuid NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
 reporter_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(note_id,reporter_hash)
);
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notes,public.submissions,public.reports FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.notes,public.submissions,public.reports TO service_role;
COMMIT;
-- Next: run 20261004_hardening.sql, then verify_hardening.sql in THIS staging project.
