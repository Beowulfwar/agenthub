/**
 * Config routes — GET/PUT /api/config
 */

import { Hono } from 'hono';
import { loadConfig, getConfigValue, setConfigValue } from '../../core/config.js';

export function configRoutes(): Hono {
  const app = new Hono();

  // GET /api/config — full config
  app.get('/', async (c) => {
    const config = await loadConfig();
    return c.json({ data: config });
  });

  // GET /api/config/:key — get by dot-path
  app.get('/:key{.+}', async (c) => {
    const key = c.req.param('key');
    const value = await getConfigValue(key);
    return c.json({ data: { key, value } });
  });

  // PUT /api/config/:key — set by dot-path
  app.put('/:key{.+}', async (c) => {
    const key = c.req.param('key');
    const body = await c.req.json<{ value: unknown }>();
    await setConfigValue(key, body.value);
    return c.json({ data: { key, value: body.value } });
  });

  return app;
}
