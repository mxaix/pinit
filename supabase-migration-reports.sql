-- Phase 5B: Reports + hide/restore for notes
-- Run in Supabase SQL Editor BEFORE deploying Phase 5B
-- Safe for existing data: old notes get hidden = false automatically

-- 1. Hide flag on notes (old notes remain visible)
ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS hidden boolean NOT NULL DEFAULT false;

ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS hidden_at timestamptz;

-- 2. Reports table (server API only — no public client access)
CREATE TABLE IF NOT EXISTS public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id uuid NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
  reporter_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reports_note_reporter_unique UNIQUE (note_id, reporter_hash)
);

CREATE INDEX IF NOT EXISTS reports_note_id_idx ON public.reports (note_id);
CREATE INDEX IF NOT EXISTS reports_reporter_created_idx ON public.reports (reporter_hash, created_at DESC);

-- 3. Reports: RLS on, no public policies (only service role via Vercel API)
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- 4. Public may only READ notes that are not hidden
DROP POLICY IF EXISTS "notes_select_public" ON public.notes;

CREATE POLICY "notes_select_public"
ON public.notes
FOR SELECT
TO anon, authenticated
USING (COALESCE(hidden, false) = false);

-- INSERT policy unchanged — public can still create notes
-- No public UPDATE/DELETE on notes
