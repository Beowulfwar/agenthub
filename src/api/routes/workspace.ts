/**
 * Workspace routes — GET/PUT /api/workspace + registry endpoints
 */

import path from 'node:path';
import { Hono } from 'hono';
import {
  findWorkspaceManifestInDirectory,
  loadWorkspaceManifest,
  saveWorkspaceManifest,
  resolveManifestSkills,
} from '../../core/workspace.js';
import {
  inspectDeployTargets,
  loadConfig,
  getWorkspaceRegistry,
  registerWorkspace,
  unregisterWorkspace,
  setActiveWorkspace,
} from '../../core/config.js';
import { detectLocalSkills, suggestWorkspaceDirs } from '../../core/explorer.js';
import type { WorkspaceManifest, WorkspaceRegistryEntry } from '../../core/types.js';
import { ProviderNotConfiguredError } from '../../core/errors.js';
import {
  buildAdoptedManifestSkills,
  buildWorkspaceAgentInventories,
  buildWorkspaceCatalogEntry,
  loadProviderSkillIndex,
  validateWorkspaceManifestSkills,
} from '../../core/workspace-catalog.js';
import { buildWorkspaceAppInventories } from '../../core/app-artifacts.js';
import { normalizeExternalPath } from '../../core/wsl.js';
import { createProvider } from '../../storage/factory.js';

