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
templates (a full FIG panel, a smaller local-competition panel, and a minimal test panel, each with
a synchronised counterpart), so organizers don't have to configure judge roles by hand for a standard
event.

A competition is either **individual** or **synchro**, chosen when it is created. In a synchro
competition a competitor is a pair of athletes on two trampolines: pairs are managed (and imported
from / exported to Excel, one row per pair) like athletes, shown as "A / B" everywhere, and scored
with the synchronised rules of the Code of Points - execution judged per trampoline and averaged,
no time of flight, plus a synchronisation (S) mark. The type cannot be changed once a competition has
athletes or judges.

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

Once a competition is closed, an admin can download the **results list** as a PDF: a title page, one
section per group with a table per athlete covering all of their rounds, and a page with the judges.
The layout comes from a [Typst](https://typst.app) template, the built-in default or a custom one
(see [Results PDF](#results-pdf)). From the same page an admin can also generate **certificates**
of participation, one page per athlete (see [Certificates](#certificates)).

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

Express 5 + better-sqlite3 + EJS templates + express-session (sessions stored in SQLite). The results PDF is compiled by the [Typst](https://typst.app) CLI.

## Getting started

```bash
npm install
npm run seed    # creates src/data/trampolin.db with sample data and users (an individual and a synchro competition)
npm start       # http://localhost:3000
```

Use `npm run dev` instead of `npm start` for auto-restart on file changes.

The results PDF needs the `typst` CLI (v0.15.1). The Docker image and the devcontainer install it
through `scripts/install-typst.sh`; on another machine run that script (it installs to
`~/.local/bin` by default) or point `TYPST_BIN` at your own copy.

The Docker image runs as the unprivileged `node` user. A volume mounted on `/app/src/data` must be
writable by uid 1000.

### Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `SESSION_SECRET` | `dev-secret-change-in-prod` | express-session signing secret - set a real value in production |
| `DB_PATH` | `src/data/trampolin.db` | SQLite database file |
| `TYPST_BIN` | `typst` | path of the Typst CLI used for the results PDF |
| `ENABLE_TEST_SEED` | unset | when `"true"`, exposes a `/test/seed` endpoint that resets the DB with fixed test data, `{ "type": "synchro" }` as JSON body seeds a synchro competition instead, `{ "type": "scored" }` an individual one on the test panel with one attempt fully scored (used by tests, never enable in production) |

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
sportsmen (competition_id, group_id) -> entries    (a synchro pair is one sportsmen row)
users (referee_id) -> scores
```

## Testing

Four layers, each runnable independently:

```bash
npm test                                    # unit + API tests (vitest)
npx vitest run tests/unit/services/leaderboard.test.js   # a single test file

# component tests (Playwright, isolated UI fragments)
npx playwright test tests/component --config playwright.config.js

# integration tests (Playwright, full app)
# either against a local dev server:
ENABLE_TEST_SEED=true npm start
npx playwright test tests/integration --config playwright.integration.config.js

# or against a Docker build:
./scripts/run-integration-tests.sh --local --production-image trampolin-test:1
```

Test result list generation based on the provided template and sample data as follows:
```bash
D=$(mktemp -d) && \
cp src/templates/results/default.typ $D/main.typ && \
cp src/templates/results/sample-results.json $D/results.json && \
typst compile --root $D --ignore-system-fonts --font-path src/templates/fonts $D/main.typ sample-results.pdf && rm -rf "$D"
```

## Secret scanning

[gitleaks](https://github.com/gitleaks/gitleaks) scans for committed secrets. It runs as a pre-commit
hook (installed via `scripts/install-gitleaks.sh` in the devcontainer) and as a CI step. To run it
manually:

```bash
gitleaks detect --source . --no-git --redact -v
```

## Architecture

`src/routes` -> `src/controllers` -> `src/services` -> `src/services/db`. Routes wire up path + verb +
auth middleware; controllers handle request/response; services hold business logic; all DB access
goes through `services/db/*.crud.js`. Auth is enforced per-router (`requireAdmin`, `requireReferee`,
`requireAuth`), applied at the top of each route file.

Leaderboard scores are computed in `src/services/leaderboard.service.js`, driven by each round's
`scoring_mode`: `sum` totals every attempt, `best_attempt` takes the best one.

The results PDF reuses those scores: `src/services/results.service.js` turns the leaderboards of all
rounds into the `results.json` document and `src/services/pdf.service.js` compiles it with a template.

## Results PDF

An admin downloads the results of a **closed** competition from the competition's **Documents** page
(the **Documents** button on its row in the competitions list, further generated documents will be
listed there too). The results list is disabled there until the competition is closed. The PDF has a title page with a group overview,
one section per group and a page with the judges.

- Groups are listed alphabetically. Inside a group the athletes who reached the last round come first
  by their final placement, followed by the athletes eliminated earlier by their placement in the
  last round they took part in. Equal totals share a place (1, 1, 3). Athletes without a total get
  the place "–". Groups without athletes are left out.
- Every round is its own table. The attempts that count towards the round total are marked: all
  scored attempts in a `sum` round, only the best one (filled total) in a `best_attempt` round.
- Judges are labelled by role letter and number (E1, E2, D1, T1, H1, S1, P1) in the tables and are
  named on the judges page. The letters are the same in every language.
- The texts and the number format (`15,7` or `15.7`) follow the language of the admin who downloads.

### Custom templates

The results list card on the Documents page takes an optional `.typ` file. It is used for that one
download only and is never stored. **Preview template** renders the chosen file with sample data in a
new tab, so a template can be checked before the real download (it works for any competition).
**Default template** downloads the starting point described below, the sample data for local work is
`src/templates/results/sample-results.json` in the repository. If the template does not compile, the
Typst error with line and column is shown and nothing is downloaded.

A template is a [Typst](https://typst.app/docs) file that reads `results.json` and does no maths:

```typ
#let d = json("results.json")
= #d.competition.name
```

To develop one locally, work on copies of the two files in one folder (a template always reads the
data file `results.json`) and compile with the same flags the app uses:

```bash
D=$(mktemp -d)
cp src/templates/results/default.typ $D/main.typ
cp src/templates/results/sample-results.json $D/results.json
typst compile --root $D --ignore-system-fonts --font-path src/templates/fonts $D/main.typ out.pdf
```

`typst watch` takes the same arguments for live recompiling. The built-in font is Lato (SIL OFL,
shipped in `src/templates/fonts/`), use `#set text(font: "Lato")` to get it. System fonts are
ignored on purpose, so a PDF looks the same on every server.

Rules for uploaded templates, enforced by the app:

- a UTF-8 `.typ` file of at most 256 KB, without package imports (`@preview/...`, `@local/...`)
- compiled in an empty temporary directory that only holds `main.typ` and `results.json`, so a template
  cannot read other files, and it cannot load packages (the package location is a plain file, so
  nothing can be stored or used, whoever runs the app, and a proxy that refuses connections keeps
  the package download off the network)
- stopped after 10 seconds, with a memory limit of 1 GB and an output size limit of about 50 to 100 MB
  per compile, and at most 2 compiles run at once (others wait up to 30 seconds)

### Data contract (`results.json`, version 1)

Every score is already a string in the language of the document, templates must not calculate.
`null` means "nothing to show". The file `src/templates/results/sample-results.json` follows this
contract exactly (a unit test keeps it in sync with the builder), so it is the best reference.

```text
version          1
generatedAt      "02.10.2026 14:03" (de) or "2026-10-02 14:03"
labels           every fixed text in the language of the document: title, generated, groups, group,
                 place, round, rank, attempt, total, roundTotal, skills, landing, bonus, missingSkill,
                 skipped, pending, judges, bestAttemptCounts
competition      { name, date (as entered, or null), type: "individual" | "synchro" }
groups[]         { name, abbreviation, competitors[] }              groups without athletes are omitted
  competitors[]  { place (number or "–"), name, club, rounds[] }    in placement order, a synchro pair is "A / B"
    rounds[]     { name, scoringMode: "sum" | "best_attempt", total, rank (number or "–"), attempts[] }
      attempts[] { number, status: "scored" | "skipped" | "pending", elementCount,
                   rows[], summary[], final, counted }
judges[]         { label (role names, a shared assignment on one line), members[] { label, name } }
```

An attempt is shown in full only when its `status` is `scored`. For `skipped` and `pending` attempts
`rows` and `summary` are empty and `final` is `null`. `counted` tells whether the attempt counts towards
the round total (see above), but is never true for an attempt that is not `scored`, as there is no total
to mark. `elementCount` is the number of skills the attempt had.

`rows[]` has one row per judged element role of the panel, in panel order, so new panels work without
changes. The row comes in two kinds:

```text
kind "tricks"   { kind, roleKey, label, suffix, tricks[], landing, bonus, missingSkill, total }
                tricks[]: one combined value per skill (elementCount entries, null when missing),
                landing: the eleventh value of execution roles, bonus: the eleventh value of
                difficulty roles, missingSkill: the twelfth value (2.0 deduction)
kind "judges"   { kind, roleKey, label, suffix, judges[] { label, value, dropped }, total }
                one personal total per judge (local panel), dropped: true for the high and low
                values that do not count
```

- `label` is the role letter (E, D, S) and `suffix` tells rows with the same letter apart: `T1` and
  `T2` for the two execution rows of a synchro pair, otherwise `null`.
- Roles that judge the whole attempt (time of flight, horizontal displacement, the synchronisation
  device mark, head judge) have no row. They only appear in `summary`.
- `summary[]` is the last line of an attempt: `{ roleKey, label, value }` per role letter in panel
  order. Both trampolines of a synchro pair are one `E` entry and the head judge penalty is negative.
- `final` is the attempt total, `total` of a row is what that role contributes.

Roles and what ends up where, as defined by the panel (`src/db/seedDefaults.js`):

| Panel role | Row | Letter |
|---|---|---|
| execution (per trick, FIG) | `tricks` | E |
| execution (per judge, local) | `judges` | E |
| `execution_t1`, `execution_t2` (synchro) | `tricks`, suffix `T1` / `T2` | E |
| difficulty | `tricks` | D |
| `synchronisation_skill` (per skill) | `tricks` | S |
| time of flight, horizontal displacement, `synchronisation` (device), head judge | none, `summary` only | T, H, S, P |

## Certificates

The **Certificates** card on the Documents page makes one PDF per group with one certificate page per
athlete. **Download** next to a group downloads that group's PDF, **Download all (ZIP)** puts the PDF of
every ready group into one ZIP (`certificates-<competition>.zip`, PDFs named
`certificates-<competition>-<group>.pdf`).

- A group is **ready** when it has at least one round and all its rounds are completed, or when the
  competition is closed. A ready group without athletes cannot be downloaded and is left out of the ZIP.
- Everyone in the group gets a page, also athletes without a score (no place and no score on the page).
  A page shows the place (`1st place` or `1. Platz`), the total of the last round the athlete is entered
  in and the name of that round. An athlete without a total in that round gets no place and no score, even
  with a score in an earlier round, like in the results list, whose order and places are used.
- Synchro: every athlete of a pair gets a page. It names the athlete and the club first and the partner
  second, both pages show the same place and score.
- **Own design as a PDF.** Design the page in Word, Canva, Google Docs or any tool, type a marker such as
  `{{name}}` where the data belongs, export a PDF and choose it in the card. For every athlete the app
  prints the data centred on each marker, on the baseline of the marker, in the size of the marker text
  (shrunk when it would not fit the page). **Example template (PDF)** downloads a design with every
  marker to start from, **Preview** renders the chosen PDF with sample data in a new tab (enabled when a
  PDF is chosen). The PDF is used for that one download only and is never stored.
- Markers: `{{name}}`, `{{club}}`, `{{partner}}`, `{{partnerClub}}`, `{{partnerLine}}` ("together with ...",
  empty for single athletes), `{{place}}` (`1st place`, empty without a score), `{{score}}`, `{{round}}`,
  `{{group}}`, `{{competition}}`, `{{date}}`. `{{name}}` is required, an unknown marker is rejected and
  named in the error.
- Rules for the PDF (checked by the app): at most 5 MB, exactly one page that is not rotated, readable
  (no password), at most 100 markers, made as PDF 1.7 or older. The page size of the PDF is the page size
  of the certificate. The PDF is read in a separate thread with a memory limit and a 10 second timeout,
  and drawn with the same Typst sandbox as the other documents (see
  [Custom templates](#custom-templates)).
- Limits of the approach: the marker text of the design is covered with a white box, so put markers on
  plain areas (the covered marker text stays in the PDF's text layer, invisible but selectable). The printed text is always Lato in regular weight, the font of the design cannot be used.
  One design serves single athletes and pairs, so use `{{partnerLine}}` instead of fixed text such as
  "together with". Text around markers stays, a marker that is empty (no partner, no score) only prints
  nothing, so avoid fixed punctuation next to markers.

### Data contract (`certificates.json`, version 1)

Scores are strings in the language of the document. `null` means "nothing to show". The file
`src/templates/certificates/sample-certificates.json` follows this contract exactly (a unit test keeps
it in sync with the builder). Uploaded PDF designs do not read this file, the fixed template
`overlay.typ` does, together with the marker positions it finds in the PDF.

```text
version          1
generatedAt      "03.10.2026 09:05" (de) or "2026-10-03 09:05"
labels           title, participation, group, score, round, with, date
competition      { name, date (02.10.2026 in de, as entered otherwise, or null) }
group            { name, abbreviation }
certificates[]   { name, club, partner, place, placeText, score, round }
  partner        { name, club } or null                      synchro only, the other athlete of the pair
  place          number or null                              shared ties 1, 1, 3, null without a score
  placeText      "1st place" | "1. Platz" | null
  score, round   total and name of the last round the athlete has a score in, or null
```
