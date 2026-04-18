import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { fileURLToPath } from 'node:url';

const uiRoot = fileURLToPath(new URL('../ui/', import.meta.url));

export async function buildDashboardServer(config) {
  const app = Fastify({
    logger: true,
  });

  app.get('/config.js', async (_request, reply) => {
    const apiBaseUrl = `http://localhost:${config.api.port}`;
    reply.type('application/javascript');
    return `window.__SAW_CONFIG__ = ${JSON.stringify({ apiBaseUrl })};`;
  });

  await app.register(fastifyStatic, {
    root: uiRoot,
    index: 'index.html',
  });

  return app;
}
