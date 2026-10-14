import { MongoClient, type Collection } from 'mongodb';
import type { Graph } from '@worklog-assistant/shared';
import { readGraph, type Range } from './graph-query';

export interface GraphSnapshot {
  _id: string;
  graph: Graph;
  updatedAt: Date;
}
export interface SnapshotCollection {
  replaceOne(
    filter: { _id: string },
    snapshot: GraphSnapshot,
    options: { upsert: boolean },
  ): Promise<unknown>;
  findOne(filter: { _id: string }): Promise<GraphSnapshot | null>;
}
/** Reuses the CLI's PostgreSQL data; MongoDB owns the persisted graph projection. */
export class MongoGraphStore {
  constructor(
    private collection: SnapshotCollection,
    private source: (range: Range) => Promise<Graph> = readGraph,
  ) {}
  async read(range: Range): Promise<Graph> {
    const snapshot = await this.collection.findOne({
      _id: `${range.from}:${range.to}:${range.limit}`,
    });
    return snapshot?.graph ?? this.refresh(range);
  }
  async refresh(range: Range): Promise<Graph> {
    // Build before replacing: a failed CLI-data read preserves the previous snapshot.
    const graph = await this.source(range);
    const id = `${range.from}:${range.to}:${range.limit}`;
    await this.collection.replaceOne(
      { _id: id },
      { _id: id, graph: { ...graph, storage: 'mongodb' }, updatedAt: new Date() },
      { upsert: true },
    );
    const snapshot = await this.collection.findOne({ _id: id });
    if (!snapshot) throw new Error('MongoDB graph snapshot is unavailable');
    return snapshot.graph;
  }
}
let client: MongoClient | undefined;
let collectionPromise: Promise<Collection<GraphSnapshot>> | undefined;
async function collection(): Promise<Collection<GraphSnapshot>> {
  if (!collectionPromise) {
    client = new MongoClient(process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017', {
      serverSelectionTimeoutMS: 5000,
    });
    collectionPromise = client
      .connect()
      .then((c) =>
        c
          .db(process.env.MONGODB_DATABASE ?? 'worklog_graph')
          .collection<GraphSnapshot>('graph_snapshots'),
      )
      .catch(async (error) => {
        const failed = client;
        collectionPromise = undefined;
        client = undefined;
        await failed?.close();
        throw error;
      });
  }
  return collectionPromise;
}
const reads = new Map<string, Promise<Graph>>();
export async function readMongoGraph(range: Range): Promise<Graph> {
  const key = `${range.from}:${range.to}:${range.limit}`;
  let pending = reads.get(key);
  if (!pending) {
    pending = collection()
      .then((c) => new MongoGraphStore(c).read(range))
      .finally(() => {
        reads.delete(key);
      });
    reads.set(key, pending);
  }
  return pending;
}
export async function refreshMongoGraph(range: Range): Promise<Graph> {
  // Complete earlier projections before replacing the post-sync snapshot.
  await Promise.allSettled([...reads.values()]);
  const snapshots = await collection();
  const graph = await new MongoGraphStore(snapshots).refresh(range);
  // Other date ranges must rebuild once from the newly synchronized CLI data.
  await snapshots.deleteMany({ _id: { $ne: `${range.from}:${range.to}:${range.limit}` } });
  return graph;
}
export async function closeMongoGraph(): Promise<void> {
  await client?.close();
  client = undefined;
  collectionPromise = undefined;
}
