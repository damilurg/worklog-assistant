import { describe, it, expect, vi } from 'vitest';
import { demoGraph, type Graph } from '@worklog-assistant/shared';
import { MongoGraphStore, type GraphSnapshot } from '../src/mongo-graph';
import { createServer } from '../src/server';
const range = { from: '2026-10-01', to: '2026-10-14', limit: 100 };
describe('MongoDB graph projection', () => {
  it('persists a date-scoped graph and returns the MongoDB snapshot', async () => {
    let stored: GraphSnapshot | null = null;
    const collection = {
      replaceOne: vi.fn(async (_filter, snapshot: GraphSnapshot) => {
        stored = snapshot;
      }),
      findOne: vi.fn(async () => stored),
    };
    const store = new MongoGraphStore(collection, async () => ({ ...demoGraph, mode: 'live' }));
    const result = await store.refresh(range);
    expect(collection.replaceOne).toHaveBeenCalledWith(
      { _id: '2026-10-01:2026-10-14:100' },
      expect.objectContaining({ graph: expect.objectContaining({ storage: 'mongodb' }) }),
      { upsert: true },
    );
    expect(result.storage).toBe('mongodb');
    expect(collection.findOne).toHaveBeenCalledWith({ _id: '2026-10-01:2026-10-14:100' });
  });
  it('does not overwrite persisted data when the CLI database read fails', async () => {
    const collection = { replaceOne: vi.fn(), findOne: vi.fn() };
    const store = new MongoGraphStore(collection, async () => {
      throw new Error('PostgreSQL offline');
    });
    await expect(store.refresh(range)).rejects.toThrow('PostgreSQL offline');
    expect(collection.replaceOne).not.toHaveBeenCalled();
  });
  it('surfaces MongoDB failures instead of pretending persistence succeeded', async () => {
    const collection = {
      replaceOne: vi.fn(async () => {
        throw new Error('MongoDB offline');
      }),
      findOne: vi.fn(),
    };
    await expect(
      new MongoGraphStore(collection, async () => demoGraph).refresh(range),
    ).rejects.toThrow('MongoDB offline');
  });
  it('serves the local API with no browser API key, even with a legacy key in the environment', async () => {
    const previous = process.env.GRAPH_API_KEY;
    process.env.GRAPH_API_KEY = 'legacy-config';
    try {
      const app = createServer({
        read: async (): Promise<Graph> => ({ ...demoGraph, mode: 'live', storage: 'mongodb' }),
      });
      const res = await app.inject('/api/graph');
      expect(res.statusCode).toBe(200);
      expect(res.json().storage).toBe('mongodb');
      await app.close();
    } finally {
      if (previous === undefined) delete process.env.GRAPH_API_KEY;
      else process.env.GRAPH_API_KEY = previous;
    }
  });
  it('rejects non-localhost host headers to prevent DNS rebinding', async () => {
    const app = createServer({ demo: true });
    const res = await app.inject({ url: '/api/graph', headers: { host: 'attacker.example' } });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

it('reads existing MongoDB snapshots without querying the CLI database', async () => {
  const source = vi.fn(async () => demoGraph);
  const saved = {
    _id: '2026-10-01:2026-10-14:100',
    graph: { ...demoGraph, storage: 'mongodb' as const },
    updatedAt: new Date(),
  };
  const collection = { findOne: vi.fn(async () => saved), replaceOne: vi.fn() };
  const graph = await new MongoGraphStore(collection, source).read(range);
  expect(graph).toEqual(saved.graph);
  expect(source).not.toHaveBeenCalled();
  expect(collection.replaceOne).not.toHaveBeenCalled();
});
it('builds a missing projection once, then serves it from MongoDB', async () => {
  let saved: GraphSnapshot | null = null;
  const source = vi.fn(async () => demoGraph);
  const collection = {
    findOne: vi.fn(async () => saved),
    replaceOne: vi.fn(async (_filter, snapshot: GraphSnapshot) => {
      saved = snapshot;
    }),
  };
  const store = new MongoGraphStore(collection, source);
  await store.read(range);
  await store.read(range);
  expect(source).toHaveBeenCalledTimes(1);
  expect(collection.replaceOne).toHaveBeenCalledTimes(1);
});
