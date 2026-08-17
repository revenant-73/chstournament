# Century Varsity Tournament Webapp — Codex Build Plan

## 1. Goal

Build a small, mobile-friendly webapp for managing the **Century 9-Team Varsity Volleyball Tournament**.

The app should:

- Manage nine teams and initial rankings.
- Generate three initial pools.
- Track match/set scores.
- Calculate pool standings automatically.
- Generate qualifier crossover matches.
- Automatically reseed teams #1–9.
- Generate the final championship bracket.
- Assign work teams.
- Show current/upcoming matches on all three courts.
- Work offline and retain tournament data after refresh.

This is **not intended to be a generic tournament-management platform.** Build specifically around this tournament format.

---

## 2. Recommended Stack

Use:

```text
React
TypeScript
Vite
CSS/Tailwind
localStorage or IndexedDB
PWA support
```

For V1, **do not build a backend or authentication system.**

The app should run entirely in the browser and remain usable if gym Wi-Fi disappears.

Structure the code so cloud synchronization could be added later.

---

## 3. Tournament Setup

The tournament contains exactly **9 teams**.

Default participating teams:

```text
Century
Caldera
Centennial
Lake Oswego
Lebanon
McNary
St. Helens
Sunset
Ida B. Wells
```

Each team needs:

```ts
Team {
  id
  name
  originalSeed
  conference
  pool
}
```

The tournament director should be able to:

- Rank teams 1–9.
- Enter/edit conference affiliation.
- Generate initial pools.
- Manually move teams between pools before beginning the tournament.
- Reset/restart the tournament.

Show a warning when teams from the **same conference appear in the same initial pool**.

Tournament staff reserve the right to alter pool assignments slightly to avoid same-conference matches.

---

## 4. Initial Pool Generation

Default snake-style seeding:

```text
POOL A
Seed 1
Seed 6
Seed 7

POOL B
Seed 2
Seed 5
Seed 8

POOL C
Seed 3
Seed 4
Seed 9
```

Manual adjustments must be possible before pool play is locked.

Once tournament play begins, preserve each team's **original tournament seed** even if its pool assignment changes.

---

## 5. Initial Pool Schedule

Three courts.

### Round 1 — 8:00 AM

```text
Court 1
A middle seed vs A low seed
A top seed works

Court 2
B middle seed vs B low seed
B top seed works

Court 3
C middle seed vs C low seed
C top seed works
```

Using default seeds:

```text
Court 1: Seed 6 vs Seed 7 — Seed 1 works
Court 2: Seed 5 vs Seed 8 — Seed 2 works
Court 3: Seed 4 vs Seed 9 — Seed 3 works
```

### Round 2 — 9:00 AM

```text
Court 1: Seed 1 vs Seed 7 — Seed 6 works
Court 2: Seed 2 vs Seed 8 — Seed 5 works
Court 3: Seed 3 vs Seed 9 — Seed 4 works
```

### Round 3 — 10:00 AM

```text
Court 1: Seed 1 vs Seed 6 — Seed 7 works
Court 2: Seed 2 vs Seed 5 — Seed 8 works
Court 3: Seed 3 vs Seed 4 — Seed 9 works
```

---

## 6. Match Scoring

Each match is:

```text
Best 2 of 3 sets
Set 1 → 25
Set 2 → 25
Set 3 → 15
```

The score-entry screen should allow:

```text
Team A   25  21  15
Team B   18  25  11
```

Automatically determine the match winner.

Do **not** require the user to separately select the winner.

Allow scores above 25 or 15 so extended sets can be entered.

---

## 7. Pool Standings

After scores are entered, automatically calculate:

```text
Matches Won
Matches Lost
Sets Won
Sets Lost
Points Scored
Points Allowed
Set Percentage
Point Percentage
```

Use:

```text
Set Percentage =
sets won / total sets played

Point Percentage =
points scored / total points played
```

Rank pool teams using:

```text
1. Match Record
2. Set Percentage
3. Point Percentage
4. Original Tournament Seed
```

Automatically identify:

```text
A1 A2 A3
B1 B2 B3
C1 C2 C3
```

where A1 means **first-place finisher in Pool A**, not original seed.

---

## 8. Round 4 — Qualifier Crossovers

At **11:00 AM**, automatically generate:

```text
Court 1
A2 vs B3
A1 works

Court 2
B2 vs C3
B1 works

Court 3
C2 vs A3
C1 works
```

The three initial pool winners automatically qualify for the championship group.

The three qualifier winners join them.

---

## 9. Reseeding

After Round 4, create three ranking groups.

### Seeds #1–3

The three initial pool winners.

Rank them using their **cumulative tournament performance**:

```text
Match Record
↓
Set Percentage
↓
Point Percentage
↓
Original Tournament Seed
```

