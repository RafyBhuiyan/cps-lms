# Deploying the CPS LMS

Two services: **Strapi + PostgreSQL on Railway**, **Next.js on Vercel**.

The order below is not arbitrary. Each side needs the other's URL, so the
sequence is: bring up the backend, get its URL, build the frontend against it,
then hand the frontend's URL back to the backend for CORS.

Repository: `https://github.com/RafyBhuiyan/cps-lms` — Railway builds `backend/`,
Vercel builds `frontend/`, both from `main`.

---

## What lives in the database, not in git

Worth knowing before you start, because it explains step 4.

Git carries the **content types** (`src/api/*/content-types/*/schema.json`). It
does not carry:

- the custom roles `instructor`, `content_manager`, `admin`
- the role permissions
- users
- courses, lessons, quizzes, blog posts
- your admin-panel login

All of that is table rows. A fresh Postgres has none of it, and the two helper
scripts both refuse to guess: `npm run permissions` prints
`! role "instructor" does not exist — skipped`, and `npm run seed` aborts with
`Missing role(s)`.

---

## 1. Postgres on Railway

1. [railway.app](https://railway.app) → **New Project** → **Deploy PostgreSQL**.
2. Rename it `Postgres` if it is not already — step 2 references it by name.

Leave it alone otherwise. Strapi creates its own tables on first boot.

## 2. The Strapi service

1. In the same project: **New** → **GitHub Repo** → `RafyBhuiyan/cps-lms`.
2. **Settings → Source → Root Directory**: `backend`.
   Without this, Railway builds the repo root, finds no `package.json`, and fails.
3. Build and start commands are detected from `backend/package.json`
   (`strapi build` / `strapi start`). Set them explicitly if the build log shows
   anything else.
4. **Variables** → paste this block via *Raw Editor*, then fill the secrets:

   ```
   DATABASE_CLIENT=postgres
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   DATABASE_SSL=false
   HOST=0.0.0.0
   IS_PROXIED=true
   APP_KEYS=
   API_TOKEN_SALT=
   ADMIN_JWT_SECRET=
   TRANSFER_TOKEN_SALT=
   JWT_SECRET=
   ENCRYPTION_KEY=
   ```

   Generate each secret locally and paste it in. Never commit these, and use
   different values than your local `.env`:

   ```bash
   openssl rand -base64 32
   ```

   `APP_KEYS` wants four of them, comma-separated, no quotes.

   Notes on the rest:
   - `${{Postgres.DATABASE_URL}}` is a Railway reference variable. It resolves to
     the **private** network address, which is why `DATABASE_SSL=false` is
     correct. Use `DATABASE_PUBLIC_URL` only for connecting from your laptop, and
     then SSL is required.
   - `DATABASE_URL` overrides `DATABASE_HOST`/`NAME`/`USERNAME`/`PASSWORD`,
     because `pg` parses the connection string last. Setting the individual
     variables too is harmless but pointless.
   - **Do not set `PORT`** — Railway injects it, and `config/server.ts` reads it.
   - **Do not set `NODE_ENV=production`** by hand. It makes `npm ci` skip
     `devDependencies`, and `strapi build` needs `typescript` from there. If the
     build ever fails with *cannot find module typescript*, add
     `NPM_CONFIG_PRODUCTION=false`.

5. **Settings → Networking → Generate Domain**. Copy the URL.
6. Add one more variable, then let it redeploy:

   ```
   PUBLIC_URL=https://<your-service>.up.railway.app
   ```

7. Watch the deploy log for `Strapi started successfully` and confirm
   `https://<your-service>.up.railway.app/api/courses` answers (an empty
   `data: []` is the correct answer at this point — `find` is public).

## 3. The production admin account

Open `https://<your-service>.up.railway.app/admin`. The first visit shows the
registration form; that account becomes the super admin. Use a real password —
this URL is public.

## 4. Roles, permissions and content

Pick one. **A** is recommended: it is version-matched to this exact Strapi build,
so it sidesteps the fact that the local `pg_dump` is 18.x while Railway's Postgres
is 17.

### A. Transfer from your machine

Carries content, relations, users, roles and permissions. It does **not** carry
admin-panel accounts, which is why step 3 came first.

1. Production admin panel → **Settings → Transfer Tokens → Create new token**,
   type *Full access*. Copy it — it is shown once.
2. Locally, with Strapi **stopped**:

   ```bash
   cd backend && npm run strapi -- transfer --to https://<your-service>.up.railway.app/admin --to-token <token>
   ```

   Note the `--` before `transfer`; npm needs it to pass the flags through. The
   `/admin` suffix is part of the destination URL. Say yes to the prompt: the
   destination is erased and replaced, which is what you want on a fresh instance.

3. Confirm, then re-run the permissions script against production to catch
   anything the transfer left out. It is additive — it never revokes:

   ```bash
   cd backend && DATABASE_CLIENT=postgres DATABASE_URL='<DATABASE_PUBLIC_URL>' DATABASE_SSL=true DATABASE_SSL_REJECT_UNAUTHORIZED=false npm run permissions
   ```

4. Then the same line with `npm run backfill:enrollments`. Enrolments created
   before `current_status` existed have no status, and a student part-way through a
   course should not be dropped back into a queue — this sets those rows to
   `approved` and touches nothing else. Idempotent, so re-running is a no-op.

   Skipping it is not a lockout — `isEnrolled` reads a null status as approved for
   exactly this reason — but the roster shows those students correctly only once it
   has run.

### B. Fresh start

Nothing you authored in the dashboard comes across; you get the demo data instead.

1. Production admin panel → **Settings → Users & Permissions → Roles** →
   create three roles. The **type** slug has to match exactly, because
   `scripts/permissions.js` and `scripts/seed.js` look them up by type:
   `instructor`, `content_manager`, `admin`. Students use the built-in
   `authenticated` role.
2. From your laptop, against the production DB (same env prefix as A.3):

   ```bash
   cd backend && DATABASE_CLIENT=postgres DATABASE_URL='<DATABASE_PUBLIC_URL>' DATABASE_SSL=true DATABASE_SSL_REJECT_UNAUTHORIZED=false npm run permissions
   ```

   Then the same line with `npm run seed`, and optionally `npm run seed:courses`
   for three more courses (C++, Java, DSA) with lessons, a gated lesson quiz, a
   final quiz and a practice quiz each. That one adds catalog content only — no
   users, enrolments or progress — and is safe to re-run.

3. Finally the same line with `npm run backfill:enrollments`. `seed.js` writes no
   status on the enrolment it creates, so this has one row to fix; on a
   transferred database it has however many predate the field. Idempotent either
   way, so the one command sequence works whichever branch you took.

Either way: the demo accounts (`student`, `instructor`, `cm`, `admin`
`@demo.test`) share one password that is committed in `scripts/seed.js`. On a
public URL, change them in the admin panel once the demo is over.

## 5. The frontend on Vercel

1. [vercel.com](https://vercel.com) → **Add New → Project** → import
   `RafyBhuiyan/cps-lms`.
2. **Root Directory**: `frontend`. Framework preset should read *Next.js*.
3. **Environment Variables**, before the first build:

   ```
   NEXT_PUBLIC_STRAPI_URL=https://<your-service>.up.railway.app
   ```

   No trailing slash. This matters more than it looks: `NEXT_PUBLIC_*` values are
   inlined into the browser bundle **at build time**, and `lib/strapi.ts:10`
   falls back to `http://localhost:1337` when the variable is missing. A build
   without it produces a site that looks fine and whose every request fails in
   the visitor's browser. Changing the value later requires a redeploy, not just
   a save.

4. **Settings → Node.js Version**: 22.x.
5. Deploy, then copy the production URL.

## 6. Close the CORS loop

Back on Railway, add:

```
FRONTEND_URL=https://<your-project>.vercel.app
```

Comma-separated if you want preview deployments to work too — `config/middlewares.ts`
splits on commas. Redeploy the Strapi service.

**No trailing slash.** A browser's `Origin` header never carries one, so
`https://cps-lms-nine.vercel.app/` matches nothing and every request fails CORS
while the variable looks correctly set. `config/middlewares.ts` now strips
trailing slashes defensively, but the value is clearer without one.

Until this is set, the API only allows `http://localhost:3000` and the deployed
frontend gets CORS errors on every request. To check it from the terminal without
a browser, ask for the header directly — an allowed origin is echoed back:

```bash
curl -sD - -o /dev/null -H 'Origin: https://<your-project>.vercel.app' https://<your-service>.up.railway.app/api/courses | grep -i access-control-allow-origin
```

## 7. Verify

The API suite takes an `API` override, so it can be pointed at production. It
needs the demo users to exist (step 4):

```bash
cd backend && API=https://<your-service>.up.railway.app npm run verify
```

Then click through the deployed frontend: sign in as each of the four roles,
enrol in a course, complete a lesson, submit the final quiz.

If logins start returning 429, that is the users-permissions rate limiter —
roughly five attempts per identifier per five minutes. Wait it out.

---

## Known limits of this setup

- **Uploads are ephemeral.** Railway's container filesystem is rebuilt on every
  deploy, and no volume is attached. Nothing uploads today (courses use a
  `coverUrl` string, and the media library is empty), so this costs nothing — but
  the moment someone uploads through the admin panel, that file disappears at the
  next deploy. Attach a Railway volume at `/app/public/uploads`, or move to an S3
  upload provider, before relying on the media library.
- **JWTs last 30 days** and are not revocable. `config/plugins.ts` explains why:
  the refresh-token flow sets a `sameSite: lax` cookie that a cross-site
  Vercel → Railway request never sends.
- **The frontend is entirely client-rendered.** All 14 pages are `'use client'`,
  so Vercel serves static shells and every fetch happens in the browser with the
  user's own JWT. There is no server-side secret on the Vercel side at all.
