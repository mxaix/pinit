-- Read-only owner verification. Every boolean must be true.
SELECT NOT has_table_privilege('anon','public.notes','INSERT') AS anon_no_note_insert,
 NOT has_table_privilege('authenticated','public.notes','INSERT') AS auth_no_note_insert,
 NOT has_table_privilege('anon','public.notes','SELECT') AS no_wildcard_note_read,
 has_column_privilege('anon','public.notes','content','SELECT') AS safe_content_read,
 NOT has_table_privilege('anon','public.submissions','SELECT,INSERT,UPDATE,DELETE') AS submissions_private,
 NOT has_table_privilege('anon','public.reports','SELECT,INSERT,UPDATE,DELETE') AS reports_private,
 NOT has_table_privilege('anon','public.admin_sessions','SELECT,INSERT,UPDATE,DELETE') AS sessions_private,
 NOT has_function_privilege('anon','public.create_daily_note(text,date,text,text,text,text,text,text)','EXECUTE') AS create_rpc_private,
 NOT has_function_privilege('anon','public.take_rate_limit(text,integer,integer)','EXECUTE') AS limiter_rpc_private;
SELECT schemaname,tablename,policyname,roles,cmd,qual,with_check FROM pg_policies
 WHERE schemaname='public' AND tablename IN ('notes','submissions','reports','admin_sessions');
SELECT conname,convalidated FROM pg_constraint WHERE conrelid='public.notes'::regclass;
