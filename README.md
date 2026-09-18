# Trampolin

Trampolin is a scoring and judging app for trampoline competitions, run at the venue on the day of
the event. It replaces paper scoresheets and manual tallying with a shared, real-time system that
everyone at the competition - organizers, judges, and spectators - works from at once.

## What it does

A competition is organized into **groups** (e.g. age or skill categories), each with one or more
**rounds** (e.g. Qualifications, Final). Athletes ("sportsmen") are entered into a group and get an
**entry** per round, made up of one or more **attempts** - the individual routines they perform.

Each round is judged by a **panel**: a set of judges, each responsible for one aspect of the
routine - Execution, Difficulty, Time of Flight, Horizontal Displacement, or Head Judge
(penalties) - following the official FIG Code of Points. The app ships with ready-made panel
templates (a full FIG panel, a smaller local-competition panel, and a minimal test panel), so
organizers don't have to configure judge roles by hand for a standard event.

During competition, each judge scores attempts from their own device as they happen. A **head
judge** oversees the round: they see which judges have submitted their scores for the current
attempt, can resolve missing or disputed inputs, and control when the round advances to the next
attempt. Once enough scores are in for an attempt, the app combines them per the round's scoring
rules and updates the **leaderboard** immediately - no waiting for someone to add up sheets by
hand.

Rounds support two ways of ranking athletes: summing every attempt's score, or taking only the
best attempt (with tiebreakers such as the next-best attempt score). Which one applies is set per
round, so a club can run e.g. a summed qualification round followed by a best-attempt final.

Everyone who needs to follow along can: leaderboards are public to anyone logged in, and per-trick
detail is available for scores that need it, so athletes, coaches, and spectators can see exactly
how a score was built up, not just the final number.

## Who uses it

- **Admins** set up competitions, groups, and rounds; manage athletes and user accounts (including
  bulk import/export via Excel); assign and staff judge panels; and can step in anywhere.
- **Head judges** run a round day-of: staffing checks, attempt sequencing, and resolving scoring
  issues as they come up.
- **Referees** are the judges - they log in on their own device and submit scores for whichever
  role (Execution, Difficulty, etc.) they've been assigned on the panel.
- **Viewers** get read-only access to leaderboards for all active rounds - useful for a screen at
  the venue, or for coaches and athletes following along without needing judging permissions.

The interface is available in English and German, switchable at any time from the top of the page,
with the choice remembered across sessions.

## Stack

Express 5 + better-sqlite3 + EJS templates + express-session (sessions stored in SQLite).

## Getting started

```bash
npm install
npm run seed    # creates src/data/trampolin.db with sample data and users
npm start       # http://localhost:3000
```

Use `npm run dev` instead of `npm start` for auto-restart on file changes.

### Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `SESSION_SECRET` | `dev-secret-change-in-prod` | express-session signing secret - set a real value in production |
| `DB_PATH` | `src/data/trampolin.db` | SQLite database file |
| `ENABLE_TEST_SEED` | unset | when `"true"`, exposes a `/test/seed` endpoint that resets the DB with fixed test data (used by tests, never enable in production) |

## Roles

| Role | Access |
|---|---|
| `admin` | Full access: competitions, groups, rounds, sportsmen, users, judge panels |
| `head_judge` | Runs a round: assigns attempts, resolves scoring |
| `referee` | Scores attempts they're assigned to as a judge |
| `viewer` | Read-only: leaderboards for active rounds |

## Data hierarchy

```
competitions -> groups -> rounds -> entries -> attempts -> scores
sportsmen (competition_id, group_id) -> entries
users (referee_id) -> scores
```

## Testing

Four layers, each runnable independently:

```bash
npm test                                    # unit + API tests (vitest)
npx vitest run tests/unit/leaderboard.test.js   # a single test file

# component tests (Playwright, isolated UI fragments)
npx playwright test tests/component --config playwright.config.js

# integration tests (Playwright, full app)
# either against a local dev server:
ENABLE_TEST_SEED=true npm start
npx playwright test tests/integration --config playwright.integration.config.js

# or against a Docker build:
./scripts/run-integration-tests.sh --local --production-image trampolin-test:1
```

## Architecture

`src/routes` -> `src/controllers` -> `src/services` -> `src/services/db`. Routes wire up path + verb +
auth middleware; controllers handle request/response; services hold business logic; all DB access
goes through `services/db/*.crud.js`. Auth is enforced per-router (`requireAdmin`, `requireReferee`,
`requireAuth`), applied at the top of each route file.

Leaderboard scores are computed in `src/services/leaderboard.services.js`, driven by each round's
`scoring_mode`: `sum` totals every attempt, `best_attempt` takes the best one.
