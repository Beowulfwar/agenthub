/**
 * Sync routes — POST /api/sync + GET /api/sync/stream (SSE)
 */

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { requireConfig, getWorkspaceRegistry } from '../../core/config.js';
import { findWorkspaceManifest, loadWorkspaceManifest } from '../../core/workspace.js';
import { syncWorkspace } from '../../core/sync.js';
import type { SyncProgressEvent } from '../../core/types.js';

export function syncRoutes(): Hono {
  const app = new Hono();

  // POST /api/sync — non-streaming, returns full SyncResult
  app.post('/', async (c) => {
    const config = await requireConfig();
    const body = await c.req.json<{
      force?: boolean;
      filter?: string[];
      dryRun?: boolean;
    }>();

    const registry = await getWorkspaceRegistry();
    const manifestPath = registry.active ?? await findWorkspaceManifest();
    if (!manifestPath) {
      return c.json(
        { error: { code: 'NO_MANIFEST', message: 'No workspace manifest found.' } },
        404,
      );
    }

    const manifest = await loadWorkspaceManifest(manifestPath);
    const result = await syncWorkspace(manifest, config, body);

    return c.json({ data: result });
  });

  // GET /api/sync/stream — SSE streaming of sync progress
  app.get('/stream', (c) => {
    return streamSSE(c, async (stream) => {
      try {
        const config = await requireConfig();
        const force = c.req.query('force') === 'true';
        const dryRun = c.req.query('dryRun') === 'true';
        const filterParam = c.req.query('filter');
        const filter = filterParam ? filterParam.split(',').map((s) => s.trim()) : undefined;

        const registry = await getWorkspaceRegistry();
        const manifestPath = registry.active ?? await findWorkspaceManifest();
        if (!manifestPath) {
          await stream.writeSSE({
            event: 'error',
            data: JSON.stringify({ code: 'NO_MANIFEST', message: 'No workspace manifest found.' }),
          });
          return;
        }

        const manifest = await loadWorkspaceManifest(manifestPath);

        const result = await syncWorkspace(manifest, config, {
          force,
          dryRun,
          filter,
          onProgress: async (event: SyncProgressEvent) => {
            await stream.writeSSE({
              event: 'progress',
              data: JSON.stringify(event),
            });
          },
        });

        await stream.writeSSE({
          event: 'complete',
          data: JSON.stringify(result),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await stream.writeSSE({
          event: 'error',
          data: JSON.stringify({ code: 'SYNC_ERROR', message }),
        });
      }
    });
  });

  return app;
}
