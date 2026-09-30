import Fastify from 'fastify';

const fastify = Fastify({ logger: true });

fastify.get('/health', async () => {
  return { status: 'ok', time: new Date().toISOString() };
});

const start = async () => {
  try {
    await fastify.listen({ port: 3000, host: '0.0.0.0' });
    fastify.log.info(`Server listening on port 3000`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
