/**
 * Workspace sync engine for agent-hub.
 *
 * Reads a workspace manifest, fetches skills from storage, and deploys
 * each to the target(s) declared in the manifest.  This module is
 * decoupled from the CLI so it can be reused by MCP tools and tests.
 */

import type {
  AhubConfig,
  SyncDeployedEntry,
  SyncFailedEntry,
  SyncOptions,
  SyncResult,
  WorkspaceManifest,
} from './types.js';
import { CacheManager } from './cache.js';
import { resolveDeployTargetRoot } from './config.js';
import { createProvider } from '../storage/factory.js';
import { createDeployer } from '../deploy/deployer.js';
import { resolveManifestSkills } from './workspace.js';

// ---------------------------------------------------------------------------
// Sync engine
// ---------------------------------------------------------------------------

/**
 * Execute a full workspace sync.
 *
 * 1. Resolve manifest into `{ skill, targets[] }` pairs.
 * 2. Fetch each skill from storage (uses cache when fresh).
 * 3. Deploy each skill to its designated target(s).
 *
 * @param manifest - The workspace manifest to sync.
 * @param config   - The global ahub config (storage provider).
 * @param options  - Sync options (force, filter, dryRun, progress).
 * @returns Aggregated sync result.
 */
export async function syncWorkspace(
  manifest: WorkspaceManifest,
  config: AhubConfig,
  options?: SyncOptions,
): Promise<SyncResult> {
  const force = options?.force ?? false;
  const dryRun = options?.dryRun ?? false;
  const workspaceDir = options?.workspaceDir;
  const onProgress = options?.onProgress;

  // 1. Resolve the manifest.
  let resolved = resolveManifestSkills(manifest);

  // 2. Apply filter if present.
  if (options?.filter && options.filter.length > 0) {
    const allowed = new Set(options.filter.map((f) => f.toLowerCase()));
    resolved = resolved.filter((r) => allowed.has(r.name.toLowerCase()));
  }

  if (resolved.length === 0) {
    return { deployed: [], failed: [], skipped: [] };
  }

  // 3. Set up provider and cache.
  const provider = createProvider(config);
  const cache = new CacheManager();

  // Count total deploy operations for progress reporting.
  const totalOps = resolved.reduce((sum, r) => sum + r.targets.length, 0);
  let currentOp = 0;

  const deployed: SyncDeployedEntry[] = [];
  const failed: SyncFailedEntry[] = [];
  const skipped: string[] = [];

  // 4. Fetch and deploy each skill.
  for (const { name, targets } of resolved) {
    // Fetch phase.
    onProgress?.({
      phase: 'fetch',
      skill: name,
      current: currentOp,
      total: totalOps,
    });

    let isFresh = false;
    if (!force) {
      isFresh = await cache.isFresh(name);
    }

    if (isFresh && !dryRun) {
      // Cache is fresh — use cached version.
      const cached = await cache.getCachedSkill(name);
      if (cached) {
        // Deploy from cache.
        for (const target of targets) {
          currentOp++;
          onProgress?.({
            phase: 'deploy',
            skill: name,
            target,
            current: currentOp,
            total: totalOps,
          });

          try {
            const deployRoot = resolveDeployTargetRoot(target, config, workspaceDir);
            const deployer = await createDeployer(target, deployRoot);
            const deployedPath = await deployer.deploy(cached);
            deployed.push({ skill: name, target, path: deployedPath });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            failed.push({ skill: name, target, error: msg });
          }
        }
        continue;
      }
      // Cache returned null despite isFresh — fall through to fetch.
    }

    if (dryRun) {
      for (const target of targets) {
        currentOp++;
        deployed.push({ skill: name, target, path: '(dry-run)' });
      }
      continue;
    }

    // Fetch from storage.
    try {
      const pkg = await provider.get(name);
      await cache.cacheSkill(pkg);

      // Deploy to each target.
      for (const target of targets) {
        currentOp++;
        onProgress?.({
          phase: 'deploy',
          skill: name,
          target,
          current: currentOp,
          total: totalOps,
        });

        try {
          const deployRoot = resolveDeployTargetRoot(target, config, workspaceDir);
          const deployer = await createDeployer(target, deployRoot);
          const deployedPath = await deployer.deploy(pkg);
          deployed.push({ skill: name, target, path: deployedPath });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          failed.push({ skill: name, target, error: msg });
        }
      }
    } catch (err) {
      // Fetch failed — record failure for all targets.
      const msg = err instanceof Error ? err.message : String(err);
      for (const target of targets) {
        currentOp++;
        failed.push({ skill: name, target, error: `Fetch failed: ${msg}` });
      }
    }
  }

  return { deployed, failed, skipped };
}
