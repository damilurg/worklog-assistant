import { db, activityEvents } from '@worklog-assistant/db';
import { gte, lte, and, eq } from 'drizzle-orm';

export interface ActivityFilter {
  fromDate?: Date;
  toDate?: Date;
  projectId?: string;
  issueKey?: string;
  unmatched?: boolean;
}

export async function getActivities(filter: ActivityFilter) {
  const conditions = [];

  if (filter.fromDate) {
    conditions.push(gte(activityEvents.occurredAt, filter.fromDate));
  }
  if (filter.toDate) {
    conditions.push(lte(activityEvents.occurredAt, filter.toDate));
  }
  if (filter.projectId) {
    conditions.push(eq(activityEvents.projectId, filter.projectId));
  }

  const results = await db
    .select()
    .from(activityEvents)
    .where(and(...conditions))
    .orderBy(activityEvents.occurredAt);

  return results.filter((r) => {
    if (filter.unmatched && r.detectedIssueKeys.length > 0) return false;
    if (filter.issueKey && !r.detectedIssueKeys.includes(filter.issueKey)) return false;
    return true;
  });
}

export async function getDaySummary(dateStr: string) {
  // dateStr is YYYY-MM-DD
  const startOfDay = new Date(`${dateStr}T00:00:00Z`);
  const endOfDay = new Date(`${dateStr}T23:59:59Z`);

  const activities = await getActivities({ fromDate: startOfDay, toDate: endOfDay });

  const issuesMap = new Map<string, typeof activities>();
  const unmatched: typeof activities = [];

  for (const act of activities) {
    if (act.detectedIssueKeys.length === 1) {
      const key = act.detectedIssueKeys[0];
      if (!issuesMap.has(key)) issuesMap.set(key, []);
      issuesMap.get(key)!.push(act);
    } else if (act.detectedIssueKeys.length > 1) {
      const key = 'AMBIGUOUS';
      if (!issuesMap.has(key)) issuesMap.set(key, []);
      issuesMap.get(key)!.push(act);
    } else {
      unmatched.push(act);
    }
  }

  return { issues: issuesMap, unmatched };
}

export * from './export';

export * from './report';
