# Contributing

## Setup

```bash
npm install
npm run seed
npm start
```

A pre-commit hook runs `eslint src/ tests/` - fix lint errors before committing, don't bypass with
`--no-verify`.

## Architecture

Follow the existing layering: `routes` -> `controllers` -> `services` -> `services/db`. Routes only
wire up path + verb + auth middleware; controllers handle request/response; services hold business
logic; all DB access goes through `services/db/*.crud.js`. Before adding a new service function,
check whether the logic already exists elsewhere. See the README for auth roles and the data
hierarchy.

## Tests

Every change should be covered at the right layer:

| Layer | What it asserts | Location |
|---|---|---|
| Unit | Service/business logic in isolation | `tests/unit/` |
| API | Endpoint behavior - status codes, redirects, flash messages, DB state | `tests/api/` |
| Component | Rendered UI - page structure, form options, visible text | `tests/component/` |
| Integration | Full user flows across pages, in a real browser | `tests/integration/` |

Don't mix concerns: if a change touches both a route and a view, the route's behavior goes in an
API test and the view's rendering goes in a component test.

Run before opening a PR:

```bash
npm test
npx playwright test tests/component --config playwright.config.js
```

Integration tests need a running app (see README) and are slower - run them for changes that touch
multi-page flows or auth.

## Conventions

- No async/await in route handlers - better-sqlite3 is synchronous.
- Comments are one line, no trailing period, and only added when the *why* isn't obvious from the
  code.
- Scoring rules follow the official FIG Code of Points - ask a maintainer before deviating from it.
- Branch names follow `feature/<name>` or `refactor/<name>`; PRs merge into `main`.
