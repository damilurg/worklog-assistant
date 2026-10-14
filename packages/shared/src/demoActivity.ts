import type { ActivitySummary, RawActivity } from './activity';
const rows: RawActivity[] = [];
const daily = Array.from({ length: 7 }, (_, i) => {
  const events = [8, 12, 5, 16, 10, 3, 9][i];
  const commits = [4, 6, 3, 9, 5, 1, 4][i];
  const reviews = [2, 3, 1, 4, 3, 0, 3][i];
  const loggedSeconds = [21600, 25200, 14400, 27000, 23400, 7200, 19800][i];
  const date = `2026-10-${String(i + 8).padStart(2, '0')}`;
  for (let n = 0; n < events; n++)
    rows.push({
      id: `demo-event-${i}-${n}`,
      source: 'activity_events',
      timestamp: `${date}T${String(8 + (n % 10)).padStart(2, '0')}:20:00.000Z`,
      type:
        n < commits
          ? 'commit'
          : n < commits + reviews
            ? 'merge_request_reviewed'
            : 'merge_request_opened',
      title:
        n < commits
          ? 'DEV-142 Update session handling'
          : n < commits + reviews
            ? 'Review: DEV-145 Keyboard navigation'
            : 'MR: DEV-138 Workspace tooling',
      issueKeys: [n < commits ? 'DEV-142' : n < commits + reviews ? 'DEV-145' : 'DEV-138'],
    });
  rows.push({
    id: `demo-log-${i}`,
    source: 'jira_worklogs',
    timestamp: `${date}T09:00:00.000Z`,
    type: 'worklog',
    title: 'Session security implementation',
    issueKeys: ['DEV-142'],
    durationSeconds: loggedSeconds,
  });
  if (i % 2 === 0)
    rows.push({
      id: `demo-merge-${i}`,
      source: 'gitlab_merge_requests',
      timestamp: `${date}T16:10:00.000Z`,
      type: 'merge',
      title: '!42 Session security',
      issueKeys: [],
    });
  return { date, events, commits, reviews, mergedRequests: i % 2 === 0 ? 1 : 0, loggedSeconds };
});
export const demoActivity: ActivitySummary = {
  timezone: 'UTC',
  daily,
  hourly: Array.from({ length: 24 }, (_, hour) => ({
    hour,
    events: rows.filter(
      (r) => r.source === 'activity_events' && new Date(r.timestamp).getUTCHours() === hour,
    ).length,
  })),
  totals: {
    events: daily.reduce((n, d) => n + d.events, 0),
    commits: daily.reduce((n, d) => n + d.commits, 0),
    reviews: daily.reduce((n, d) => n + d.reviews, 0),
    mergedRequests: 4,
    loggedSeconds: daily.reduce((n, d) => n + d.loggedSeconds, 0),
    worklogRows: 7,
  },
  rows: rows.sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
};