### Seeds #4–6

The three qualifier winners.

Rank them by the same criteria using all matches played through Round 4.

### Seeds #7–9

The three qualifier losers.

Rank them using the same criteria.

The UI should clearly show why each team received its seed.

Example:

```text
#1 Century
2-0 | Sets 4-0 | Set % 1.000 | Point % .612
```

---

## 10. Final Matches

### Round 5 — 12:00 PM

```text
Court 1
#3 vs #6

Court 2
#4 vs #5

Court 3
#8 vs #9
```

Work teams:

```text
#1 → Court 1
#2 → Court 2
#7 → Court 3
```

### Round 6 — 1:00 PM

```text
Court 1
#1 vs Winner (#4/#5)

Court 2
#2 vs Winner (#3/#6)

Court 3
#7 vs Winner (#8/#9)
```

Assign the respective Round-5 losing teams as work teams.

### Round 7 — 2:00 PM

```text
Court 1
CHAMPIONSHIP
Semifinal Winner vs Semifinal Winner

Court 2
3RD PLACE
Semifinal Loser vs Semifinal Loser

Court 3
5TH PLACE
Loser #3/#6 vs Loser #4/#5
```

The lower-bracket results determine:

```text
7th — Winner of #7 vs winner #8/#9
8th — Loser of that match
9th — Loser of #8 vs #9
```

The app should calculate final placements automatically.

---

## 11. Main App Screens

Use five primary views.

### Dashboard

Large three-column court display:

```text
COURT 1
Now Playing
Next Match
Work Team

COURT 2
Now Playing
Next Match
Work Team

COURT 3
Now Playing
Next Match
Work Team
```

Also display current tournament round.

### Scores

Fast score-entry interface optimized for a phone/tablet.

### Pools

Show Pool A/B/C standings and completed matches.

### Bracket

Show qualification and final tournament path visually.

### Final Standings

Display:

```text
1st
2nd
3rd
4th
5th
6th
7th
8th
9th
```

---

## 12. Tournament State

Use a tournament state machine rather than manually activating screens:

```text
SETUP
↓
POOL_PLAY
↓
QUALIFIER
↓
FINAL_BRACKET
↓
COMPLETE
```

The app should not advance until all required scores from the current stage are entered.

Include a **Tournament Director Override** allowing results, seeds, or assignments to be corrected.

---

## 13. Persistence

Automatically save everything locally after every change:

```text
Team setup
Pool assignments
Scores
Standings
Current round
Bracket results
Final placements
```

Refreshing or closing the browser must **not lose the tournament**.

Include:

```text
Export Tournament JSON
Import Tournament JSON
Reset Tournament
```

The JSON export provides an easy emergency backup.

---

## 14. Visual Design

Use Century branding:

```text
Teal
Black
Silver
White
```

Design should feel like a **sports event management dashboard**, not a generic admin panel.

Prioritize:

- Large readable scores.
- Strong visual hierarchy.
- Large touch targets.
- Minimal typing.
- Responsive phone/tablet/laptop layout.
- Visibility in both bright and dark gym environments.
- Clear Court 1 / Court 2 / Court 3 identification.

Allow the Century logo to be placed in `/public/assets/`.

---

## 15. Important Automated Tests

Have Codex write tests specifically for tournament logic.

At minimum test:

```text
Correct initial pool generation
Correct three-team pool standings
Three-way pool ties
Set percentage calculations
Point percentage calculations
Original-seed tiebreaker
A1/A2/A3 identification
Correct qualifier generation
Correct #1–3 reseeding
Correct #4–6 reseeding
Correct #7–9 reseeding
Correct semifinal generation
Correct championship generation
Correct 3rd-place match
Correct 5th-place match
Correct 7th–9th placements
Persistence after reload
```

Tournament logic should live separately from UI components so it can be thoroughly unit tested.

---

## 16. Build Order for Codex

Implement incrementally:

```text
PHASE 1
Project structure + tournament data models

PHASE 2
Tournament setup + team seeding

PHASE 3
Initial pool generation

PHASE 4
Score entry + standings calculations

PHASE 5
Qualifier generation

PHASE 6
Automatic reseeding

PHASE 7
Final bracket logic

PHASE 8
Court dashboard

PHASE 9
Local persistence + backup

PHASE 10
Responsive Century visual design

PHASE 11
Automated tournament logic tests

PHASE 12
Full simulated tournament test
```

---

## 17. Primary Instruction for Codex

> **Do not attempt to build the entire application in one pass. Implement and test the tournament engine first. Treat tournament progression and seeding calculations as the source of truth, and build the UI around that engine.**

Start with **Phases 1–4**. Verify the tournament engine, scoring, and standings logic before implementing qualifier and bracket progression.
