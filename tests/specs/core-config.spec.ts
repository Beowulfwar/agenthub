/**
 * Characterization tests for core-config module.
 *
 * These tests validate the behavioral contracts documented in
 * docs/specs/core-config.md. They focus on observable behavior,
 * not implementation details.
 *
 * Because config.ts computes AHUB_DIR and CONFIG_PATH at module scope
 * via `os.homedir()`, we mock `node:os` to redirect homedir() to a
 * temp directory BEFORE config.ts is imported.  This ensures that all
 * module-level constants and the functions that close over them point
 * to the test directory.
 *
 * @see docs/specs/core-config.md
 */

import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

// ---------------------------------------------------------------------------
// Mock node:os to redirect homedir() to a temp directory.
// vi.mock is hoisted, so the factory must be self-contained.
// ---------------------------------------------------------------------------

vi.mock('node:os', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:os')>();
  const nodePath = await import('node:path');
  const testHome = nodePath.default.join(
    original.default.tmpdir(),
    'ahub-config-spec-home',
  );
  return {
    ...original,
    default: {
      ...original.default,
      homedir: () => testHome,
    },
  };
});

// Import config AFTER mock is set up — config.ts will compute
// AHUB_DIR = path.join(os.homedir(), '.ahub') using our test home.
import {
  loadConfig,
  saveConfig,
  requireConfig,
  getConfigValue,
  setConfigValue,
  getDefaultDeployPaths,
  ensureAhubDir,
} from '../../src/core/config.js';
import type { AhubConfig } from '../../src/core/types.js';

// ---------------------------------------------------------------------------
// Replicate the paths that config.ts will have computed.
// ---------------------------------------------------------------------------

const TEST_HOME = path.join(os.tmpdir(), 'ahub-config-spec-home');
const TEST_AHUB_DIR = path.join(TEST_HOME, '.ahub');
const TEST_CONFIG_PATH = path.join(TEST_AHUB_DIR, 'config.json');

// ---------------------------------------------------------------------------
// Setup/teardown
// ---------------------------------------------------------------------------

beforeEach(async () => {
  await rm(TEST_AHUB_DIR, { recursive: true, force: true });
  await mkdir(TEST_AHUB_DIR, { recursive: true });
});

afterAll(async () => {
  await rm(TEST_HOME, { recursive: true, force: true });
});

