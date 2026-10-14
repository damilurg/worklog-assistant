import { describe, it, expect } from 'vitest';
import { buildGraph, type GraphInput } from '../src/graph-builder';
import { parseRange } from '../src/graph-query';
import { createServer } from '../src/server';
const input: GraphInput = {
  projects: [],
  commits: [
    {
      projectId: '1',
      sha: 'abc',
      shortSha: 'abc',
      message: 'DEV-42 session timeout',
      authorName: 'Marat',
      authorEmail: 'm@example.test',
      webUrl: null,
      committedAt: new Date('2026-10-01'),
    },
  ],
  mergeRequests: [
    {
      projectId: '1',
      iid: 2,
      title: 'Session',
      description: null,
      sourceBranch: 'DEV-42-session',
      state: 'opened',
      webUrl: null,
      updatedAt: new Date('2026-10-01'),
    },
  ],
  activities: [
    {
      projectId: '1',
      commitSha: null,
      mergeRequestId: '7',
      detectedIssueKeys: ['DEV-42'],
      sourceUrl: null,
      title: 'Reviewed MR',
    },
  ],
  issues: [{ key: 'DEV-42', summary: 'Session security' }],
  worklogs: [
    {
      id: 'w1',
      jiraIssueKey: 'DEV-42',
      author: 'Marat',
      authorAccountId: 'a1',
      authorEmail: null,
      durationSeconds: 3600,
      startedAt: new Date('2026-10-01'),
      comment: null,
    },
  ],
};
describe('graph projection', () => {
  it('connects stored records, branch keys, review-only MRs and worklogs', () => {
    const g = buildGraph(input);
    expect(g.nodes.find((n) => n.id === 'issue:DEV-42')?.title).toBe('Session security');
    expect(g.edges).toContainEqual(expect.objectContaining({ from: 'mr:1:2', to: 'issue:DEV-42' }));
    expect(g.nodes.some((n) => n.id === 'mr:1:7')).toBe(true);
    expect(g.edges).toContainEqual(
      expect.objectContaining({ from: 'worklog:w1', to: 'issue:DEV-42', type: 'logged' }),
    );
    const ids = new Set(g.nodes.map((n) => n.id));
    expect(g.edges.every((e) => ids.has(e.from) && ids.has(e.to))).toBe(true);
    expect(g.nodes.filter((n) => n.kind === 'person')).toHaveLength(2);
  });
  it('does not invent commit-to-MR membership', () => {
    const g = buildGraph(input);
    expect(g.edges.some((e) => e.from.startsWith('mr:') && e.to.startsWith('commit:'))).toBe(false);
  });
  it('handles an empty database', () =>
    expect(
      buildGraph({
        ...input,
        commits: [],
        mergeRequests: [],
        activities: [],
        issues: [],
        worklogs: [],
      }).nodes,
    ).toEqual([]));
});
describe('API', () => {
  it('rejects malformed dates and bounds resource limits', () => {
    expect(() => parseRange({ from: '2026-02-30' })).toThrow();
    expect(() => parseRange({ from: '2026-10-03', to: '2026-10-01' })).toThrow();
    expect(() => parseRange({ limit: 501 })).toThrow();
  });
  it('serves demo without calling the database', async () => {
    const app = createServer({ demo: true });
    const res = await app.inject('/api/graph');
    expect(res.statusCode).toBe(200);
    expect(res.json().mode).toBe('demo');
    expect((await app.inject('/api/graph?from=bad')).statusCode).toBe(400);
    await app.close();
  });
  it('rejects cross-origin writes before syncing', async () => {
    let calls = 0;
    const app = createServer({
      sync: async () => {
        calls++;
      },
      read: async () => buildGraph(input),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/sync',
      headers: { origin: 'https://evil.test', host: 'localhost:3000' },
    });
    expect(res.statusCode).toBe(403);
    expect(calls).toBe(0);
    await app.close();
  });
  it('rejects overlapping sync requests', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    let started!: () => void;
    const ready = new Promise<void>((r) => {
      started = r;
    });
    const app = createServer({
      sync: async () => {
        started();
        await gate;
      },
      read: async () => buildGraph(input),
    });
    const first = app.inject({ method: 'POST', url: '/api/sync' });
    await ready;
    const second = await app.inject({ method: 'POST', url: '/api/sync' });
    expect(second.statusCode).toBe(409);
    release();
    expect((await first).statusCode).toBe(200);
    await app.close();
  });
});
