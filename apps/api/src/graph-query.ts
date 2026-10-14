import {
  db,
  activityEvents,
  gitlabCommits,
  gitlabMergeRequests,
  gitlabProjects,
  jiraIssues,
  jiraWorklogs,
} from '@worklog-assistant/db';
import { and, gte, lte, inArray, desc } from 'drizzle-orm';
import { config } from '@worklog-assistant/config';
import { extractJiraKeys } from '@worklog-assistant/shared';
import { buildGraph } from './graph-builder';
import { buildActivity } from './activity-summary';
export interface Range {
  from: string;
  to: string;
  limit: number;
}
export function parseRange(query: Record<string, unknown>): Range {
  const today = new Date().toISOString().slice(0, 10);
  const ago = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  const from = query.from ?? ago,
    to = query.to ?? today;
  const valid = (v: unknown): v is string =>
    typeof v === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    !Number.isNaN(Date.parse(v)) &&
    new Date(v).toISOString().slice(0, 10) === v;
  if (!valid(from) || !valid(to) || from > to)
    throw new Error('Invalid date range; use YYYY-MM-DD with from <= to');
  const limit = Number(query.limit ?? 100);
  if (!Number.isInteger(limit) || limit < 1 || limit > 500)
    throw new Error('limit must be an integer between 1 and 500');
  return { from, to, limit };
}
export async function readGraph(range: Range) {
  const from = new Date(`${range.from}T00:00:00.000Z`),
    to = new Date(`${range.to}T23:59:59.999Z`);
  const cap = range.limit + 1;
  return db.transaction(
    async (tx) => {
      const activities = await tx
        .select()
        .from(activityEvents)
        .where(and(gte(activityEvents.occurredAt, from), lte(activityEvents.occurredAt, to)))
        .orderBy(desc(activityEvents.occurredAt))
        .limit(cap);
      const commits = await tx
        .select()
        .from(gitlabCommits)
        .where(and(gte(gitlabCommits.committedAt, from), lte(gitlabCommits.committedAt, to)))
        .orderBy(desc(gitlabCommits.committedAt))
        .limit(cap);
      const mergeRequests = await tx
        .select()
        .from(gitlabMergeRequests)
        .where(
          and(gte(gitlabMergeRequests.updatedAt, from), lte(gitlabMergeRequests.updatedAt, to)),
        )
        .orderBy(desc(gitlabMergeRequests.updatedAt))
        .limit(cap);
      const worklogs = await tx
        .select()
        .from(jiraWorklogs)
        .where(and(gte(jiraWorklogs.startedAt, from), lte(jiraWorklogs.startedAt, to)))
        .orderBy(desc(jiraWorklogs.startedAt))
        .limit(cap);
      const merges = await tx
        .select()
        .from(gitlabMergeRequests)
        .where(and(gte(gitlabMergeRequests.mergedAt, from), lte(gitlabMergeRequests.mergedAt, to)))
        .orderBy(desc(gitlabMergeRequests.mergedAt))
        .limit(cap);
      const trimmed = {
        activities: activities.slice(0, range.limit),
        commits: commits.slice(0, range.limit),
        mergeRequests: mergeRequests.slice(0, range.limit),
        worklogs: worklogs.slice(0, range.limit),
      };
      const keys = [
        ...new Set([
          ...trimmed.activities.flatMap((a) => a.detectedIssueKeys),
          ...trimmed.commits.flatMap((c) => extractJiraKeys(c.message)),
          ...trimmed.mergeRequests.flatMap((m) =>
            extractJiraKeys(`${m.title} ${m.description ?? ''} ${m.sourceBranch}`),
          ),
          ...trimmed.worklogs.map((w) => w.jiraIssueKey),
        ]),
      ];
      const ids = [
        ...new Set(
          [...trimmed.activities, ...trimmed.commits, ...trimmed.mergeRequests].map(
            (a) => a.projectId,
          ),
        ),
      ];
      const issues = keys.length
        ? await tx.select().from(jiraIssues).where(inArray(jiraIssues.key, keys))
        : [];
      const projects = ids.length
        ? await tx.select().from(gitlabProjects).where(inArray(gitlabProjects.id, ids))
        : [];
      return {
        ...buildGraph({ ...trimmed, issues, projects, jiraUrl: config.JIRA_URL }),
        range,
        activity: buildActivity({
          activities: trimmed.activities,
          worklogs: trimmed.worklogs,
          merges: merges.slice(0, range.limit),
        }),
        truncated: [activities, commits, mergeRequests, worklogs, merges].some(
          (rows) => rows.length > range.limit,
        ),
      };
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  );
}
