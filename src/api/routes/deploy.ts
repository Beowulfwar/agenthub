/**
 * Deploy routes — POST /api/deploy
 */

import path from 'node:path';
import { Hono } from 'hono';
import { getWorkspaceRegistry, requireConfig, resolveDeployTargetRoot } from '../../core/config.js';
import { findWorkspaceManifest } from '../../core/workspace.js';
import { createProvider } from '../../storage/factory.js';
import { createDeployer } from '../../deploy/deployer.js';
import type { DeployTarget, SyncDeployedEntry, SyncFailedEntry } from '../../core/types.js';

const VALID_TARGETS: ReadonlySet<string> = new Set<DeployTarget>([
  'claude-code',
  'codex',
  'cursor',
]);

export function deployRoutes(): Hono {
  const app = new Hono();

  // POST /api/deploy — deploy skill(s) to target(s)
  app.post('/', async (c) => {
    const body = await c.req.json<{
      skills: string[];
      targets: DeployTarget[];
    }>();

    // Validate targets.
    for (const t of body.targets) {
      if (!VALID_TARGETS.has(t)) {
        return c.json(
          { error: { code: 'INVALID_TARGET', message: `Invalid target: "${t}"` } },
          400,
        );
      }
    }

    if (!body.skills.length) {
      return c.json(
        { error: { code: 'VALIDATION_ERROR', message: 'At least one skill is required.' } },
        400,
      );
    }

    const config = await requireConfig();
    const provider = createProvider(config);
    const registry = await getWorkspaceRegistry();
    const manifestPath = registry.active ?? await findWorkspaceManifest();
    const workspaceDir = manifestPath ? path.dirname(manifestPath) : process.cwd();

    const deployed: SyncDeployedEntry[] = [];
    const failed: SyncFailedEntry[] = [];

    for (const skillName of body.skills) {
      let pkg;
      try {
        pkg = await provider.get(skillName);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        for (const target of body.targets) {
          failed.push({ skill: skillName, target, error: message });
        }
        continue;
      }

      for (const target of body.targets) {
        try {
          const deployRoot = resolveDeployTargetRoot(target, config, workspaceDir);
          const deployer = await createDeployer(target, deployRoot);
          const deployedPath = await deployer.deploy(pkg);
          deployed.push({ skill: skillName, target, path: deployedPath });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          failed.push({ skill: skillName, target, error: message });
        }
      }
    }

    return c.json({ data: { deployed, failed } });
  });

  return app;
}
