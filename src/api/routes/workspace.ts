/**
 * Workspace routes — GET/PUT /api/workspace + registry endpoints
 */

import path from 'node:path';
import { Hono } from 'hono';
import {
  findWorkspaceManifest,
  loadWorkspaceManifest,
  saveWorkspaceManifest,
  resolveManifestSkills,
} from '../../core/workspace.js';
import {
  getWorkspaceRegistry,
  registerWorkspace,
  unregisterWorkspace,
  setActiveWorkspace,
} from '../../core/config.js';
import type { WorkspaceManifest, WorkspaceRegistryEntry } from '../../core/types.js';

export function workspaceRoutes(): Hono {
  const app = new Hono();

  // -------------------------------------------------------------------------
  // Registry endpoints (must be registered BEFORE the catch-all GET /)
  // -------------------------------------------------------------------------

  // GET /api/workspace/registry — list all registered workspaces
  app.get('/registry', async (c) => {
    const registry = await getWorkspaceRegistry();
    const entries: WorkspaceRegistryEntry[] = [];

    for (const filePath of registry.paths) {
      try {
        const manifest = await loadWorkspaceManifest(filePath);
        const resolved = resolveManifestSkills(manifest);
        entries.push({
          filePath,
          manifest,
          isActive: filePath === registry.active,
          skillCount: resolved.length,
        });
      } catch (err) {
        entries.push({
          filePath,
          manifest: null,
          isActive: filePath === registry.active,
          skillCount: 0,
          error: (err as Error).message,
        });
      }
    }

    return c.json({ data: entries });
  });

  // POST /api/workspace/registry — register (and optionally create) a workspace
  app.post('/registry', async (c) => {
    const body = await c.req.json<{ filePath: string; create?: boolean }>();
    const absPath = path.resolve(body.filePath);

    if (body.create) {
      const manifest: WorkspaceManifest = {
        version: 1,
        name: path.basename(path.dirname(absPath)),
        defaultTargets: ['claude-code'],
        skills: [],
      };
      await saveWorkspaceManifest(absPath, manifest);
    } else {
      // Validate the manifest exists and is loadable
      await loadWorkspaceManifest(absPath);
    }

    await registerWorkspace(absPath);
    return c.json({ data: { registered: absPath } });
  });

  // DELETE /api/workspace/registry — unregister a workspace
  app.delete('/registry', async (c) => {
    const body = await c.req.json<{ filePath: string }>();
    await unregisterWorkspace(body.filePath);
    return c.json({ data: { unregistered: body.filePath } });
  });

  // PUT /api/workspace/active — set active workspace
  app.put('/active', async (c) => {
    const body = await c.req.json<{ filePath: string }>();
    await setActiveWorkspace(body.filePath);
    return c.json({ data: { active: body.filePath } });
  });

  // -------------------------------------------------------------------------
  // Existing endpoints
  // -------------------------------------------------------------------------

  // GET /api/workspace — get active workspace manifest + resolved skills
  app.get('/', async (c) => {
    const customPath = c.req.query('path');

    let filePath: string | null;
    if (customPath) {
      filePath = customPath;
    } else {
      // Check active workspace in registry first, then fall back to cwd walk
      const registry = await getWorkspaceRegistry();
      if (registry.active) {
        filePath = registry.active;
      } else {
        filePath = await findWorkspaceManifest();
      }
    }

    if (!filePath) {
      return c.json({
        data: { manifest: null, filePath: null, resolved: [] },
      });
    }

    try {
      const manifest = await loadWorkspaceManifest(filePath);
      const resolved = resolveManifestSkills(manifest);
      return c.json({ data: { manifest, filePath, resolved } });
    } catch (err) {
      // File might not exist anymore — return gracefully
      return c.json({
        data: {
          manifest: null,
          filePath,
          resolved: [],
          error: (err as Error).message,
        },
      });
    }
  });

  // PUT /api/workspace — save workspace manifest
  app.put('/', async (c) => {
    const body = await c.req.json<{
      filePath: string;
      manifest: WorkspaceManifest;
    }>();

    await saveWorkspaceManifest(body.filePath, body.manifest);

    return c.json({ data: { saved: body.filePath } });
  });

  return app;
}