export function workspaceRoutes(): Hono {
  const app = new Hono();

  // -------------------------------------------------------------------------
  // Registry endpoints (must be registered BEFORE the catch-all GET /)
  // -------------------------------------------------------------------------

  // GET /api/workspace/registry — list all registered workspaces
  app.get('/registry', async (c) => {
    const registry = await getWorkspaceRegistry();
    const entries: WorkspaceRegistryEntry[] = [];
    const providerIndex = await loadOptionalProviderIndex();

    for (const filePath of registry.paths) {
      try {
        const manifest = await loadWorkspaceManifest(filePath);
        const catalog = await buildWorkspaceCatalogEntry({
          filePath,
          isActive: filePath === registry.active,
          manifest,
          providerIndex,
        });
        entries.push({
          filePath,
          workspaceDir: path.dirname(filePath),
          manifest,
          isActive: filePath === registry.active,
          skillCount: catalog.configuredSkillCount,
          configuredSkillCount: catalog.configuredSkillCount,
          detectedSkillCount: catalog.detectedSkillCount,
          configuredOnlyCount: catalog.configuredOnlyCount,
          detectedOnlyCount: catalog.detectedOnlyCount,
          missingInProviderCount: catalog.missingInProviderCount,
          driftCount: catalog.driftCount,
        });
      } catch (err) {
        const loadError = (err as Error).message;
        const catalog = await buildWorkspaceCatalogEntry({
          filePath,
          isActive: filePath === registry.active,
          manifest: null,
          loadError,
          providerIndex,
        });
        entries.push({
          filePath,
          workspaceDir: path.dirname(filePath),
          manifest: null,
          isActive: filePath === registry.active,
          skillCount: 0,
          configuredSkillCount: 0,
          detectedSkillCount: catalog.detectedSkillCount,
          configuredOnlyCount: 0,
          detectedOnlyCount: catalog.detectedOnlyCount,
          missingInProviderCount: 0,
          driftCount: catalog.driftCount,
          error: loadError,
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
      localSkillStrategy?: 'adopt' | 'ignore';
    }>();

    const fallbackName = body.name?.trim();
    let manifestPath: string;
    let created = false;
    let detectedSkillCount = 0;
    let adoptedSkillCount = 0;
    let ignoredSkillNames: string[] = [];

    if (body.directory) {
      const normalizedDir = await normalizeExternalPath(body.directory);
      const absDir = path.resolve(normalizedDir);
      const existingManifest = await findWorkspaceManifestInDirectory(absDir);
      const shouldCreate = body.create ?? true;

      if (existingManifest) {
        manifestPath = existingManifest;
      } else {
        if (!shouldCreate) {
          throw new Error(`No workspace manifest found in "${absDir}".`);
        }

        manifestPath = path.join(absDir, 'ahub.workspace.json');
        let adoptedSkills;

        if (body.localSkillStrategy === 'adopt') {
          const config = await loadConfig();
          if (!config) {
            throw new ProviderNotConfiguredError('storage');
          }

          const provider = createProvider(config);
          const adoption = await buildAdoptedManifestSkills(absDir, provider);
          adoptedSkills = adoption.skills;
          detectedSkillCount = adoption.detectedSkillCount;
          adoptedSkillCount = adoption.adoptedSkillCount;
          ignoredSkillNames = adoption.ignoredSkillNames;
        } else if (body.localSkillStrategy === 'ignore') {
          detectedSkillCount = new Set((await detectLocalSkills(absDir)).map((skill) => skill.name)).size;
        }

        const manifest: WorkspaceManifest = {
          version: 2,
          name: fallbackName || path.basename(absDir),
          defaultTargets: ['claude-code'],
          contents: adoptedSkills ?? [],
        };
        await saveWorkspaceManifest(manifestPath, manifest);
        created = true;
      }
    } else if (body.filePath) {
      const normalizedFile = await normalizeExternalPath(body.filePath);
      manifestPath = path.resolve(normalizedFile);

      if (body.create) {
        const manifest: WorkspaceManifest = {
          version: 2,
          name: fallbackName || path.basename(path.dirname(manifestPath)),
          defaultTargets: ['claude-code'],
          contents: [],
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
    return c.json({
      data: {
        registered: manifestPath,
        created,
        detectedSkillCount,
        adoptedSkillCount,
        ignoredSkillNames,
      },
    });
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

  // GET /api/workspace/suggestions — suggest workspace roots from detected local skills
  app.get('/suggestions', async (c) => {
    const suggestions = await suggestWorkspaceDirs();
    return c.json({ data: suggestions });
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
      const registry = await getWorkspaceRegistry();
      filePath = registry.active ?? null;
    }

    if (!filePath) {
      return c.json({
        data: {
          manifest: null,
          filePath: null,
          workspaceDir: null,
          resolved: [],
          targetDirectories: [],
          agents: [],
          apps: [],
        },
      });
    }

    const workspaceDir = path.dirname(filePath);
    const config = await loadConfig();
    const targetDirectories = await inspectDeployTargets(config, workspaceDir);
    const providerIndex = await loadOptionalProviderIndex();

    try {
      const manifest = await loadWorkspaceManifest(filePath);
      const resolved = resolveManifestSkills(manifest);
      const catalog = await buildWorkspaceCatalogEntry({
        filePath,
        isActive: false,
        manifest,
        providerIndex,
      });
      const agents = await buildWorkspaceAgentInventories({
        workspaceDir,
        manifest,
        targetDirectories,
        providerIndex,
      });
      const apps = await buildWorkspaceAppInventories(workspaceDir);
      return c.json({
        data: { manifest, filePath, workspaceDir, resolved, targetDirectories, agents, apps, catalog },
      });
    } catch (err) {
      // File might not exist anymore — return gracefully
      const loadError = (err as Error).message;
      const catalog = await buildWorkspaceCatalogEntry({
        filePath,
        isActive: false,
        manifest: null,
        loadError,
        providerIndex,
      });
      const agents = await buildWorkspaceAgentInventories({
        workspaceDir,
        manifest: null,
        targetDirectories,
        providerIndex,
      });
      const apps = await buildWorkspaceAppInventories(workspaceDir);
      return c.json({
        data: {
          manifest: null,
          filePath,
          workspaceDir,
          resolved: [],
          targetDirectories,
          agents,
          apps,
          catalog,
          error: loadError,
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
    const resolved = resolveManifestSkills(body.manifest);

    if (resolved.length > 0) {
      const config = await loadConfig();
      if (!config) {
        throw new ProviderNotConfiguredError('storage');
      }

      const provider = createProvider(config);
      await validateWorkspaceManifestSkills(body.manifest, provider);
    }

    await saveWorkspaceManifest(normalizedFile, body.manifest);

    return c.json({ data: { saved: normalizedFile } });
  });

  return app;
}

async function loadOptionalProviderIndex() {
  const config = await loadConfig();
  if (!config) {
    return undefined;
  }

  try {
    const provider = createProvider(config);
    return await loadProviderSkillIndex(provider);
  } catch {
    return undefined;
  }
}
