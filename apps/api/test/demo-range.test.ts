import { it, expect } from 'vitest';
import { demoForRange } from '../src/demo-range';
import { createServer } from '../src/server';
it('filters sample graphs, charts and source ledger to the requested dates', () => {
  const g = demoForRange({ from: '2026-10-13', to: '2026-10-14', limit: 100 });
  expect(g.activity?.daily.map((d) => d.date)).toEqual(['2026-10-13', '2026-10-14']);
  expect(g.activity?.totals.events).toBe(12);
  expect(g.activity?.rows.every((r) => r.timestamp.slice(0, 10) >= '2026-10-13')).toBe(true);
  expect(
    g.nodes.filter((n) => n.updatedAt).every((n) => n.updatedAt!.slice(0, 10) >= '2026-10-13'),
  ).toBe(true);
});
it('returns genuinely empty sample data for dates without records', () => {
  const g = demoForRange({ from: '2026-11-01', to: '2026-11-02', limit: 100 });
  expect(g.nodes).toHaveLength(0);
  expect(g.activity?.rows).toHaveLength(0);
  expect(g.activity?.totals.loggedSeconds).toBe(0);
});
it('applies the date range to both GET and POST demo endpoints', async () => {
  const app = createServer({ demo: true });
  for (const method of ['GET', 'POST'] as const) {
    const res = await app.inject({
      method,
      url: `/api/${method === 'POST' ? 'sync' : 'graph'}?from=2026-10-14&to=2026-10-14`,
    });
    expect(res.json().activity.daily.map((d: { date: string }) => d.date)).toEqual(['2026-10-14']);
    expect(res.json().range.from).toBe('2026-10-14');
  }
  await app.close();
});
