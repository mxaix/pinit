# Deployment and rollback

This PR changes code and supplies SQL; it does not apply SQL, change production data,
rotate deployed secrets, merge main, or log in to production. Do not deploy the new
API against the old database policies. The public anon key is intentionally public;
the service-role key must only exist in Vercel server environment variables.

## Operator steps (required before production)

1. Back up the Supabase schema and data. Confirm `notes.id` is UUID,
   `notes.note_date` is date and `notes.created_at` is timestamptz. Inventory custom
   views, functions, policies and grants: a view or legacy SECURITY DEFINER RPC
   outside this repository can expose data or writes despite these table policies.
   Check dependencies on `notes.ip_hash`; a dependent view makes this migration
   abort rather than silently delete that view.
2. Create a separate Supabase staging database with representative sanitized data.
   If missing, apply the existing mood and reports prerequisite migrations FIRST.
   Apply `migrations/20261004_hardening.sql` ONCE. It is transactional, requires a
   database owner, and is intentionally not a repeatable bootstrap script.
   It preserves legacy note identifiers in `pinit_private.legacy_note_identifiers`,
   drops `notes.ip_hash`, revokes all public access to submissions/reports, removes
   all existing policies on these tables, and grants only explicit public note
   columns. Realtime for notes is removed; safe-column polling replaces it.
3. Verify the new API against staging. In a production maintenance window, apply
   the same migration, then deploy the new code. Old cached clients will fail to
   post after lockdown; they need a reload. This is preferable to keeping anonymous
   writes enabled during a mixed-version deployment.
4. Set server-only `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and two independent
   random secrets `LIMITER_SECRET` and `ADMIN_SESSION_SECRET` (at least 32 characters
   each). Generate them with a password manager or `crypto.randomBytes(32)` locally.
   Keep the limiter secret stable within a UTC day: changing it resets today's IP
   reservations. Rotating the session secret invalidates all sessions immediately.
5. Choose a fresh admin password unrelated to every historical password. Run
   `node scripts/hash-admin-password.js` interactively to generate the scrypt value,
   then set `ADMIN_PASSWORD_SCRYPT` in Vercel. Delete the old `ADMIN_PASSWORD` and
   `IP_HASH_SALT` variables. The new code never reads those old variables and will
   not accept old signed tokens, bearer tokens or the old cookie name. Historical
   passwords remain in public Git history: rotate any reused credentials elsewhere.
   Do not copy passwords into command arguments, source, chat or logs.
6. Set `APP_ORIGINS` to comma-separated exact HTTPS origins. Defaults cover both
   production domain names. Add an exact staging/preview origin only to that
   environment. Use separate staging secrets/database; avoid production secrets on
   untrusted preview branches. Cross-origin and missing-Origin writes are rejected.
7. Vercel uses `npm ci --ignore-scripts`, `npm run build`, and serves `dist`.
   APIs remain Vercel functions. Confirm Node 24 and test HTTPS Secure cookies,
   platform IP/country headers, response headers and CSP in a preview. IP/country
   are trusted only when Vercel sets `VERCEL=1`; local dev uses the socket IP and
   Unknown country. An upstream proxy changes the IP seen by Vercel; do not trust
   arbitrary external forwarding headers to work around that.
8. Run `migrations/verify_hardening.sql` as the owner. With the public anon key,
   check safe SELECT succeeds, SELECT `*`/`ip_hash` fails, hidden notes are excluded,
   submissions/reports are denied, INSERT/PATCH/DELETE are denied, and the two RPCs
   are denied. Use disposable staging records for POST, concurrent posting,
   moderation, report, admin hide/restore/delete, throttle and logout checks.
9. Schedule daily cleanup with Supabase pg_cron or an equivalent owner-operated
   job using `migrations/cleanup.sql`. Remove the preserved legacy note identifiers
   and old submissions hashes after the rollback window, subject to your retention
   needs. These are not used by the new code. Review existing rows violating the
   new checks before `VALIDATE CONSTRAINT`; NOT VALID preserves old rows but checks
   every new INSERT/UPDATE. An invalid legacy row may need operator-reviewed repair
   before Hide/Restore; Delete still works. Do not blindly rewrite historical text.
10. Check public database limits and enable a Vercel firewall/edge flood control
    appropriate to traffic. The database-backed per-IP/global login throttles and
    posting-attempt limiter fail closed; they are not volumetric DDoS protection.

## Behavior and residual limitations

- Daily posting is one reservation per server-observed IP and UTC date, not proof
  of one human. NAT users share a limit; VPN/network changes can obtain another.
  HMAC includes purpose and date, stays private, and is never stored in notes or
  returned to browsers. New report identifiers also change daily. Raw IP is no
  longer sent to the browser or external geolocation vendors.
- Note and reservation are one PostgreSQL transaction. Uniqueness handles races;
  validation/moderation run in the authoritative API and checks backstop the DB.
  A date mismatch across midnight fails and asks for retry rather than placing an
  old day's key in the next day's reservation. If the response is lost after commit,
  retry returns 409; this release does not provide an idempotent response recovery.
- Find my trace uses its returned public note ID in localStorage. Clearing storage
  loses that convenience, without bypassing server enforcement.
- Admin sessions are random, HMAC-indexed private server records, valid for one hour,
  revoked by logout. Login throttles all attempts (5/IP/15 min, 100 global/15 min);
  that global cap can itself temporarily deny admin login during an attack.
- CSP permits scripts only from self and rejects script attributes. Styles retain
  `unsafe-inline` for Leaflet positioning and dynamic note/animation styling. This
  is a deliberate style-only exception, with no unsafe-inline/eval script permission.
  Fonts, country map tiles and pinned globe image assets remain third-party requests.
  All executable dependencies are exact-version local bundles with a lockfile.
- Leaflet loads on demand; Three.js/globe initialization is delayed until idle.
  Globe image compression and crawlable About/Privacy/Rules pages
  remain follow-ups. The broken clouds texture request and dead WorldWind code are
  removed. Map/admin reads cap at 1000 rows, reports at 10000; full admin pagination
  and exact aggregate report counts beyond that cap remain future work.
- Shield is a local rule-based filter, not a guarantee of safe speech. Moderation
  failures fail closed. `/api/moderate` is retired (410); creation calls Shield
  internally. Reports are private and rate-limited; pre-existing report deduplication
  remains backed by its unique constraint.
- Local checks cover PostgreSQL/RLS via PGlite, mocked API/session behavior, hostile
  legacy rendering via jsdom, syntax and the production bundle. They do not prove
  deployed Supabase configuration, Vercel headers, real-browser CSP, WebGL appearance,
  or mobile/screen-reader behavior; complete the preview checks above before merge.

## Safe rollback

Keep the database lockdown in place. Do NOT rerun historical permissive policies,
restore public INSERT, or restore public identifiers to make an old frontend work.
If the new API fails, disable posting and keep public read-only access while fixing
forward. Old UI can display safe projected columns only; old SELECT `*`, fingerprint
lookup and posting will fail. Use a patched read-only build if rolling back code.

SQL is transactional: a migration failure leaves the prior state unchanged. After
a successful migration, a full restore requires the backup, but restoring old grants
reopens the vulnerabilities. Preserve new reservations/session records until the
incident is resolved; revoke all sessions if required. The legacy identifier backup
permits an owner to reconstruct data privately without exposing it. Do not restore
the legacy frontend/admin authentication or anonymous write authority publicly.
