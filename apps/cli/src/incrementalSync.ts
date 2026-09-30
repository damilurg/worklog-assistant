import { db, syncCoverage } from '@worklog-assistant/db';
import { config } from '@worklog-assistant/config';
import { and, eq, gte, lte } from 'drizzle-orm';
import { createHash } from 'node:crypto';

export type SyncProvider = 'gitlab' | 'jira';

export interface DateRange {
  fromDate: Date;
  toDate: Date;
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function coverageScope(provider: SyncProvider): string {
  const value =
    provider === 'gitlab'
      ? {
          instances: config.GITLAB_INSTANCES.map(({ url, projectIds }) => ({ url, projectIds })),
          authorEmails: config.GITLAB_AUTHOR_EMAILS,
          authorNames: config.GITLAB_AUTHOR_NAMES,
        }
      : {
          url: config.JIRA_URL,
          email: config.JIRA_EMAIL,
          authMode: config.JIRA_AUTH_MODE,
        };

  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);
}

function eachDate(fromDate: Date, toDate: Date): string[] {
  const dates: string[] = [];
  const current = new Date(fromDate);
  current.setUTCHours(0, 0, 0, 0);

  while (current <= toDate) {
    dates.push(dateKey(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return dates;
}

function startOfDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function endOfDate(date: string): Date {
  return new Date(`${date}T23:59:59.999Z`);
}

export function buildMissingRanges(
  fromDate: Date,
  toDate: Date,
  coveredDates: ReadonlySet<string>,
): DateRange[] {
  const missingDates = eachDate(fromDate, toDate).filter((date) => !coveredDates.has(date));
  const ranges: DateRange[] = [];

  for (const date of missingDates) {
    const previous = ranges.at(-1);
    const currentStart = startOfDate(date);

    if (previous) {
      const dayAfterPrevious = new Date(previous.toDate);
      dayAfterPrevious.setUTCMilliseconds(dayAfterPrevious.getUTCMilliseconds() + 1);
      if (dateKey(dayAfterPrevious) === date) {
        previous.toDate = endOfDate(date);
        continue;
      }
    }

    ranges.push({ fromDate: currentStart, toDate: endOfDate(date) });
  }

  return ranges;
}

export async function syncIncrementally(
  provider: SyncProvider,
  range: DateRange,
  sync: (fromDate: Date, toDate: Date) => Promise<void>,
  force = false,
): Promise<void> {
  let coveredDates = new Set<string>();
  const scope = coverageScope(provider);

  if (!force) {
    const coverage = await db
      .select({ date: syncCoverage.date })
      .from(syncCoverage)
      .where(
        and(
          eq(syncCoverage.provider, provider),
          eq(syncCoverage.scope, scope),
          gte(syncCoverage.date, dateKey(range.fromDate)),
          lte(syncCoverage.date, dateKey(range.toDate)),
        ),
      );
    coveredDates = new Set(coverage.map((row) => row.date));
  }

  const missingRanges = buildMissingRanges(range.fromDate, range.toDate, coveredDates);
  if (missingRanges.length === 0) {
    console.log(`[${provider}] Range is already synchronized; skipping API requests.`);
    return;
  }

  for (const missingRange of missingRanges) {
    console.log(
      `[${provider}] Syncing missing range ${dateKey(missingRange.fromDate)} to ${dateKey(missingRange.toDate)}`,
    );
    await sync(missingRange.fromDate, missingRange.toDate);

    const values = eachDate(missingRange.fromDate, missingRange.toDate).map((date) => ({
      provider,
      scope,
      date,
      syncedAt: new Date(),
    }));
    await db
      .insert(syncCoverage)
      .values(values)
      .onConflictDoUpdate({
        target: [syncCoverage.provider, syncCoverage.scope, syncCoverage.date],
        set: { syncedAt: new Date() },
      });
  }
}
