# HUB5 Floor Progress Tracker

Next.js App Router app deployed to Vercel. The 14-floor plan, 230%-based default view, 1600% zoom, admin uploads and read-only viewer access are retained. Photos live in a private Supabase Storage bucket; marker coordinates and photo metadata live in Supabase Postgres. The app calls its own `/api` routes. No office service, mapped drive or ngrok tunnel is needed after migration.

## Configuration

Set the server-only values from `.env.example` in Vercel and `.env.local` for local Next.js development. Never prefix server credentials or passwords with `NEXT_PUBLIC_`. The Supabase integration can supply `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SECRET_KEY`) and `POSTGRES_URL`. Use a pooled Postgres connection for Vercel. Keep the existing `ADMIN_PASSWORD`, `USER_PASSWORD` and `SESSION_SECRET` to preserve sign-in accounts.

## First-time setup and migration

Place the real Supabase connection values in the ignored `.env.cloud.local` file. The legacy `.env` supplies the existing account settings and `STORAGE_ROOT`.

```powershell
npm ci
npm run cloud:setup
npm run cloud:migrate
```

Setup applies `supabase/schema.sql` and creates a private `hub5-photos` bucket. Tables have row-level security enabled and no anonymous/authenticated client access. Only the server connects to the database. Migration preserves floor numbers, marker IDs, coordinates, filenames and timestamps; verifies photo checksums; and never deletes original files. Already-migrated markers are skipped on retry. Stop legacy uploads while copying to avoid missing concurrent changes.

For local development, put the Supabase values in `.env.local` (Next.js does not read `.env.cloud.local` automatically), then run:

```powershell
npm run dev
```

For production:

```powershell
npm test
npm run build
npm start
```

Vercel framework: Next.js. Build command: `npm run build`. Output: `.next`. `OFFICE_API_URL` and `APP_ORIGIN` are no longer used by the cloud app.

## Uploads and access

Only the admin can request upload URLs or change markers. Photos upload directly to Supabase using temporary signed URLs, avoiding the Vercel request body size limit. The server checks uploaded file size and image signature before committing metadata. A database transaction prevents duplicate finalization and serializes concurrent edits. Viewers get short-lived signed photo URLs, and can click a photo to open its full-size image. Signed links remain usable until they expire (five minutes).

Limits: 1?10 JPG/PNG/WebP photos, 8 MB each, 12 MB per batch. Failed or abandoned uploads can leave private unreferenced objects; `npm run cloud:cleanup` removes expired batches after their two-hour upload URLs have expired. Run it periodically with the cloud environment configured. Database login throttling is shared across function instances.

## Drawing

`source/floor-plan.pdf` is rendered to `public/floor-plan-pdf.svg`. Rebuild with `npm run convert-plan` (requires PyMuPDF). The old DWG and office backend remain as migration/recovery references and are not used by the Next.js deployment.
