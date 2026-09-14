# Deployment

## Routes

- `/` and `/admin` show the tournament director controls.
- `/results` shows the public read-only schedule, scores, winners, and pool standings.
- `/qr` shows a printable QR-code handout for the public results page.

## Vercel Environment Variables

Set these server-side environment variables in the deployment provider:

```text
TURSO_DATABASE_URL=libsql://vbtourney-revenant-73.aws-us-west-2.turso.io
TURSO_AUTH_TOKEN=<database token from Turso>
ADMIN_EMAIL=<scorekeeper email>
ADMIN_PASSWORD=<strong scorekeeper password>
ADMIN_SESSION_SECRET=<long random session signing secret>
```

`TURSO_AUTH_TOKEN`, `ADMIN_PASSWORD`, and `ADMIN_SESSION_SECRET` must not be committed to the repository.

## Storage Model

The hosted API stores one tournament snapshot row and one admin user row in Turso. `ADMIN_EMAIL` and `ADMIN_PASSWORD` seed or rotate the admin user on the next auth request.

```text
table: tournament_snapshots
id: century-varsity-2026
state_json: serialized TournamentState
updated_at: ISO timestamp
```

```text
table: admin_users
email: normalized admin email
password_hash: salted PBKDF2 password hash
password_salt: per-password salt
created_at: ISO timestamp
updated_at: ISO timestamp
last_login_at: ISO timestamp or null
```

The API creates both tables automatically on first request.
