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
ADMIN_PIN=<private scorekeeper PIN>
```

`TURSO_AUTH_TOKEN` and `ADMIN_PIN` must not be committed to the repository.

## Storage Model

The hosted API stores one tournament snapshot row in Turso:

```text
table: tournament_snapshots
id: century-varsity-2026
state_json: serialized TournamentState
updated_at: ISO timestamp
```

The API creates the table automatically on first request.
