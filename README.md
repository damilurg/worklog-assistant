[Русская версия](README.ru.md)

# GitLab → Jira Worklog Assistant

A self-hosted TypeScript workspace with an existing GitLab/Jira CLI, an English-only Angular activity dashboard, and a development graph. The CLI stores source records in PostgreSQL; the graph service stores its projections in MongoDB.

Jira worklogs are read, not written automatically. Existing CLI CSV/JSON reports allocate a target workday; dashboard recorded-time totals use imported Jira worklog seconds instead. User approval remains required before any future Jira write feature.

## Implemented features

- Existing multi-instance GitLab commit, MR and review-note sync, Jira issue/worklog sync, coverage tracking, CLI reports and exports.
- Angular relationship graph with source links, search, node filters, zoom and one/two-level focus.
- Daily/hourly activity, development/review events, actual MR merges and recorded Jira worklog time.
- Source ledger with row IDs, timestamps, raw seconds, day/source filters, pagination and JSON export.
- Cached MongoDB graph projections; no external API calls when changing date/view/ledger filters.
- Separate live and demo commands, server-side credentials, local Fastify API.

Automatic Jira writes, deployment imports, importer correctness fixes and changes to the CLI's allocation algorithm remain future work.

## Requirements

- Node.js 24 or newer.
- pnpm 11.25.0, pinned by `packageManager`.
- PostgreSQL for live CLI data.
- Docker with Compose v2 supporting `--wait` for automatic local MongoDB startup, or an existing MongoDB instance with manual API startup.
- Demo mode requires neither databases nor service tokens.

## Setup and launch

### First-time local setup

Configure `.env` with your existing GitLab/Jira settings. Do not replace an already configured file.

```bash
cp .env.example .env
pnpm install
pnpm build
docker compose up -d postgres
pnpm --filter @worklog-assistant/db exec drizzle-kit push
pnpm graph
```

On PowerShell, use `Copy-Item .env.example .env` instead of `cp`. Existing CLI users keep their `.env` and PostgreSQL data; this graph feature requires no new PostgreSQL schema migration.

Open **http://localhost:3000**. `pnpm graph` builds the workspace, starts and waits for local MongoDB, then starts the API/UI. Startup does not call GitLab/Jira: the first uncached range is projected from existing PostgreSQL data. Click **Sync workspace** to run the CLI for the selected dates and update MongoDB.

### Live and demo commands

```bash
pnpm graph        # Existing CLI data + MongoDB graph; no sample fallback
pnpm graph:demo   # Sample records only; no databases or provider calls
pnpm graph:dev    # Angular development server on 4200; API must run on 3000
```

For an existing MongoDB instance, set `MONGODB_URI` and start without creating a local container:

```bash
pnpm build
node apps/api/dist/index.js
```

To run the complete local Compose stack instead of a local Node API, use `docker compose up -d --build` after PostgreSQL schema setup. Compose forwards `GITLAB_INSTANCES`, `JIRA_AUTH_MODE` and the existing author filters. API and MongoDB ports are published only on loopback.

## Data flow and synchronization

| Action / component                            | Reads                                            | Writes / behavior                                                             |
| --------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------- |
| Existing CLI sync                             | GitLab/Jira, existing coverage                   | Source records and coverage in PostgreSQL                                     |
| Cached graph range                            | MongoDB                                          | Returns the saved projection; no PostgreSQL/provider request                  |
| First uncached graph range                    | Existing PostgreSQL records                      | Builds and stores one MongoDB projection; no GitLab/Jira request              |
| **Sync workspace**                            | Existing CLI + PostgreSQL                        | Refreshes the selected MongoDB projection and invalidates other cached ranges |
| Day/source filters, graph focus, ledger pages | Loaded browser data                              | No server or provider requests                                                |
| Date changes / **Apply dates**                | MongoDB cache, or one cold PostgreSQL projection | Never synchronizes providers automatically                                    |

The graph reuses the CLI's server-side `.env`; tokens never enter the browser. Concurrent requests for the same range share the pending read. MongoDB collection `worklog_graph.graph_snapshots` stores atomic documents keyed by date range and row limit, containing the graph, activity summary and source ledger. Failed source reads do not replace an existing snapshot.

The CLI keeps its incremental coverage and best-effort behavior. Covered provider/date ranges are skipped; failures remain retryable and warnings appear in server logs. For a full upstream reload, use the existing `pnpm sync --from ... --to ... --force`, then **Sync workspace** to refresh projections. Running the CLI separately does not automatically invalidate an already cached graph range.

## Dates, filters and demo behavior

- UI and API default to yesterday through today in UTC. The successfully loaded range is shown explicitly.
- Date edits apply automatically; **Apply dates** reloads the selected range. Older responses cannot overwrite newer selections.
- Invalid dates or API errors are shown explicitly; previous/sample records do not substitute for failed live responses.
- Selecting a day or source filters the ledger locally. It shows 20 rows per page; JSON export includes all matching rows in the loaded slice, not just the current page.
- `graph:demo` uses a fixed fixture dated **2026-10-08 through 2026-10-14**, applies the same date/limit filters and returns empty results outside those dates. It never contacts databases or providers.

