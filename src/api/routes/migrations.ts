import path from 'node:path';
import { Hono } from 'hono';

import { getWorkspaceRegistry } from '../../core/config.js';
import { planAppMigration } from '../../core/app-migration.js';
import type { AgentAppId } from '../../core/types.js';
import { normalizeExternalPath } from '../../core/wsl.js';

export function migrationsRoutes(): Hono {
  const app = new Hono();

  app.post('/plan', async (c) => {
    const body = await c.req.json<{
      workspaceDir?: string;
      fromApp: AgentAppId;
      toApp: AgentAppId;
      skill?: string;
      all?: boolean;
    }>();

    const workspaceDir = body.workspaceDir
      ? await normalizeExternalPath(body.workspaceDir)
      : await resolveDefaultWorkspaceDir();

    const plan = await planAppMigration({
      workspaceDir,
      fromApp: body.fromApp,
      toApp: body.toApp,
      ...(body.skill ? { skill: body.skill } : {}),
      ...(body.all ? { all: true } : {}),
    });

    return c.json({ data: plan });
  });

  return app;
}

async function resolveDefaultWorkspaceDir(): Promise<string> {
  const registry = await getWorkspaceRegistry();
  if (registry.active) {
    return path.dirname(registry.active);
  }

  return process.cwd();
}
