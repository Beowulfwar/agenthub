/**
 * Sources routes — GET /api/sources
 */

import { Hono } from 'hono';
import { loadConfig, listSources } from '../../core/config.js';
import { createProviderFromSource } from '../../storage/factory.js';

export function sourcesRoutes(): Hono {
  const app = new Hono();

  // GET /api/sources — list all configured sources with health status
  app.get('/', async (c) => {
    const config = await loadConfig();
    const sources = await listSources();

    const items = await Promise.all(
      sources.map(async (src) => {
        let health = { ok: false, message: 'Unknown' };
        try {
          const provider = createProviderFromSource(src);
          health = await provider.healthCheck();
        } catch (err) {
          health = { ok: false, message: (err as Error).message };
        }

        return {
          id: src.id,
          label: src.label ?? null,
          provider: src.provider,
          enabled: src.enabled !== false,
          isDefault: config?.defaultSource === src.id,
          health,
        };
      }),
    );

    return c.json({ data: items });
  });

  return app;
}
