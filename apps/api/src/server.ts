import Fastify from 'fastify';
import staticPlugin from '@fastify/static';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { demoForRange } from './demo-range';
import { parseRange, type readGraph } from './graph-query';
import { readMongoGraph, refreshMongoGraph, closeMongoGraph } from './mongo-graph';
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
    const hostname = req.hostname;
    if (!['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname))
      return reply.code(403).send({ error: 'This API is available through localhost only' });
    const origin = req.headers.origin;
    if (origin) {
      try {
        if (new URL(origin).host !== req.headers.host)
          return reply.code(403).send({ error: 'Cross-origin API request rejected' });
      } catch {
        return reply.code(403).send({ error: 'Invalid origin' });
      }
    }
  });
  app.get('/api/graph', async (req, reply) => {
    let range;
    try {
      range = parseRange(req.query as Record<string, unknown>);
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
    if (options.demo) return demoForRange(range);
    try {
      return await (options.read ?? readMongoGraph)(range);
    } catch (e) {
      req.log.error(e);
      return reply.code(503).send({
        error:
          'Graph storage unavailable. Check MongoDB, PostgreSQL and the existing CLI database setup.',
      });
    }
  });
  app.post('/api/sync', async (req, reply) => {
    let range;
    try {
      range = parseRange(req.query as Record<string, unknown>);
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
    if (options.demo) return demoForRange(range);
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
      return await (options.read ?? refreshMongoGraph)(range);
    } catch (e) {
      req.log.error(e);
      return reply.code(503).send({ error: 'Sync failed; existing data remains available.' });
    } finally {
      syncing = false;
    }
  });
  const root = options.staticRoot ?? resolve(__dirname, '../../web/dist/browser');
  if (existsSync(root)) app.register(staticPlugin, { root });
  app.addHook('onClose', async () => {
    await closeMongoGraph();
  });
  return app;
}
