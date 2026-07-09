-- Phase 2: Optional mood on notes
-- Run in Supabase SQL Editor BEFORE deploying Phase 2 frontend
-- Safe to run multiple times (uses IF NOT EXISTS / IF EXISTS)

ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS mood text;

ALTER TABLE public.notes
  DROP CONSTRAINT IF EXISTS notes_mood_check;

ALTER TABLE public.notes
  ADD CONSTRAINT notes_mood_check CHECK (
    mood IS NULL OR mood IN (
      'hopeful',
      'tired',
      'lonely',
      'grateful',
      'angry',
      'peaceful',
      'lost'
    )
  );

-- Optional: index for today's mood aggregation
CREATE INDEX IF NOT EXISTS notes_note_date_mood_idx
  ON public.notes (note_date, mood)
  WHERE mood IS NOT NULL;
