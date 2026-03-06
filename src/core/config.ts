/**
 * Configuration manager for agent-hub.
 *
 * Reads and writes the user-level config stored at `~/.ahub/config.json`.
 * Supports both v1 (legacy single-provider) and v2 (multi-source) formats.
 * All file-system operations use `node:fs/promises` for a fully async API.
 */

import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { AhubConfig, DeployTarget, SourceConfig } from './types.js';

// ---------------------------------------------------------------------------
// Well-known paths
// ---------------------------------------------------------------------------

/** Root directory for all ahub user data (`~/.ahub/`). */
export const AHUB_DIR: string = path.join(os.homedir(), '.ahub');

/** Full path to the configuration file (`~/.ahub/config.json`). */
export const CONFIG_PATH: string = path.join(AHUB_DIR, 'config.json');

// ---------------------------------------------------------------------------
// Directory helpers
// ---------------------------------------------------------------------------

/**
 * Create `~/.ahub/` (and any parents) if it does not already exist.
 */
export async function ensureAhubDir(): Promise<void> {
  await mkdir(AHUB_DIR, { recursive: true });
}

// ---------------------------------------------------------------------------
// Config format detection & migration
// ---------------------------------------------------------------------------

/**
 * Check whether a config is v1 (legacy single-provider) format.
 */
export function isLegacyConfig(config: AhubConfig): boolean {
  return !config.version || config.version === 1;
}

/**
 * Convert a v1 config to v2 format in memory (does NOT persist to disk).
 * If the config is already v2, returns it as-is.
 */
export function migrateConfigToV2(config: AhubConfig): AhubConfig {
  if (!isLegacyConfig(config)) return config;

  const provider = config.provider;
  if (!provider) return config;

  const source: SourceConfig = {
    id: 'default',
    label: provider === 'git' ? 'Git Repository' : 'Google Drive',
    provider,
    git: config.git,
    drive: config.drive,
    enabled: true,
  };

  return {
    version: 2,
    sources: [source],
    defaultSource: 'default',
    deployTargets: config.deployTargets,
  };
}

// ---------------------------------------------------------------------------
// Config I/O
// ---------------------------------------------------------------------------

/**
 * Load the configuration from `~/.ahub/config.json`.
 *
 * Accepts both v1 (legacy) and v2 (multi-source) formats.
 *
 * @returns The parsed `AhubConfig`, or `null` when the file does not exist
 *   or does not contain a valid config shape.
 */
