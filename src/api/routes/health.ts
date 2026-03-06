/**
 * Health routes — GET /api/health
 */

import { Hono } from 'hono';
import { loadConfig, listSources } from '../../core/config.js';
import { createProvider } from '../../storage/factory.js';
import { CacheManager } from '../../core/cache.js';

export function healthRoutes(): Hono {
  const app = new Hono();

  app.get('/', async (c) => {
    const config = await loadConfig();

    if (!config) {
      return c.json({
        data: {
          configured: false,
          provider: null,
          providerHealth: null,
          cacheCount: 0,
        },
      });
    }

    const provider = createProvider(config);
    const health = await provider.healthCheck();
    const cache = new CacheManager();
    const cached = await cache.listCached();

    // v2: include source count
    let sourceCount = 0;
    try {
      const sources = await listSources();
      sourceCount = sources.length;
    } catch {
      sourceCount = config.provider ? 1 : 0;
    }

    const providerName = config.version === 2
      ? (config.sources?.find((s) => s.id === config.defaultSource)?.provider ?? provider.name)
      : config.provider;

    return c.json({
      data: {
        configured: true,
        provider: providerName,
        providerHealth: health,
        cacheCount: cached.length,
        sourceCount,
      },
    });
  });

  return app;
}
