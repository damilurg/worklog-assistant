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
