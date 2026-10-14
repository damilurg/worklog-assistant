import Fastify from 'fastify';
import staticPlugin from '@fastify/static';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { timingSafeEqual } from 'node:crypto';
import { demoGraph } from '@worklog-assistant/shared';
import { parseRange, readGraph } from './graph-query';
export function createServer(
  options: {
    demo?: boolean;
    sync?: (from: string, to: string) => Promise<void>;
    read?: typeof readGraph;
    staticRoot?: string;
  } = {},
) {
  const app = Fastify({ logger: !options.demo });
  let syncing = false;
  app.get('/health', async () => ({
    status: 'ok',
    time: new Date().toISOString(),
    mode: options.demo ? 'demo' : 'live',
  }));
  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/api/')) return;
    const origin = req.headers.origin;
    if (origin) {
      try {
        if (new URL(origin).host !== req.headers.host)
          return reply.code(403).send({ error: 'Cross-origin API request rejected' });
      } catch {
        return reply.code(403).send({ error: 'Invalid origin' });
      }
    }
    const expected = process.env.GRAPH_API_KEY;
    if (expected && !options.demo) {
      const key = req.headers['x-api-key'];
      if (
        typeof key !== 'string' ||
        Buffer.byteLength(key) !== Buffer.byteLength(expected) ||
        !timingSafeEqual(Buffer.from(key), Buffer.from(expected))
      )
        return reply.code(401).send({ error: 'API key required' });
    }
  });
  app.get('/api/graph', async (req, reply) => {
    let range;
    try {
      range = parseRange(req.query as Record<string, unknown>);
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
    if (options.demo) return demoGraph;
    try {
      return await (options.read ?? readGraph)(range);
    } catch (e) {
      req.log.error(e);
      return reply
        .code(503)
        .send({ error: 'Database unavailable. Check PostgreSQL and schema setup.' });
    }
  });
  app.post('/api/sync', async (req, reply) => {
    let range;
    try {
      range = parseRange(req.query as Record<string, unknown>);
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
    if (options.demo) return demoGraph;
    if (syncing) return reply.code(409).send({ error: 'Sync already running' });
    syncing = true;
    try {
      if (options.sync) await options.sync(range.from, range.to);
      else
        await new Promise<void>((done, reject) => {
          execFile(
            process.execPath,
            [
              resolve(__dirname, '../../cli/dist/index.js'),
              'sync',
              '--from',
              range.from,
              '--to',
              range.to,
            ],
            { cwd: resolve(__dirname, '../../..'), timeout: 600000, maxBuffer: 10 * 1024 * 1024 },
            (error, stdout, stderr) => {
              if (stdout) req.log.info(stdout);
              if (stderr) req.log.warn(stderr);
              if (error) reject(error);
              else done();
            },
          );
        });
      return await (options.read ?? readGraph)(range);
    } catch (e) {
      req.log.error(e);
      return reply.code(503).send({ error: 'Sync failed; existing data remains available.' });
    } finally {
      syncing = false;
    }
  });
  const root = options.staticRoot ?? resolve(__dirname, '../../web/dist/browser');
  if (existsSync(root)) app.register(staticPlugin, { root });
  return app;
}
