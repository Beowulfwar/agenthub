/**
 * Sync routes — POST /api/sync + GET /api/sync/stream (SSE)
 */

import path from 'node:path';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { requireConfig, getWorkspaceRegistry } from '../../core/config.js';
import { findWorkspaceManifest, loadWorkspaceManifest } from '../../core/workspace.js';
import { validateWorkspaceManifestSkills } from '../../core/workspace-catalog.js';
import { syncWorkspace } from '../../core/sync.js';
import type { SyncProgressEvent } from '../../core/types.js';
import { normalizeExternalPath } from '../../core/wsl.js';
import { createProvider } from '../../storage/factory.js';

export function syncRoutes(): Hono {
  const app = new Hono();

  // POST /api/sync — non-streaming, returns full SyncResult
  app.post('/', async (c) => {
    const config = await requireConfig();
    const body = await c.req.json<{
      force?: boolean;
      filter?: string[];
      dryRun?: boolean;
      filePath?: string;
    }>();

    const registry = await getWorkspaceRegistry();
    const manifestPath = body.filePath
      ? await normalizeExternalPath(body.filePath)
      : registry.active ?? await findWorkspaceManifest();
    if (!manifestPath) {
      return c.json(
        { error: { code: 'NO_MANIFEST', message: 'No workspace manifest found.' } },
        404,
      );
    }

    const manifest = await loadWorkspaceManifest(manifestPath);
    const provider = createProvider(config);
    await validateWorkspaceManifestSkills(manifest, provider, { filter: body.filter });
    const result = await syncWorkspace(manifest, config, {
      ...body,
      workspaceDir: path.dirname(manifestPath),
    });

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
        const pathParam = c.req.query('path');
        const filter = filterParam ? filterParam.split(',').map((s) => s.trim()) : undefined;

        const registry = await getWorkspaceRegistry();
        const manifestPath = pathParam
          ? await normalizeExternalPath(pathParam)
          : registry.active ?? await findWorkspaceManifest();
        if (!manifestPath) {
          await stream.writeSSE({
            event: 'error',
            data: JSON.stringify({ code: 'NO_MANIFEST', message: 'No workspace manifest found.' }),
          });
          return;
        }

        const manifest = await loadWorkspaceManifest(manifestPath);
        const provider = createProvider(config);
        await validateWorkspaceManifestSkills(manifest, provider, { filter });

        const result = await syncWorkspace(manifest, config, {
          force,
          dryRun,
          filter,
          workspaceDir: path.dirname(manifestPath),
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
