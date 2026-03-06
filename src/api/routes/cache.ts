/**
 * Cache routes — GET/DELETE /api/cache
 */

import { Hono } from 'hono';
import { CacheManager } from '../../core/cache.js';

export function cacheRoutes(): Hono {
  const app = new Hono();

  // GET /api/cache — list cached skills
  app.get('/', async (c) => {
    const cache = new CacheManager();
    const names = await cache.listCached();
    return c.json({ data: names });
  });

  // DELETE /api/cache — clear all cache
  app.delete('/', async (c) => {
    const cache = new CacheManager();
    await cache.clearCache();
    return c.json({ data: { cleared: true } });
  });

  return app;
}
