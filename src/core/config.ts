/**
 * Configuration manager for agent-hub.
 *
 * Reads and writes the user-level config stored at `~/.ahub/config.json`.
 * All file-system operations use `node:fs/promises` for a fully async API.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { AhubConfig, DeployTarget } from './types.js';

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
// Config I/O
// ---------------------------------------------------------------------------

/**
 * Load the configuration from `~/.ahub/config.json`.
 *
 * @returns The parsed `AhubConfig`, or `null` when the file does not exist
 *   or does not contain a valid config shape.
 */
export async function loadConfig(): Promise<AhubConfig | null> {
  try {
    const raw = await readFile(CONFIG_PATH, 'utf-8');
    const parsed: unknown = JSON.parse(raw);

    // Basic shape guard -- at minimum the provider field must be present.
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'provider' in parsed
    ) {
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
  const cfg = (await loadConfig()) ?? ({} as Record<string, unknown>);
  const parts = key.split('.');
  let current: Record<string, unknown> = cfg as Record<string, unknown>;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!;
    if (typeof current[part] !== 'object' || current[part] === null) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }

  const lastKey = parts[parts.length - 1]!;
  current[lastKey] = value;

  await saveConfig(cfg as unknown as AhubConfig);
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/** Type guard for Node.js system errors that carry a `code` property. */
function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err;
}
