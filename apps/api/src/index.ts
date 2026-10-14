import { config } from '@worklog-assistant/config';
import { createServer } from './server';
void config;
const demo = process.argv.includes('--demo');
const fastify = createServer({ demo });
const start = async () => {
  try {
    const host = process.env.GRAPH_HOST ?? '127.0.0.1';
    const port = Number(process.env.PORT ?? 3000);
    if (!['127.0.0.1', 'localhost', '::1'].includes(host) && !process.env.GRAPH_API_KEY && !demo)
      throw new Error('Set GRAPH_API_KEY when binding API outside loopback');
    await fastify.listen({ port, host });
    console.log(`Development graph: http://localhost:${port}${demo ? ' (demo)' : ''}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};
start();
