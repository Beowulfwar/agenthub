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
import { normalizeExternalPath } from '../../core/wsl.js';

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
      workspaceFilePath?: string;
      target?: DeployTarget;
      targets?: DeployTarget[];
    }>();

    const explicitTargets = body.target ? [body.target] : (body.targets ?? []);

    if (explicitTargets.length === 0) {
      return c.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Selecione ao menos um agente de destino.' } },
        400,
      );
    }

    // Validate targets.
    for (const t of explicitTargets) {
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
    const manifestPath = body.workspaceFilePath
      ? await normalizeExternalPath(body.workspaceFilePath)
      : registry.active ?? await findWorkspaceManifest();
    const workspaceDir = manifestPath ? path.dirname(manifestPath) : process.cwd();

    const deployed: SyncDeployedEntry[] = [];
    const failed: SyncFailedEntry[] = [];

    for (const skillName of body.skills) {
      let pkg;
      try {
        pkg = await provider.get(skillName);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        for (const target of explicitTargets) {
          failed.push({ skill: skillName, target, error: message });
        }
        continue;
      }

      for (const target of explicitTargets) {
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
