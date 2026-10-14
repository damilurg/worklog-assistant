import type { ActivitySummary, DailyActivity, RawActivity } from '@worklog-assistant/shared';
export interface ActivityInput {
  activities: {
    id: string;
    type: string;
    occurredAt: Date;
    title: string;
    detectedIssueKeys: string[];
    sourceUrl: string | null;
  }[];
  worklogs: {
    id: string;
    jiraIssueKey: string;
    startedAt: Date;
    durationSeconds: number;
    comment: string | null;
  }[];
  merges: {
    id: string;
    iid: number;
    title: string;
    mergedAt: Date | null;
    webUrl: string | null;
  }[];
}
export function buildActivity(input: ActivityInput): ActivitySummary {
  const days = new Map<string, DailyActivity>();
  const day = (date: Date) => {
    const key = date.toISOString().slice(0, 10);
    if (!days.has(key))
      days.set(key, {
        date: key,
        events: 0,
        commits: 0,
        reviews: 0,
        mergedRequests: 0,
        loggedSeconds: 0,
      });
    return days.get(key)!;
  };
  const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour, events: 0 }));
  const rows: RawActivity[] = [];
  for (const a of input.activities) {
    const d = day(a.occurredAt);
    d.events++;
    hourly[a.occurredAt.getUTCHours()].events++;
    if (a.type === 'commit') d.commits++;
    if (a.type === 'merge_request_reviewed') d.reviews++;
    rows.push({
      id: a.id,
      source: 'activity_events',
      timestamp: a.occurredAt.toISOString(),
      type: a.type,
      title: a.title,
      issueKeys: a.detectedIssueKeys,
      url: a.sourceUrl ?? undefined,
    });
  }
  for (const w of input.worklogs) {
    day(w.startedAt).loggedSeconds += w.durationSeconds;
    rows.push({
      id: w.id,
      source: 'jira_worklogs',
      timestamp: w.startedAt.toISOString(),
      type: 'worklog',
      title: w.comment || w.jiraIssueKey,
      issueKeys: [w.jiraIssueKey],
      durationSeconds: w.durationSeconds,
    });
  }
  for (const m of input.merges) {
    if (!m.mergedAt) continue;
    day(m.mergedAt).mergedRequests++;
    rows.push({
      id: m.id,
      source: 'gitlab_merge_requests',
      timestamp: m.mergedAt.toISOString(),
      type: 'merge',
      title: `!${m.iid} ${m.title}`,
      issueKeys: [],
      url: m.webUrl ?? undefined,
    });
  }
  const daily = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
  const totals = daily.reduce(
    (acc, d) => ({
      events: acc.events + d.events,
      commits: acc.commits + d.commits,
      reviews: acc.reviews + d.reviews,
      mergedRequests: acc.mergedRequests + d.mergedRequests,
      loggedSeconds: acc.loggedSeconds + d.loggedSeconds,
      worklogRows: input.worklogs.length,
    }),
    {
      events: 0,
      commits: 0,
      reviews: 0,
      mergedRequests: 0,
      loggedSeconds: 0,
      worklogRows: input.worklogs.length,
    },
  );
  return {
    timezone: 'UTC',
    daily,
    hourly,
    totals,
    rows: rows.sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
  };
}
