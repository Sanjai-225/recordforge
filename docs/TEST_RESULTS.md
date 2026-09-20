# Test results — 20 September 2026

This report distinguishes implemented behavior, executed checks and unexecuted release gates. It does not claim zero errors or production certification.

## Executed results

| Check | Actual result | Scope |
|---|---|---|
| TypeScript | Passed | Entire application and test TypeScript |
| ESLint | Passed, zero warnings | Application, scripts and tests |
| Production build | Passed | Next.js 16.3.5 / React 19.3.0; all routes compiled |
| Unit tests | 6 passed | Input/URL protection, CSV escaping, timer, error sanitization |
| SQL / RLS | 30 passed | Fresh migrations on PGlite; actual PostgreSQL grants/RLS, stub Auth context |
| 1,200-workflow simulation | Passed | 120 participants × 10 chatbots, queued SQL transactions |
| Browser tests | 12 passed | Chromium; production public pages/API boundaries plus mocked authenticated component harness |
| Production dependency audit | See `test-results/dependency-audit.json` | npm advisory database at execution time; not a penetration test |

The database suite covers closed registration, normal registration, duplicate requests, Event ID collisions, protected roles/timestamps, ownership, pre-LIVE rejection, idempotent create, verification ordering, versioned editing, official deployment timestamps, repeated verification, public privacy/configurable disclosure, limits, pause/resume, correction decrement, stale retry protection, disabled identities, soft-delete restore, exports, safe sorting, automatic expiry, rate-limit authorization/expiry, end state, protected field names and granular/full clean resets with preserved configuration/audit and safe retry.

The browser suite covers desktop/mobile sign-in labels, dynamic registration fields, closed registration, production unauthenticated redirects and CSRF rejection, public snapshots, participant draft/deploy/verify with no optimistic count, lost verification response, second-tab reconnect, developer overview/two-stage reset, Escape/error behavior and slow snapshot completion under continuous update signals.

## Simulation measurements

The latest complete `load.json` report records:

| Measure | Result |
|---|---:|
| Participants | 120 |
| Separate chatbot records | 1,200 |
| Verification calls | 1,680 |
| Duplicate verification requests | 480 |
| Unique verification audit events | 1,200 |
| Qualifying completed rows | 1,200 |
| Sum of participant totals | 1,200 |
| Leaderboard aggregate | 1,200 |
| Public leaderboard row sum | 1,200 |
| Master/progress total | 1,200 |
| Consistency | True |
| Total simulation duration | 5,216 ms |
| Verification phase duration | 2,392 ms |
| Queued-call p95 | 213 ms |

These measurements come from one embedded PGlite engine that serializes submitted transactions. They establish the stated SQL invariants in that test environment. They do **not** measure 120 simultaneous PostgreSQL backends, hosted HTTP throughput, managed Auth, actual Realtime delivery or event Wi-Fi.

## Not yet executed

| Gate | Reason / next action |
|---|---|
| Native 120-connection PostgreSQL load | No Docker/native PostgreSQL available; environment cannot start a non-root PostgreSQL service. Run supplied `test:concurrency` with isolated Compose setup. |
| Managed Supabase Auth / JWT / Realtime | Connected account had no project. Provision staging, apply migrations and run supplied `test:provider`. |
| Seed and developer bootstrap against Supabase | Scripts implemented/typechecked; actual identities require a configured project and secure bootstrap inputs. |
| Vercel staging/production | Connected deployment operation returned “tool not found”; CLI was not authenticated. No URL was produced. |
| GitHub CI | Workflow supplied but no external repository/runner execution occurred. |
| Backup restoration and event network rehearsal | Requires organizer infrastructure and selected provider backup strategy. |
| Safari/Firefox/actual TV browser | Automated UI validation used Chromium only. |

## Evidence files

- `test-results/database.json`: individual SQL assertions and execution time.
- `test-results/load.json`: simulation results and equality checks.
- `test-results/browser.json`: detailed Playwright report.
- `test-results/dependency-audit.json`: runtime dependency advisory scan.
- `screenshots/`: synthetic-fixture views of participant mobile/desktop, developer overview, login, leaderboard and progress display.

Reports for native concurrency and managed integration are written only after their suites actually succeed. Their absence is intentional. Production acceptance requires these gates and the EVENT_DAY.md rehearsal; passing the local checks alone is insufficient.
