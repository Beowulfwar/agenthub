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
import { normalizeExternalPath } from '../../core/wsl.js';

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
    const body = await c.req.json<{
      filePath?: string;
      directory?: string;
      create?: boolean;
      name?: string;
    }>();

    const fallbackName = body.name?.trim();
    let manifestPath: string;
    let created = false;

    if (body.directory) {
      const normalizedDir = await normalizeExternalPath(body.directory);
      const absDir = path.resolve(normalizedDir);
      const existingManifest = await findWorkspaceManifest(absDir);

      if (existingManifest) {
        manifestPath = existingManifest;
      } else {
        if (!body.create) {
          throw new Error(`No workspace manifest found in "${absDir}".`);
        }

        manifestPath = path.join(absDir, 'ahub.workspace.json');
        const manifest: WorkspaceManifest = {
          version: 1,
          name: fallbackName || path.basename(absDir),
          defaultTargets: ['claude-code'],
          skills: [],
        };
        await saveWorkspaceManifest(manifestPath, manifest);
        created = true;
      }
    } else if (body.filePath) {
      const normalizedFile = await normalizeExternalPath(body.filePath);
      manifestPath = path.resolve(normalizedFile);

      if (body.create) {
        const manifest: WorkspaceManifest = {
          version: 1,
          name: fallbackName || path.basename(path.dirname(manifestPath)),
          defaultTargets: ['claude-code'],
          skills: [],
        };
        await saveWorkspaceManifest(manifestPath, manifest);
        created = true;
      } else {
        await loadWorkspaceManifest(manifestPath);
      }
    } else {
      throw new Error('Either "directory" or "filePath" is required.');
    }

    await registerWorkspace(manifestPath);
    return c.json({ data: { registered: manifestPath, created } });
  });

  // DELETE /api/workspace/registry — unregister a workspace
  app.delete('/registry', async (c) => {
    const body = await c.req.json<{ filePath: string }>();
    const normalizedFile = await normalizeExternalPath(body.filePath);
    await unregisterWorkspace(normalizedFile);
    return c.json({ data: { unregistered: normalizedFile } });
  });

  // PUT /api/workspace/active — set active workspace
  app.put('/active', async (c) => {
    const body = await c.req.json<{ filePath: string }>();
    const normalizedFile = await normalizeExternalPath(body.filePath);
    await setActiveWorkspace(normalizedFile);
    return c.json({ data: { active: normalizedFile } });
  });

  // -------------------------------------------------------------------------
  // Existing endpoints
  // -------------------------------------------------------------------------

  // GET /api/workspace — get active workspace manifest + resolved skills
  app.get('/', async (c) => {
    const customPath = c.req.query('path');

    let filePath: string | null;
    if (customPath) {
      filePath = await normalizeExternalPath(customPath);
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

    const normalizedFile = await normalizeExternalPath(body.filePath);
    await saveWorkspaceManifest(normalizedFile, body.manifest);

    return c.json({ data: { saved: normalizedFile } });
  });

  return app;
}
