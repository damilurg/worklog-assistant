[Русская версия](README.ru.md)

# GitLab → Jira Worklog Assistant

A self-hosted TypeScript application that collects GitLab activity, matches it to Jira issues, stores synchronization state in PostgreSQL, and prepares worklog data for review.

The repository currently provides a CLI-first MVP. It reads Jira worklogs but does not write new worklogs automatically: user approval remains a required product boundary.

## Implemented features

- GitLab commit, merge request, and review-note synchronization across multiple instances and projects.
- Idempotent PostgreSQL persistence with Drizzle ORM.
- Jira issue-key extraction from activity text.
- Activity listing and daily grouping by Jira issue.
- Jira issue/worklog synchronization.
- Jira-compatible CSV export with an eight-hour daily allocation; JSON remains available.
- Russian stand-up report combining GitLab activity with Jira worklogs.
- Fastify health endpoint at `GET /health`.

Approval, Jira write, full REST API, and web UI remain planned work.

## Requirements

- Node.js 24 or newer
- pnpm
- Docker with Docker Compose, or a compatible PostgreSQL instance

## Setup

```bash
cp .env.example .env
pnpm install
docker compose up -d
pnpm --filter @worklog-assistant/db exec drizzle-kit push
pnpm build
```

On PowerShell, use `Copy-Item .env.example .env` instead of `cp`.

Configure `.env` before synchronization. See [.env.example](.env.example) for the available settings.

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

Never commit `.env`; it is intentionally ignored.

## Quality checks

```bash
pnpm test
pnpm lint
pnpm build
```

## Documentation

- [Русский README](README.ru.md)

## Development graph

Run `pnpm graph` after the usual project setup, then open http://localhost:3000. The command builds the workspace, starts MongoDB through Docker Compose, waits for it to become healthy, and starts the existing API with an Angular UI. It uses the existing PostgreSQL database, GitLab/Jira clients, and `.env`; MongoDB stores the graph projection; existing CLI records stay in PostgreSQL. No PostgreSQL schema migration is required.

```bash
pnpm graph        # Existing workspace data
pnpm graph:demo   # Sample graph without external APIs or PostgreSQL
```

Choose a date range and click **Apply dates** to read stored data, or **Sync workspace** to run the existing CLI `sync`. This action does not write worklogs to Jira. The CLI keeps its best-effort behavior: stored data remains available when a source fails, and warnings appear in server logs. Search, node-type filters, node details, source links, zoom, and one/two-level focus are available in the UI.

The graph includes projects, commits, merge requests, Jira issues, authors, and worklogs. Connections use stored `detectedIssueKeys`, commit messages, MR descriptions, and branch names. Commit-to-MR membership is omitted because it is not stored. GitLab commit authors and Jira worklog authors have separate identities. The graph reflects the activity imported by the existing CLI, rather than every item in GitLab.

`GET /api/graph?from=YYYY-MM-DD&to=YYYY-MM-DD&limit=100` and `POST /api/sync` accept the same query parameters. Dates use UTC, matching explicit CLI `--from/--to` ranges. The default is the last 30 UTC calendar dates with up to 100 records per source; the maximum limit is 500. The UI warns when results are truncated. CLI source data is read in a read-only repeatable-read PostgreSQL transaction. Graph reads return the existing MongoDB projection. A previously unseen range is built once from PostgreSQL without calling GitLab/Jira. Explicit **Sync workspace** runs the existing CLI, rebuilds the selected MongoDB projection, and invalidates other cached ranges. Running the CLI separately requires an explicit sync/reprojection before cached graph views change. Switching dates, chart filters, graph focus or ledger pages never triggers external provider APIs. MongoDB `graph_snapshots` stores one atomic document per date range and limit; a failed source read does not overwrite the previous snapshot. Snapshots contain graph data only, never tokens. This bounded MVP uses MongoDB’s 16 MiB document limit. Large-workspace node/edge collections are a future improvement.

The API binds to localhost by default. No browser API key or credential entry is required: sync reuses the existing GitLab/Jira environment settings. Requests with non-localhost hosts and cross-origin browser requests are rejected; Docker publishes the API only on loopback. This is a local single-user application. GitLab/Jira tokens are never returned to the browser.

The UI supports English only, with copy centralized in `apps/web/src/i18n/en.ts`. Document language is `en`, and Angular uses the `en-US` locale. Content imported from GitLab and Jira retains its original language.

MongoDB defaults to `mongodb://127.0.0.1:27017`, database `worklog_graph`; override `MONGODB_URI` and `MONGODB_DATABASE` in `.env` when needed. If using an existing remote MongoDB, build and start the API directly with `pnpm build && node apps/api/dist/index.js` to skip the local Docker startup. MongoDB persistence and local startup are covered by mocked adapter/API tests; Docker and live MongoDB still need validation on your machine.

For Angular development, run `pnpm graph:dev` on port 4200 with a proxy to the API on port 3000. Validate with `pnpm test`, `pnpm lint`, and `pnpm build`. The UI is in `apps/web`, graph projection/API in `apps/api`, and the shared graph contract in `packages/shared/src/graph.ts`.

### Source activity and calculation ledger

Activity overview shows daily/hourly GitLab event counts, commit events, review events, actual MR merges by `merged_at`, and recorded Jira worklog time. Totals use only the bounded source rows displayed in the ledger. No planner allocation, `worklog_entries`, eight-hour normalization, estimated durations, or automatic deduplication enters these totals. Recorded hours equal the sum of imported `jira_worklogs.duration_seconds / 3600`; they do not verify the importer or prove hours worked. Hourly bars count event timestamps, not work duration. Worklog duration is assigned to its UTC start date, and only dates with source records are shown. Merged MRs indicate integration, not delivery; deployment reporting requires real deployment records.

Click a day or choose a source table to inspect row IDs, timestamps, issue keys, and raw seconds. **Export source JSON** exports the filtered rows with range, timezone, and truncation metadata. These exported rows are the displayed calculation inputs; this export does not use the CLI's planner or report allocator. Demo activity is marked sample data and is independent of live records.

Date edits apply automatically. The displayed loaded range is shown explicitly in UTC. Demo records are filtered by the same dates and return an empty result outside their fixture range; they never replace failed live API responses. The default view is yesterday through today (UTC). The source ledger has 20 rows per page, while JSON export includes every matching source row in the loaded slice. Late responses from earlier date requests cannot replace a newer selection.
