# HUB5 — Floor Progress Tracker

A Vercel-ready website and a separate Windows office service. The same PDF-derived plan is used on floors 1–14; each floor has independent photo locations. Admin can place markers, upload multiple photos, add photos and delete photos/locations. User has read-only access. No accounts database is required.

## Architecture

```
Browser ─── Vercel: UI, drawing and /api/config
   │
   └── HTTPS office endpoint ─── Node office service ─── shared folder
```

The Vercel deployment cannot read a mapped Windows drive. Uploads go directly from the browser to the authenticated office service, avoiding Vercel upload payload limits. The office PC and network folder must remain available. A stable HTTPS endpoint to that PC is required, supplied by your IT team (reverse proxy or managed tunnel). The folder itself must not be published as a web directory.

## Local preview (Node.js 22+)

Open PowerShell in this project directory:

```powershell
node scripts/setup-local.mjs
npm run office
```

In a second PowerShell window:

```powershell
npm run dev
```

Open http://localhost:3000. Usernames are `admin` and `user`; generated local passwords are in `.env`. Local preview stores files in `local-storage`, not on the network share. No runtime npm dependencies are required. Install development dependencies with `npm ci` only if you need to reconvert/render the DWG.

## Connect the shared folder

Edit `.env` on the office PC:

```dotenv
STORAGE_ROOT="Z:/Transfer/Gandhar AM/HUB5 FLOOR PROGESS TRACKER"
APP_ORIGIN=https://your-project.vercel.app
ADMIN_PASSWORD=your-own-strong-admin-password
USER_PASSWORD=your-own-strong-user-password
SESSION_SECRET=a-random-secret-at-least-32-characters-long
PORT=8787
HOST=127.0.0.1
```

The folder must already exist. For a background Windows service, prefer the **UNC path** behind Z: (for example `//your-file-server/share/Transfer/...`). Mapped drives belong to a Windows user session and may not exist in a scheduled task or Windows service. Use the actual network path from your IT team; do not guess it. Run the office service as a Windows account with read/write access to that folder.

Run **one** office-service instance per storage folder. Updates are serialized within this instance and metadata is replaced atomically. Do not manually edit `markers.json` while the service is running. Back up the folder regularly. Shared-folder users with Windows write permissions can still change files outside the application; app roles do not override Windows permissions.

Folder structure (created on the first upload):

```
HUB5 FLOOR PROGESS TRACKER/
  floor-01/
    markers.json
    <generated-photo-id>.jpg
  ...
  floor-14/
```

## Deploy to Vercel

1. Put this project in a Git repository and import it into Vercel. Set the root directory to this project folder (`hub5` if importing the parent directory).
2. Framework preset: **Other**. Build command: `npm run build`. Output directory: `public`. `vercel.json` includes these settings. Use Node.js 22 or newer.
3. Add `OFFICE_API_URL` in Vercel Environment Variables. Its value must be the stable **HTTPS** address forwarding to the office service, without a trailing slash, e.g. `https://hub5-api.your-company.example`.
4. Deploy. Set office `.env` `APP_ORIGIN` to the exact deployed website origin, without a trailing slash. Restart the office service. Only this origin is accepted by the API's browser CORS policy.
5. Keep the Node service and your HTTPS reverse proxy/tunnel running. Use a Windows scheduled task or your IT team's service manager with the project as working directory and `node --env-file=.env server/start.mjs` as the command. Keep the task under an account that can access storage. Do not expose port 8787 directly to the public internet.
6. Verify from another PC: admin upload, user view, floors 1 and 14, service restart, and offline error behavior.

Only the office service needs account passwords and `SESSION_SECRET`; never put these in public files or `OFFICE_API_URL`. `.env` is excluded from Git and the deployment ZIP. Production passwords should differ from local preview passwords. Changing the secret invalidates all sessions; sessions otherwise expire after 8 hours. Sign out clears the browser's tab session. Serve only the Vercel `public` directory and API function, never the full project folder.

The architectural drawing is shipped as a static asset and can be downloaded by someone who knows its URL; the photos and metadata require authentication. If the plan itself must be confidential, put Vercel deployment protection in front of the site or move the plan behind the office API before launch.

## Limits and behavior

- 1–10 JPG, PNG or WebP files per upload; 8 MB each, 12 MB total.
- Marker coordinates are stored as fractions of the plan, preserving alignment across screen sizes and zoom levels.
- Refresh retrieves the latest locations. This version does not push live updates to other users.
- No fake photos or pre-populated project markers are included.
- Do not replace/crop/rotate the plan after real markers are added without migrating their coordinates.
- Photos retain their uploaded content and metadata. File names on disk are generated IDs.
- A failed shared-folder connection returns a clear error; it never silently saves to a different folder.

## Drawing conversion and validation

The supplied PDF is stored in `source/floor-plan.pdf`. The app uses `public/floor-plan-pdf.svg`, a vector rendering of the single PDF page with text converted to paths to preserve fonts. The complete sheet is retained, including notes and title block. The earlier DWG remains archived in source but is no longer used by the app or build.

To regenerate the plan (Python with PyMuPDF):

```powershell
python -m pip install --target .tools/pdf pymupdf
npm run convert-plan
npm run build
```

`source/plan-preview.png` is a rendered preview. Existing photo coordinates are retained when replacing the plan; check their alignment on the new sheet before adding more photos.

```powershell
npm test
```