## Activity and calculation provenance

| Metric              | Source / formula                                             |
| ------------------- | ------------------------------------------------------------ |
| Daily/hourly events | Stored `activity_events` rows grouped by UTC timestamp       |
| Development         | `activity_events.type = commit`                              |
| Review              | `activity_events.type = merge_request_reviewed`              |
| Integration         | MR records whose actual `merged_at` is in the selected range |
| Recorded hours      | `SUM(jira_worklogs.duration_seconds) / 3600`                 |

Hourly bars count events, not hours worked. Worklog duration is assigned to its UTC start date; it is not spread over inferred work hours. Only dates containing source rows are listed.

Planner allocations, generated `worklog_entries`, eight-hour normalization and inferred work duration are excluded from recorded-time totals. Imported Jira values are traceable stored records, not proof of hours worked. Upstream duplicates or importer inaccuracies remain visible; the dashboard does not silently fix or deduplicate them.

**Source ledger** exposes original row IDs, tables, timestamps, types, issue keys and raw seconds. **Export source JSON** includes the filtered rows, loaded range, UTC timezone, selected filters, truncation flag and the sum of recorded seconds. The displayed whole-period formula is separate from ledger filters. This export never invokes the CLI report allocator.

Merged MRs represent integration, not deployment. Delivery metrics require real deployment records from a future CLI extension. Commit-to-MR membership is omitted because the existing store does not contain that relationship. GitLab commit authors and Jira worklog authors have separate identities.

## API and storage limits

| Endpoint                                                 | Behavior                                                           |
| -------------------------------------------------------- | ------------------------------------------------------------------ |
| `GET /health`                                            | Process health and live/demo mode; not a database health guarantee |
| `GET /api/graph?from=YYYY-MM-DD&to=YYYY-MM-DD&limit=100` | Cached MongoDB graph or one first-time projection                  |
| `POST /api/sync` with the same query parameters          | Existing CLI sync followed by MongoDB refresh                      |

The source slice defaults to 100 rows per source, with `limit` from 1 through 500. Truncation is shown explicitly; totals describe the loaded slice, not unseen records. Dates are inclusive UTC calendar dates. PostgreSQL projection reads use a read-only repeatable-read transaction.

MongoDB snapshots are bounded single documents subject to the 16 MiB limit. Separate indexed node/edge collections, server pagination, deployment data, and importer/report audits remain future improvements. This is a local single-user application: API defaults to localhost and rejects non-localhost hosts and cross-origin browser requests.

## CLI

After `pnpm build`, use the short commands from the repository root:

```bash
pnpm gitlab                         # GitLab for yesterday
pnpm jira                           # Jira for yesterday
pnpm sync                           # GitLab + Jira for yesterday
pnpm sync --period half-year        # GitLab + Jira for six months
pnpm standup                        # stand-up for yesterday
pnpm standup --date 2026-09-29      # stand-up for a date
pnpm report                         # sync all sources and create worklogs.csv for yesterday
pnpm report --period half-year      # sync six months and create worklogs.csv
pnpm report:json                    # sync all sources and create worklogs.json for yesterday
pnpm finish                         # finish today: sync, CSV, JSON, and stand-up
pnpm get:report                     # finish today: CSV and JSON only
pnpm get:standup                    # finish today: stand-up only
pnpm activity --from 2026-09-01
pnpm day 2026-09-29
```

All range flags are forwarded to the CLI. Reports synchronize GitLab and Jira first, which refreshes normalized activity before CSV/JSON generation. The generated `worklogs.csv` and `worklogs.json` files are ignored by Git.

At the end of the workday, run `pnpm finish` without dates. It uses today's date in `TIMEZONE`, synchronizes both sources once, creates upload-ready `worklogs.csv` and `worklogs.json`, and writes plus prints `standup.md`. Repeated runs reuse synchronization coverage; use `pnpm finish --force` only when a full refresh is needed.

Stand-up headings always include the exact date and use relative labels such as `Today`, `Tomorrow`, and `Yesterday` when applicable.

Successful provider/date pairs are stored in `sync_coverage` together with a token-free configuration fingerprint. Repeating the same command skips covered dates without calling the provider APIs; uncovered gaps are grouped into the smallest contiguous ranges. Changing instances, projects, authors, or Jira connection settings creates a new scope automatically. Use `--force` only when a date must be fetched again:

```bash
pnpm sync --from 2026-09-01 --to 2026-09-30 --force
pnpm report --from 2026-09-01 --to 2026-09-30 --force
```

GitLab retries network errors, rate limits, and temporary server failures at most three times with exponential backoff. Authentication, permission, and not-found responses exit immediately. Failed ranges are never marked as covered.

Combined sync and export commands treat both sources as best-effort: if GitLab or Jira is unavailable, they print a source-specific warning and continue with data already stored in PostgreSQL. A failed range is not marked as synchronized, so the next run can retry it. The standalone `pnpm gitlab` and `pnpm jira` commands still exit with an error for monitoring and automation.

