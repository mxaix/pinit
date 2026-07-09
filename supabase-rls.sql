-- Pinit Supabase security policies
-- Run in Supabase SQL Editor (Dashboard -> SQL -> New query)

-- 1. Enable Row Level Security
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;

-- 2. Remove old permissive policies (safe to run even if they do not exist)
DROP POLICY IF EXISTS "Public can read notes" ON public.notes;
DROP POLICY IF EXISTS "Public can insert notes" ON public.notes;
DROP POLICY IF EXISTS "Public can update notes" ON public.notes;
DROP POLICY IF EXISTS "Public can delete notes" ON public.notes;
DROP POLICY IF EXISTS "Allow public read" ON public.notes;
DROP POLICY IF EXISTS "Allow public insert" ON public.notes;
DROP POLICY IF EXISTS "Allow public delete" ON public.notes;

DROP POLICY IF EXISTS "Public can read submissions" ON public.submissions;
DROP POLICY IF EXISTS "Public can insert submissions" ON public.submissions;
DROP POLICY IF EXISTS "Public can update submissions" ON public.submissions;
DROP POLICY IF EXISTS "Public can delete submissions" ON public.submissions;
DROP POLICY IF EXISTS "Allow public read" ON public.submissions;
DROP POLICY IF EXISTS "Allow public insert" ON public.submissions;

-- 3. NOTES: public users may read and create only
CREATE POLICY "notes_select_public"
ON public.notes
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "notes_insert_public"
ON public.notes
FOR INSERT
TO anon, authenticated
WITH CHECK (
  char_length(content) BETWEEN 1 AND 700
  AND char_length(alias) BETWEEN 1 AND 40
);

-- No UPDATE or DELETE policies for anon/authenticated.
-- Public clients cannot change or remove notes.

-- 4. SUBMISSIONS: public users may read and create only
CREATE POLICY "submissions_select_public"
ON public.submissions
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "submissions_insert_public"
ON public.submissions
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- No UPDATE or DELETE policies for anon/authenticated.

-- 5. One note per IP hash per day (recommended)
CREATE UNIQUE INDEX IF NOT EXISTS submissions_ip_hash_sub_date_unique
ON public.submissions (ip_hash, sub_date);

-- 6. Optional hardening: basic column checks on notes
ALTER TABLE public.notes
  DROP CONSTRAINT IF EXISTS notes_content_length_check,
  DROP CONSTRAINT IF EXISTS notes_alias_length_check;

ALTER TABLE public.notes
  ADD CONSTRAINT notes_content_length_check CHECK (char_length(content) <= 700),
  ADD CONSTRAINT notes_alias_length_check CHECK (char_length(alias) <= 40);

-- Admin delete/list uses SUPABASE_SERVICE_ROLE_KEY on Vercel and bypasses RLS.
