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

After `pnpm build`, run the compiled entry point:

```bash
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

GitLab and Jira synchronization default to the previous six months. The report defaults to yesterday. Use `node apps/cli/dist/index.js --help` for the complete command list.

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