Report comments use the Jira issue summary, include at most two unique GitLab activities, and collapse the remainder into a counter.

The full compiled CLI remains available:

```bash
# GitLab + Jira for yesterday (default)
node apps/cli/dist/index.js sync
# Preset history ranges ending yesterday
node apps/cli/dist/index.js sync --period week
node apps/cli/dist/index.js sync --period month
node apps/cli/dist/index.js sync --period half-year
node apps/cli/dist/index.js sync --period year
# Explicit range, for either combined or provider-specific sync
node apps/cli/dist/index.js sync --from 2026-09-01 --to 2026-09-30
node apps/cli/dist/index.js gitlab sync --from 2026-09-01 --to 2026-09-30
node apps/cli/dist/index.js jira sync --from 2026-09-01 --to 2026-09-30
node apps/cli/dist/index.js activity --from 2026-09-01 --to 2026-09-30
node apps/cli/dist/index.js day 2026-09-30
node apps/cli/dist/index.js export --from 2026-09-01 --to 2026-09-30 --format csv > worklogs.csv
# Optional structured output
node apps/cli/dist/index.js export --from 2026-09-01 --to 2026-09-30 --format json
node apps/cli/dist/index.js report
node apps/cli/dist/index.js report --date 2026-09-29
```

Synchronization and export default to yesterday. Explicit `--from/--to` dates override `--period`. The report also defaults to yesterday. Use `node apps/cli/dist/index.js --help` for the complete command list.

### Daily schedule

Run `node apps/cli/dist/index.js sync` once every morning. On Windows, create a Task Scheduler action with `node` as the program, the absolute `apps/cli/dist/index.js sync` path as arguments, and the repository root as **Start in**. On Linux/macOS, a weekday cron entry can be:

```cron
0 9 * * 1-5 cd /path/to/worklog-assistant && node apps/cli/dist/index.js sync
```

## Environment variables

| Variable               | Required          | Purpose                                                                                   |
| ---------------------- | ----------------- | ----------------------------------------------------------------------------------------- |
| `DATABASE_URL`         | Yes               | PostgreSQL connection URL.                                                                |
| `GITLAB_INSTANCES`     | For GitLab sync   | JSON array of `{ url, token, projectIds }`. Tokens need `read_api` and `read_repository`. |
| `GITLAB_AUTHOR_EMAILS` | Recommended       | Comma-separated commit-author emails.                                                     |
| `GITLAB_AUTHOR_NAMES`  | Recommended       | Comma-separated GitLab/commit author names.                                               |
| `JIRA_URL`             | For Jira commands | Jira site URL.                                                                            |
| `JIRA_EMAIL`           | For Jira commands | Jira account email.                                                                       |
| `JIRA_TOKEN`           | For Jira commands | Jira API token.                                                                           |
| `JIRA_AUTH_MODE`       | No                | `cloud` for Basic/API v3 or `data-center` for Bearer PAT/API v2. Defaults to `cloud`.     |
| `WORKDAY_HOURS`        | No                | Target workday length; defaults to `8`.                                                   |
| `TIMEZONE`             | No                | IANA timezone; defaults to `Asia/Bishkek`.                                                |
| `MONGODB_URI`          | No                | Graph MongoDB URL; defaults to `mongodb://127.0.0.1:27017`.                               |
| `MONGODB_DATABASE`     | No                | Graph database; defaults to `worklog_graph`.                                              |
| `PORT`                 | No                | Local API/UI port; defaults to `3000`.                                                    |

`TIMEZONE` applies to CLI operations that use it; graph date boundaries and charts currently use UTC. `WORKDAY_HOURS` affects CLI planning, not recorded-time dashboard totals. Credentials stay on the server; no browser API key is required.

Never commit `.env`; it is intentionally ignored.

## Development and validation

| Path              | Responsibility                                                      |
| ----------------- | ------------------------------------------------------------------- |
| `apps/cli`        | Existing synchronization and reports                                |
| `apps/api`        | Fastify, PostgreSQL projection, MongoDB cache, activity aggregation |
| `apps/web`        | Angular UI and English copy in `src/i18n/en.ts`                     |
| `packages/shared` | Graph/activity contracts and demo fixtures                          |
| `packages/db`     | Existing PostgreSQL/Drizzle schema                                  |

```bash
pnpm test
pnpm lint
pnpm build
```

Automated tests cover aggregation without workday allocation, UTC boundaries, raw-row provenance, MongoDB cache behavior with a mocked collection, local API access, demo range filtering and sync guards. Chromium checks cover automatic dates, empty ranges, 20-row pagination, export inputs, English UI and mobile layout. Docker/live MongoDB and real user PostgreSQL/GitLab/Jira have not been validated in this environment; do not treat mocked adapter tests as live integration validation.

## Documentation

- [Russian README](README.ru.md) — the same feature scope and operational contract.
