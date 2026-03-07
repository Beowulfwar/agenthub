import { Hono } from 'hono';

import { listAgentApps } from '../../core/app-registry.js';

export function appsRoutes(): Hono {
  const app = new Hono();

  app.get('/catalog', async (c) => {
    return c.json({ data: listAgentApps() });
  });

  return app;
}
