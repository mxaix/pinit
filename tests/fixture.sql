CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
CREATE TABLE public.notes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), content text NOT NULL, alias text NOT NULL, color text NOT NULL DEFAULT '#fef08a',
 country text NOT NULL DEFAULT 'Unknown', country_code text, ip_hash text NOT NULL, note_date date DEFAULT CURRENT_DATE,
 created_at timestamp DEFAULT now(), lat double precision, lng double precision
);
CREATE TABLE public.submissions(id uuid DEFAULT gen_random_uuid(),ip_hash text,sub_date date);
CREATE TABLE public.reports(id uuid DEFAULT gen_random_uuid(),note_id uuid REFERENCES notes(id) ON DELETE CASCADE,reporter_hash text,created_at timestamptz DEFAULT now(),UNIQUE(note_id,reporter_hash));
GRANT ALL ON notes,submissions,reports TO anon,authenticated,service_role;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY legacy_allow_all ON notes FOR ALL TO anon USING(true) WITH CHECK(true);
INSERT INTO notes(content,alias,color,country,country_code,ip_hash,note_date) VALUES ('legacy unsafe note','Legacy','red" onclick="bad()','Unknown','','old-public-hash',current_date);