function validConfig(overrides?: Partial<AhubConfig>): AhubConfig {
  return {
    provider: 'git',
    git: { repoUrl: 'https://example.com/repo.git', branch: 'main', skillsDir: '.' },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Contract: loadConfig returns null when config file doesn't exist
// ---------------------------------------------------------------------------

describe('Spec: loadConfig returns null for missing config', () => {
  it('returns null when config.json does not exist', async () => {
    const result = await loadConfig();
    expect(result).toBeNull();
  });

  it('returns null when config has invalid provider', async () => {
    await writeFile(
      TEST_CONFIG_PATH,
      JSON.stringify({ provider: 'invalid' }),
      'utf-8',
    );

    const result = await loadConfig();
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Contract: loadConfig returns AhubConfig for valid file
// ---------------------------------------------------------------------------

describe('Spec: loadConfig reads valid config', () => {
  it('returns AhubConfig when file has valid git provider', async () => {
    const config = validConfig();
    await writeFile(TEST_CONFIG_PATH, JSON.stringify(config), 'utf-8');

    const result = await loadConfig();

    expect(result).not.toBeNull();
    expect(result!.provider).toBe('git');
    expect(result!.git?.repoUrl).toBe('https://example.com/repo.git');
  });

  it('returns AhubConfig when file has valid drive provider', async () => {
    const config = validConfig({
      provider: 'drive',
      drive: { folderId: 'abc123' },
    });
    await writeFile(TEST_CONFIG_PATH, JSON.stringify(config), 'utf-8');

    const result = await loadConfig();

    expect(result).not.toBeNull();
    expect(result!.provider).toBe('drive');
  });
});

// ---------------------------------------------------------------------------
// Contract: saveConfig creates dir and persists
// ---------------------------------------------------------------------------

describe('Spec: saveConfig persists to disk', () => {
  it('writes config to config.json', async () => {
    const config = validConfig();
    await saveConfig(config);

    const raw = await readFile(TEST_CONFIG_PATH, 'utf-8');
    const parsed = JSON.parse(raw);

    expect(parsed.provider).toBe('git');
    expect(parsed.git.repoUrl).toBe('https://example.com/repo.git');
  });
});

// ---------------------------------------------------------------------------
// Contract: requireConfig throws when no config exists
// ---------------------------------------------------------------------------

describe('Spec: requireConfig throws for missing config', () => {
  it('throws Error when config.json does not exist', async () => {
    await expect(requireConfig()).rejects.toThrow(/No configuration found/);
  });

  it('returns config when valid config exists', async () => {
    const config = validConfig();
    await writeFile(TEST_CONFIG_PATH, JSON.stringify(config), 'utf-8');

    const result = await requireConfig();
    expect(result.provider).toBe('git');
  });
});

// ---------------------------------------------------------------------------
// Contract: dot-path get/set config values
// ---------------------------------------------------------------------------

describe('Spec: getConfigValue dot-path navigation', () => {
  it('returns value for top-level key', async () => {
    await writeFile(
      TEST_CONFIG_PATH,
      JSON.stringify(validConfig()),
      'utf-8',
    );

    const result = await getConfigValue('provider');
    expect(result).toBe('git');
  });

  it('returns value for nested dot-path', async () => {
    await writeFile(
      TEST_CONFIG_PATH,
      JSON.stringify(validConfig()),
      'utf-8',
    );

    const result = await getConfigValue('git.branch');
    expect(result).toBe('main');
  });

  it('returns undefined for non-existent path', async () => {
    await writeFile(
      TEST_CONFIG_PATH,
      JSON.stringify(validConfig()),
      'utf-8',
    );

    const result = await getConfigValue('nonexistent.deep.path');
    expect(result).toBeUndefined();
  });

  it('returns undefined when no config exists', async () => {
    const result = await getConfigValue('provider');
    expect(result).toBeUndefined();
  });
});

describe('Spec: setConfigValue dot-path mutation', () => {
  it('sets nested value and persists', async () => {
    await writeFile(
      TEST_CONFIG_PATH,
      JSON.stringify(validConfig()),
      'utf-8',
    );

    await setConfigValue('git.branch', 'develop');

    const raw = await readFile(TEST_CONFIG_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.git.branch).toBe('develop');
  });

  it('creates intermediate objects for deep paths', async () => {
    await writeFile(
      TEST_CONFIG_PATH,
      JSON.stringify(validConfig()),
      'utf-8',
    );

    await setConfigValue('custom.nested.value', 42);

    const raw = await readFile(TEST_CONFIG_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.custom.nested.value).toBe(42);
  });

  it('throws when no config exists', async () => {
    await expect(setConfigValue('git.branch', 'test')).rejects.toThrow(
      /No configuration found/,
    );
  });
});

// ---------------------------------------------------------------------------
// Contract: getDefaultDeployPaths returns correct defaults
// ---------------------------------------------------------------------------

describe('Spec: getDefaultDeployPaths', () => {
  it('returns paths for all three targets', () => {
    const paths = getDefaultDeployPaths();
    // os.homedir() is mocked to TEST_HOME, so getDefaultDeployPaths
    // uses the same mocked value.
    const home = os.homedir();

    expect(paths['claude-code']).toBe(path.join(home, '.claude', 'commands'));
    expect(paths['codex']).toBe(path.join(home, '.codex', 'skills'));
    expect(paths['cursor']).toBe(path.join(home, '.cursor', 'rules'));
  });

  it('has exactly 3 entries', () => {
    const paths = getDefaultDeployPaths();
    expect(Object.keys(paths)).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Contract: ensureAhubDir creates directory
// ---------------------------------------------------------------------------

describe('Spec: ensureAhubDir', () => {
  it('creates the ahub directory if it does not exist', async () => {
    await rm(TEST_AHUB_DIR, { recursive: true, force: true });

    await ensureAhubDir();

    // If it didn't throw, the directory was created or already exists.
    // We verify by writing a file into it.
    const testFile = path.join(TEST_AHUB_DIR, 'test-ensure.txt');
    await writeFile(testFile, 'ok', 'utf-8');
    const content = await readFile(testFile, 'utf-8');
    expect(content).toBe('ok');
  });
});
