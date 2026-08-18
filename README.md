# Century Varsity Tournament

Event-day scoring and public results app for the Century varsity volleyball tournament.

## Live URLs

- Admin: https://chstournament.vercel.app/
- Public results: https://chstournament.vercel.app/results
- GitHub: https://github.com/revenant-73/chstournament

## Event-Day Checklist

Before the tournament starts:

1. Open the admin URL on the scorekeeper device.
2. Enter the admin PIN.
3. Confirm the app says it is synced with Turso.
4. Open the public results URL on a phone.
5. Confirm the public page shows the correct pool-play schedule.
6. Export a JSON backup from the admin page.

During the tournament:

1. Enter scores from the Scores tab as matches finish.
2. Use the Dashboard tab to see the current and next match on each court.
3. Check the public results page after important updates.
4. Export another backup after pool play and after each bracket round.

After the tournament:

1. Confirm final standings on the public results page.
2. Export a final JSON backup.
3. Keep the backup with the tournament records.

## Admin Notes

- The public page is read-only and has no score-edit controls.
- Work team means the team helping officiate, not a team currently playing.
- For bracket matches, the work team is normally the team that lost on that same court in the previous match.
- If a match needs manual correction, use the director override controls in the admin bracket flow.
- The backup import/export controls save and restore the full tournament state.

## Local Development

```bash
npm install
npm run dev
```

Quality checks:

```bash
npm run lint
npm test -- --run
npm run build
npm audit
```

## Deployment

Vercel hosts the app and Turso stores the live tournament snapshot. See [DEPLOYMENT.md](DEPLOYMENT.md) for environment variables and storage details.
