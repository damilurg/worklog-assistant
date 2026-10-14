import {
  demoGraph,
  demoActivity,
  edge,
  type Graph,
  type GraphNode,
  type GraphEdge,
} from '@worklog-assistant/shared';
import { buildActivity } from './activity-summary';
import type { Range } from './graph-query';
export function demoForRange(range: Range): Graph {
  const rows = demoActivity.rows.filter(
    (r) => r.timestamp.slice(0, 10) >= range.from && r.timestamp.slice(0, 10) <= range.to,
  );
  const limited = (source: string) => rows.filter((r) => r.source === source).slice(0, range.limit);
  const events = limited('activity_events'),
    logs = limited('jira_worklogs'),
    merges = limited('gitlab_merge_requests');
  const activity = buildActivity({
    activities: events.map((r) => ({
      id: r.id,
      type: r.type,
      occurredAt: new Date(r.timestamp),
      title: r.title,
      detectedIssueKeys: r.issueKeys,
      sourceUrl: r.url ?? null,
    })),
    worklogs: logs.map((r) => ({
      id: r.id,
      jiraIssueKey: r.issueKeys[0] ?? 'DEMO-1',
      startedAt: new Date(r.timestamp),
      durationSeconds: r.durationSeconds ?? 0,
      comment: r.title,
    })),
    merges: merges.map((r) => ({
      id: r.id,
      iid: 42,
      title: r.title,
      mergedAt: new Date(r.timestamp),
      webUrl: r.url ?? null,
    })),
  });
  const nodes = new Map<string, GraphNode>(),
    edges: GraphEdge[] = [];
  for (const row of activity.rows) {
    const id = `${row.source}:${row.id}`;
    const kind =
      row.source === 'jira_worklogs' ? 'worklog' : row.type === 'commit' ? 'commit' : 'mr';
    nodes.set(id, {
      id,
      kind,
      label:
        kind === 'worklog'
          ? `${((row.durationSeconds ?? 0) / 3600).toFixed(1)}h`
          : kind === 'commit'
            ? row.id.replace('demo-event-', 'c')
            : row.title.slice(0, 18),
      title: row.title,
      updatedAt: row.timestamp,
    });
    for (const key of row.issueKeys) {
      const issue = `issue:${key}`;
      if (!nodes.has(issue))
        nodes.set(
          issue,
          demoGraph.nodes.find((n) => n.id === issue) ?? {
            id: issue,
            kind: 'issue',
            label: key,
            title: 'Sample issue',
          },
        );
      edges.push(edge(id, issue, kind === 'worklog' ? 'logged' : 'implements'));
    }
  }
  return {
    mode: 'demo',
    range,
    activity,
    nodes: [...nodes.values()],
    edges,
    truncated: ['activity_events', 'jira_worklogs', 'gitlab_merge_requests'].some(
      (source) => rows.filter((r) => r.source === source).length > range.limit,
    ),
  };
}