export async function loadConfig(): Promise<AhubConfig | null> {
  try {
    const raw = await readFile(CONFIG_PATH, 'utf-8');
    const parsed: unknown = JSON.parse(raw);

    if (typeof parsed !== 'object' || parsed === null) return null;

    const obj = parsed as Record<string, unknown>;

    // v2: has version === 2 and a sources array
    if (obj.version === 2 && Array.isArray(obj.sources)) {
      return parsed as AhubConfig;
    }

    // v1: provider must be a known value
    if (obj.provider === 'git' || obj.provider === 'drive') {
      return parsed as AhubConfig;
    }

    return null;
  } catch (err: unknown) {
    // File does not exist or is unreadable.
    if (isNodeError(err) && err.code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}

/**
 * Load config and always return v2 format.
 * Auto-migrates v1 configs in memory (does not write to disk).
 *
 * @returns v2 config or null if no config exists.
 */
export async function loadConfigV2(): Promise<AhubConfig | null> {
  const cfg = await loadConfig();
  if (!cfg) return null;
  return isLegacyConfig(cfg) ? migrateConfigToV2(cfg) : cfg;
}

/**
 * Persist the given config to `~/.ahub/config.json`.
 *
 * Creates the `~/.ahub/` directory when it does not exist yet.
 *
 * @param config - The configuration object to write.
 */
export async function saveConfig(config: AhubConfig): Promise<void> {
  await ensureAhubDir();
  const content = JSON.stringify(config, null, 2) + '\n';
  await writeFile(CONFIG_PATH, content, 'utf-8');
}

// ---------------------------------------------------------------------------
// Deploy-target defaults
// ---------------------------------------------------------------------------

/**
 * Return the conventional default deploy paths for each supported target.
 *
 * These paths follow each tool's standard directory:
 *
 * | Target       | Path                    |
 * |------------- |-------------------------|
 * | claude-code  | `~/.claude/commands/`   |
 * | codex        | `~/.codex/skills/`      |
 * | cursor       | `~/.cursor/rules/`      |
 */
export function getDefaultDeployPaths(): Record<DeployTarget, string> {
  const home = os.homedir();
  return {
    'claude-code': path.join(home, '.claude', 'commands'),
    codex: path.join(home, '.codex', 'skills'),
    cursor: path.join(home, '.cursor', 'rules'),
  };
}

// ---------------------------------------------------------------------------
// Convenience wrappers (used by CLI commands)
// ---------------------------------------------------------------------------

/**
 * Load config or throw if not initialised.
 *
 * Convenience wrapper for commands that require a configured provider.
 */
export async function requireConfig(): Promise<AhubConfig> {
  const cfg = await loadConfig();
  if (!cfg) {
    throw new Error(
      'No configuration found. Run "ahub init" to set up a storage backend.',
    );
  }
  return cfg;
}

/**
 * Read a nested config value using dot notation (e.g. "git.branch").
 * Returns `undefined` when the key path does not exist.
 */
export async function getConfigValue(key: string): Promise<unknown> {
  const cfg = await loadConfig();
  if (!cfg) return undefined;

  const parts = key.split('.');
  let current: unknown = cfg;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Set a nested config value using dot notation and persist.
 * Intermediate objects are created as needed.
 */
export async function setConfigValue(key: string, value: unknown): Promise<void> {
  const cfg = await loadConfig();
  if (!cfg) {
    throw new Error('No configuration found. Run "ahub init" first.');
  }
  const parts = key.split('.');
  let current: Record<string, unknown> = cfg as unknown as Record<string, unknown>;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!;
    if (typeof current[part] !== 'object' || current[part] === null) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }

  const lastKey = parts[parts.length - 1]!;
  current[lastKey] = value;

  // Validate the mutated config — accept both v1 and v2.
  const mutated = cfg as unknown as Record<string, unknown>;
  const isV2 = mutated.version === 2 && Array.isArray(mutated.sources);
  const isV1 = mutated.provider === 'git' || mutated.provider === 'drive';
  if (!isV1 && !isV2) {
    throw new Error(
      'Invalid config: must have provider "git"/"drive" (v1) or version 2 with sources array (v2).',
    );
  }

  await saveConfig(cfg as unknown as AhubConfig);
}

// ---------------------------------------------------------------------------
// Source management (v2)
// ---------------------------------------------------------------------------

/**
 * Ensure the config is v2 format, persisting the migration if needed.
 * Creates a fresh v2 config if no config exists.
 */
async function ensureV2Config(): Promise<AhubConfig> {
  const cfg = await loadConfig();

  if (!cfg) {
    // No config at all — create empty v2
    const fresh: AhubConfig = { version: 2, sources: [] };
    await saveConfig(fresh);
    return fresh;
  }

  if (isLegacyConfig(cfg)) {
    const migrated = migrateConfigToV2(cfg);
    await saveConfig(migrated);
    return migrated;
  }

  return cfg;
}

/**
 * Add a new source to the config.
 * Throws if a source with the same ID already exists.
 */
export async function addSource(source: SourceConfig): Promise<void> {
  const cfg = await ensureV2Config();
  const sources = cfg.sources ?? [];

  if (sources.some((s) => s.id === source.id)) {
    throw new Error(`Source "${source.id}" already exists. Remove it first or use a different ID.`);
  }

  sources.push(source);
  cfg.sources = sources;

  // Set as default if it's the first/only source
  if (!cfg.defaultSource) {
    cfg.defaultSource = source.id;
  }

  await saveConfig(cfg);
}

/**
 * Remove a source by ID.
 * Throws if the source does not exist.
 */
export async function removeSource(id: string): Promise<void> {
  const cfg = await ensureV2Config();
  const sources = cfg.sources ?? [];
  const idx = sources.findIndex((s) => s.id === id);

  if (idx === -1) {
    throw new Error(`Source "${id}" not found.`);
  }

  sources.splice(idx, 1);
  cfg.sources = sources;

  // Clear default if it was the removed source
  if (cfg.defaultSource === id) {
    cfg.defaultSource = sources[0]?.id;
  }

  await saveConfig(cfg);
}

/**
 * List all configured sources (enabled and disabled).
 */
export async function listSources(): Promise<SourceConfig[]> {
  const cfg = await loadConfigV2();
  return cfg?.sources ?? [];
}

/**
 * Set which source is the default.
 * Throws if the source ID does not exist.
 */
export async function setDefaultSource(id: string): Promise<void> {
  const cfg = await ensureV2Config();
  const sources = cfg.sources ?? [];

  if (!sources.some((s) => s.id === id)) {
    throw new Error(`Source "${id}" not found.`);
  }

  cfg.defaultSource = id;
  await saveConfig(cfg);
}

/**
 * Get a source by ID.
 */
export async function getSource(id: string): Promise<SourceConfig | undefined> {
  const cfg = await loadConfigV2();
  return cfg?.sources?.find((s) => s.id === id);
}

/**
 * Enable or disable a source.
 */
export async function setSourceEnabled(id: string, enabled: boolean): Promise<void> {
  const cfg = await ensureV2Config();
  const sources = cfg.sources ?? [];
  const source = sources.find((s) => s.id === id);

  if (!source) {
    throw new Error(`Source "${id}" not found.`);
  }

  source.enabled = enabled;
  await saveConfig(cfg);
}

// ---------------------------------------------------------------------------
// Workspace registry (multi-workspace UI)
// ---------------------------------------------------------------------------

/**
 * Get all registered workspace paths and the active one.
 */
export async function getWorkspaceRegistry(): Promise<{
  active?: string;
  paths: string[];
}> {
  const cfg = await loadConfig();
  return cfg?.workspaces ?? { paths: [] };
}

/**
 * Register a workspace manifest path.
 * Idempotent — does nothing if the path is already registered.
 */
export async function registerWorkspace(manifestPath: string): Promise<void> {
  const cfg = (await loadConfig()) ?? ({ version: 2, sources: [] } as AhubConfig);
  if (!cfg.workspaces) {
    cfg.workspaces = { paths: [] };
  }

  const absPath = path.resolve(manifestPath);
  if (!cfg.workspaces.paths.includes(absPath)) {
    cfg.workspaces.paths.push(absPath);
  }

  // Auto-set active if this is the first workspace
  if (!cfg.workspaces.active) {
    cfg.workspaces.active = absPath;
  }

  await saveConfig(cfg);
}

/**
 * Unregister a workspace manifest path.
 */
export async function unregisterWorkspace(manifestPath: string): Promise<void> {
  const cfg = await loadConfig();
  if (!cfg?.workspaces) return;

  const absPath = path.resolve(manifestPath);
  cfg.workspaces.paths = cfg.workspaces.paths.filter((p) => p !== absPath);

  // Clear active if it was the removed workspace
  if (cfg.workspaces.active === absPath) {
    cfg.workspaces.active = cfg.workspaces.paths[0];
  }

  await saveConfig(cfg);
}

/**
 * Set the active workspace by manifest path.
 * Throws if the path is not registered.
 */
export async function setActiveWorkspace(manifestPath: string): Promise<void> {
  const cfg = await loadConfig();
  if (!cfg) {
    throw new Error('No configuration found. Run "ahub init" first.');
  }

  const absPath = path.resolve(manifestPath);
  if (!cfg.workspaces?.paths.includes(absPath)) {
    throw new Error(`Workspace "${absPath}" is not registered.`);
  }

  cfg.workspaces.active = absPath;
  await saveConfig(cfg);
}

// ---------------------------------------------------------------------------
// Auto-detection
// ---------------------------------------------------------------------------

/**
 * Search upward from `startDir` for directories named `.skills/`
 * that contain at least one subdirectory with a `SKILL.md` file.
 *
 * Returns the absolute paths of discovered `.skills/` directories.
 */
export async function detectLocalSkillDirs(startDir?: string): Promise<string[]> {
  const results: string[] = [];
  let dir = path.resolve(startDir ?? process.cwd());
  const root = path.parse(dir).root;

  while (true) {
    const candidate = path.join(dir, '.skills');
    if (await hasSkills(candidate)) {
      results.push(candidate);
    }

    const parent = path.dirname(dir);
    if (parent === dir || dir === root) break;
    dir = parent;
  }

  return results;
}

/**
 * Check if a directory exists and contains at least one
 * subdirectory with a `SKILL.md` file.
 */
async function hasSkills(dir: string): Promise<boolean> {
  try {
    await access(dir);
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        await access(path.join(dir, entry.name, 'SKILL.md'));
        return true;
      } catch {
        // no SKILL.md in this subdirectory
      }
    }
    return false;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/** Type guard for Node.js system errors that carry a `code` property. */
function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err;
}
