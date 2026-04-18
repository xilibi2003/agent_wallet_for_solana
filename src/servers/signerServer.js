import cors from '@fastify/cors';
import Fastify from 'fastify';

import { registerAdminRoutes } from '../routes/admin.js';
import { registerExecuteRoutes } from '../routes/execute.js';
import { registerStatusRoutes } from '../routes/status.js';

export async function buildSignerServer(services) {
  const app = Fastify({
    logger: true,
  });

  await app.register(cors, {
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    origin(origin, callback) {
      if (!origin || services.config.cors.allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('CORS origin blocked'), false);
    },
  });

  await registerStatusRoutes(app, services);
  await registerAdminRoutes(app, services);
  await registerExecuteRoutes(app, services);

  return app;
}
