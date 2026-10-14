import { it, expect } from 'vitest';
import { buildActivity } from '../src/activity-summary';
it('counts raw events by UTC date/hour and sums actual Jira seconds without workday allocation', () => {
  const a = buildActivity({
    activities: [
      {
        id: 'a1',
        type: 'commit',
        occurredAt: new Date('2026-10-01T23:45:00Z'),
        title: 'Commit',
        detectedIssueKeys: ['DEV-1'],
        sourceUrl: null,
      },
      {
        id: 'a2',
        type: 'merge_request_reviewed',
        occurredAt: new Date('2026-10-02T00:15:00Z'),
        title: 'Review',
        detectedIssueKeys: ['DEV-1'],
        sourceUrl: null,
      },
    ],
    worklogs: [
      {
        id: 'w1',
        jiraIssueKey: 'DEV-1',
        startedAt: new Date('2026-10-01T23:00:00Z'),
        durationSeconds: 1800,
        comment: null,
      },
      {
        id: 'w2',
        jiraIssueKey: 'DEV-1',
        startedAt: new Date('2026-10-01T12:00:00Z'),
        durationSeconds: 900,
        comment: null,
      },
    ],
    merges: [
      {
        id: 'm1',
        iid: 1,
        title: 'Merge',
        mergedAt: new Date('2026-10-02T03:00:00Z'),
        webUrl: null,
      },
    ],
  });
  expect(a.totals.loggedSeconds).toBe(2700);
  expect(a.daily[0].loggedSeconds).toBe(2700);
  expect(a.daily[1].reviews).toBe(1);
  expect(a.hourly[23].events).toBe(1);
  expect(a.hourly[0].events).toBe(1);
  expect(a.totals.mergedRequests).toBe(1);
  expect(
    a.rows
      .filter((r) => r.source === 'jira_worklogs')
      .map((r) => r.durationSeconds)
      .reduce((n, s) => n + (s ?? 0), 0),
  ).toBe(a.totals.loggedSeconds);
  expect(a.totals.events).toBe(2);
});
it('does not silently deduplicate stored rows or infer deployments and hours from events', () => {
  const event = {
    type: 'commit',
    occurredAt: new Date('2026-10-01'),
    title: 'Same event',
    detectedIssueKeys: [],
    sourceUrl: null,
  };
  const a = buildActivity({
    activities: [
      { id: 'a1', ...event },
      { id: 'a2', ...event },
    ],
    worklogs: [],
    merges: [],
  });
  expect(a.totals.events).toBe(2);
  expect(a.totals.loggedSeconds).toBe(0);
  expect(a.totals.mergedRequests).toBe(0);
  expect(a.rows).toHaveLength(2);
});
