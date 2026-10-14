import {
  edge,
  extractJiraKeys,
  type Graph,
  type GraphNode,
  type GraphEdge,
} from '@worklog-assistant/shared';
export interface GraphInput {
  projects: { id: string; name: string }[];
  commits: {
    projectId: string;
    sha: string;
    shortSha: string;
    message: string;
    authorName: string | null;
    authorEmail: string | null;
    webUrl: string | null;
    committedAt: Date;
  }[];
  mergeRequests: {
    projectId: string;
    iid: number;
    title: string;
    description: string | null;
    sourceBranch: string;
    state: string;
    webUrl: string | null;
    updatedAt: Date;
  }[];
  activities: {
    projectId: string;
    commitSha: string | null;
    mergeRequestId: string | null;
    detectedIssueKeys: string[];
    sourceUrl: string | null;
    title: string;
  }[];
  issues: { key: string; summary: string | null }[];
  worklogs: {
    id: string;
    jiraIssueKey: string;
    author: string;
    authorAccountId: string | null;
    authorEmail: string | null;
    durationSeconds: number;
    startedAt: Date;
    comment: string | null;
  }[];
  jiraUrl?: string;
}
export function buildGraph(input: GraphInput): Graph {
  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, GraphEdge>();
  const add = (n: GraphNode) => nodes.set(n.id, n);
  const link = (from: string, to: string, type: GraphEdge['type']) => {
    const e = edge(from, to, type);
    edges.set(e.id, e);
  };
  const issueTitles = new Map(input.issues.map((i) => [i.key, i.summary]));
  const issue = (key: string) => {
    const id = `issue:${key}`;
    if (!nodes.has(id))
      add({
        id,
        kind: 'issue',
        label: key,
        title: issueTitles.get(key) || 'Issue details have not been synced from Jira',
        url: input.jiraUrl
          ? `${input.jiraUrl.replace(/\/$/, '')}/browse/${encodeURIComponent(key)}`
          : undefined,
      });
    return id;
  };
  const project = (pid: string) => {
    const id = `repo:${pid}`;
    if (!nodes.has(id))
      add({
        id,
        kind: 'repository',
        label: input.projects.find((p) => p.id === pid)?.name || `Project ${pid}`,
        title: `GitLab project ${pid}`,
      });
    return id;
  };
  const matches = (id: string, text: string) => {
    for (const key of extractJiraKeys(text)) link(id, issue(key), 'implements');
  };
  for (const c of input.commits) {
    const id = `commit:${c.projectId}:${c.sha}`;
    add({
      id,
      kind: 'commit',
      label: c.shortSha,
      title: c.message.split('\n')[0],
      url: c.webUrl ?? undefined,
      updatedAt: c.committedAt.toISOString(),
    });
    link(project(c.projectId), id, 'contains');
    matches(id, c.message);
    if (c.authorEmail || c.authorName) {
      const person = `person:gitlab:${c.authorEmail || c.authorName}`;
      add({
        id: person,
        kind: 'person',
        label: c.authorName || 'Commit author',
        title: 'GitLab commit author',
      });
      link(person, id, 'authored');
    }
  }
  for (const m of input.mergeRequests) {
    const id = `mr:${m.projectId}:${m.iid}`;
    add({
      id,
      kind: 'mr',
      label: `!${m.iid}`,
      title: m.title,
      status: m.state,
      url: m.webUrl ?? undefined,
      updatedAt: m.updatedAt.toISOString(),
    });
    link(project(m.projectId), id, 'contains');
    matches(id, `${m.title} ${m.description ?? ''} ${m.sourceBranch}`);
  }
  for (const a of input.activities) {
    const id = a.commitSha
      ? `commit:${a.projectId}:${a.commitSha}`
      : a.mergeRequestId
        ? `mr:${a.projectId}:${a.mergeRequestId}`
        : undefined;
    if (!id) continue;
    if (!nodes.has(id)) {
      add({
        id,
        kind: a.commitSha ? 'commit' : 'mr',
        label: a.commitSha ? a.commitSha.slice(0, 8) : `!${a.mergeRequestId}`,
        title: a.title,
        url: a.sourceUrl ?? undefined,
      });
      link(project(a.projectId), id, 'contains');
    }
    for (const key of a.detectedIssueKeys) link(id, issue(key), 'implements');
  }
  for (const w of input.worklogs) {
    const id = `worklog:${w.id}`;
    add({
      id,
      kind: 'worklog',
      label: `${(w.durationSeconds / 3600).toFixed(1)}h`,
      title: w.comment || `Worklog · ${w.startedAt.toISOString().slice(0, 10)}`,
      updatedAt: w.startedAt.toISOString(),
    });
    link(id, issue(w.jiraIssueKey), 'logged');
    const person = `person:jira:${w.authorAccountId || w.authorEmail || w.author}`;
    add({ id: person, kind: 'person', label: w.author, title: 'Jira worklog author' });
    link(person, id, 'authored');
  }
  return { mode: 'live', nodes: [...nodes.values()], edges: [...edges.values()] };
}
