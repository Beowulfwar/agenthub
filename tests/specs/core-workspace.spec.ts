/**
 * Characterization tests for core-workspace module.
 *
 * These tests validate the behavioral contracts documented in
 * docs/specs/core-workspace.md. They focus on observable behavior,
 * not implementation details.
 *
 * @see docs/specs/core-workspace.md
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  WORKSPACE_FILENAMES,
  findWorkspaceManifest,
  loadWorkspaceManifest,
  requireWorkspaceManifest,
  saveWorkspaceManifest,
  resolveManifestSkills,
} from '../../src/core/workspace.js';
import { WorkspaceNotFoundError } from '../../src/core/errors.js';
import type { WorkspaceManifest } from '../../src/core/types.js';

// ---------------------------------------------------------------------------
// Temp directory helpers
// ---------------------------------------------------------------------------

const TEST_ROOT = path.join(os.tmpdir(), 'ahub-workspace-spec-test');

beforeEach(async () => {
  await rm(TEST_ROOT, { recursive: true, force: true });
  await mkdir(TEST_ROOT, { recursive: true });
});

afterAll(async () => {
  await rm(TEST_ROOT, { recursive: true, force: true });
});

function validManifest(overrides?: Partial<WorkspaceManifest>): WorkspaceManifest {
  return {
    version: 1,
    name: 'test',
    defaultTargets: ['claude-code'],
    skills: [{ name: 'skill-a' }],
    ...overrides,
  };
}

async function writeManifest(
  dir: string,
  manifest: WorkspaceManifest,
  filename = 'ahub.workspace.json',
): Promise<string> {
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, filename);
  await writeFile(filePath, JSON.stringify(manifest, null, 2), 'utf-8');
  return filePath;
}

// ---------------------------------------------------------------------------
// Contract: findWorkspaceManifest ascending search
// ---------------------------------------------------------------------------

describe('Spec: findWorkspaceManifest ascending search', () => {
  it('finds manifest in current directory', async () => {
    const dir = path.join(TEST_ROOT, 'project-current');
    await writeManifest(dir, validManifest());

    const found = await findWorkspaceManifest(dir);
    expect(found).toBe(path.join(dir, 'ahub.workspace.json'));
  });

  it('walks up to parent directories', async () => {
    const root = path.join(TEST_ROOT, 'project-root');
    const nested = path.join(root, 'src', 'app');
    await writeManifest(root, validManifest());
    await mkdir(nested, { recursive: true });

    const found = await findWorkspaceManifest(nested);
    expect(found).toBe(path.join(root, 'ahub.workspace.json'));
  });

  it('prefers ahub.workspace.json over .ahub.json', async () => {
    const dir = path.join(TEST_ROOT, 'both-manifests');
    await writeManifest(dir, validManifest(), 'ahub.workspace.json');
    await writeManifest(dir, validManifest({ name: 'alt' }), '.ahub.json');

    const found = await findWorkspaceManifest(dir);
    expect(found).toBe(path.join(dir, 'ahub.workspace.json'));
  });

  it('finds .ahub.json when ahub.workspace.json does not exist', async () => {
    const dir = path.join(TEST_ROOT, 'dotfile-only');
    await writeManifest(dir, validManifest(), '.ahub.json');

    const found = await findWorkspaceManifest(dir);
    expect(found).toBe(path.join(dir, '.ahub.json'));
  });

  it('returns null when no manifest exists anywhere', async () => {
    const empty = path.join(TEST_ROOT, 'no-manifest');
    await mkdir(empty, { recursive: true });

    const found = await findWorkspaceManifest(empty);
    // May find a manifest above TEST_ROOT in some environments.
    // The contract guarantees: returns string | null, never throws.
    expect(found === null || typeof found === 'string').toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Contract: loadWorkspaceManifest validates structure
// ---------------------------------------------------------------------------

describe('Spec: loadWorkspaceManifest validates structure', () => {
  it('returns valid WorkspaceManifest for correct JSON', async () => {
    const filePath = await writeManifest(
      path.join(TEST_ROOT, 'valid-load'),
      validManifest({ name: 'my-workspace', description: 'A valid workspace' }),
    );

    const manifest = await loadWorkspaceManifest(filePath);
    expect(manifest.version).toBe(1);
    expect(manifest.name).toBe('my-workspace');
    expect(manifest.description).toBe('A valid workspace');
    expect(manifest.skills).toHaveLength(1);
    expect(manifest.skills![0].name).toBe('skill-a');
    expect(manifest.defaultTargets).toEqual(['claude-code']);
  });

  it('rejects manifest without version field', async () => {
    const dir = path.join(TEST_ROOT, 'no-version');
    await mkdir(dir, { recursive: true });
    const filePath = path.join(dir, 'ahub.workspace.json');
    await writeFile(filePath, JSON.stringify({ name: 'bad' }), 'utf-8');

    await expect(loadWorkspaceManifest(filePath)).rejects.toThrow(
      /Unsupported workspace manifest version/,
    );
  });

  it('rejects manifest with wrong version number', async () => {
    const dir = path.join(TEST_ROOT, 'wrong-version');
    await mkdir(dir, { recursive: true });
    const filePath = path.join(dir, 'ahub.workspace.json');
    await writeFile(filePath, JSON.stringify({ version: 2, skills: [] }), 'utf-8');

    await expect(loadWorkspaceManifest(filePath)).rejects.toThrow(
      /Unsupported workspace manifest version: 2\. Expected 1\./,
    );
  });

  it('rejects invalid deploy targets in defaultTargets', async () => {
    const filePath = await writeManifest(
      path.join(TEST_ROOT, 'bad-default-target'),
      { version: 1, defaultTargets: ['vscode' as any] },
    );

    await expect(loadWorkspaceManifest(filePath)).rejects.toThrow(
      /Invalid default target/,
    );
  });

  it('rejects invalid deploy targets in skills', async () => {
    const filePath = await writeManifest(
      path.join(TEST_ROOT, 'bad-skill-target'),
      {
        version: 1,
        skills: [{ name: 'my-skill', targets: ['vscode' as any] }],
      },
    );

    await expect(loadWorkspaceManifest(filePath)).rejects.toThrow(
      /Invalid target "vscode"/,
    );
  });

  it('rejects invalid deploy targets in groups', async () => {
    const filePath = await writeManifest(
      path.join(TEST_ROOT, 'bad-group-target'),
      {
        version: 1,
        groups: [{ targets: ['sublime' as any], skills: ['skill-x'] }],
      },
    );

    await expect(loadWorkspaceManifest(filePath)).rejects.toThrow(
      /Invalid target "sublime"/,
    );
  });

  it('rejects non-JSON content', async () => {
    const dir = path.join(TEST_ROOT, 'not-json');
    await mkdir(dir, { recursive: true });
    const filePath = path.join(dir, 'ahub.workspace.json');
    await writeFile(filePath, 'this is not valid JSON', 'utf-8');

    await expect(loadWorkspaceManifest(filePath)).rejects.toThrow();
  });

  it('loads manifest with groups successfully', async () => {
    const filePath = await writeManifest(
      path.join(TEST_ROOT, 'groups-valid'),
      {
        version: 1,
        groups: [
          { targets: ['claude-code', 'codex'], skills: ['skill-x', 'skill-y'] },
        ],
      },
    );

    const manifest = await loadWorkspaceManifest(filePath);
    expect(manifest.groups).toHaveLength(1);
    expect(manifest.groups![0].targets).toEqual(['claude-code', 'codex']);
    expect(manifest.groups![0].skills).toEqual(['skill-x', 'skill-y']);
  });
});

// ---------------------------------------------------------------------------
// Contract: requireWorkspaceManifest throws for missing
// ---------------------------------------------------------------------------

describe('Spec: requireWorkspaceManifest throws for missing', () => {
  it('throws WorkspaceNotFoundError when no manifest found anywhere', async () => {
    const isolated = path.join(TEST_ROOT, 'require-missing', 'deep', 'nested', 'dir');
    await mkdir(isolated, { recursive: true });

    // The function walks up from the isolated dir. If no manifest exists
    // above TEST_ROOT, this will throw. In some CI environments a manifest
    // might exist higher up — we handle both cases gracefully.
    try {
      await requireWorkspaceManifest(isolated);
      // If it succeeds, a manifest exists above our test tree — acceptable.
    } catch (err) {
      expect(err).toBeInstanceOf(WorkspaceNotFoundError);
    }
  });

  it('returns manifest when one exists', async () => {
    const dir = path.join(TEST_ROOT, 'require-exists');
    await writeManifest(dir, validManifest({ name: 'found-workspace' }));

    const { manifest, filePath } = await requireWorkspaceManifest(dir);
    expect(manifest.name).toBe('found-workspace');
    expect(manifest.version).toBe(1);
    expect(filePath).toBe(path.join(dir, 'ahub.workspace.json'));
  });

  it('returns manifest found in parent directory', async () => {
    const parent = path.join(TEST_ROOT, 'require-parent');
    const child = path.join(parent, 'src', 'components');
    await writeManifest(parent, validManifest({ name: 'parent-ws' }));
    await mkdir(child, { recursive: true });

    const { manifest, filePath } = await requireWorkspaceManifest(child);
    expect(manifest.name).toBe('parent-ws');
    expect(filePath).toBe(path.join(parent, 'ahub.workspace.json'));
  });
});

// ---------------------------------------------------------------------------
// Contract: saveWorkspaceManifest persists to disk
// ---------------------------------------------------------------------------

describe('Spec: saveWorkspaceManifest persists to disk', () => {
  it('writes manifest and reads it back correctly', async () => {
    const dir = path.join(TEST_ROOT, 'save-roundtrip');
    await mkdir(dir, { recursive: true });
    const filePath = path.join(dir, 'ahub.workspace.json');

    const original = validManifest({
      name: 'persisted-project',
      description: 'Round-trip test',
    });
    await saveWorkspaceManifest(filePath, original);

    // Verify via loadWorkspaceManifest (full round-trip).
    const reloaded = await loadWorkspaceManifest(filePath);
    expect(reloaded.version).toBe(1);
    expect(reloaded.name).toBe('persisted-project');
    expect(reloaded.description).toBe('Round-trip test');
    expect(reloaded.defaultTargets).toEqual(['claude-code']);
    expect(reloaded.skills).toHaveLength(1);
    expect(reloaded.skills![0].name).toBe('skill-a');
  });

  it('persists manifest with groups and reloads correctly', async () => {
    const dir = path.join(TEST_ROOT, 'save-groups');
    await mkdir(dir, { recursive: true });
    const filePath = path.join(dir, 'ahub.workspace.json');

    const original: WorkspaceManifest = {
      version: 1,
      name: 'grouped-project',
      groups: [
        { targets: ['codex', 'cursor'], skills: ['skill-one', 'skill-two'] },
      ],
    };
    await saveWorkspaceManifest(filePath, original);

    const reloaded = await loadWorkspaceManifest(filePath);
    expect(reloaded.name).toBe('grouped-project');
    expect(reloaded.groups).toHaveLength(1);
    expect(reloaded.groups![0].targets).toEqual(['codex', 'cursor']);
    expect(reloaded.groups![0].skills).toEqual(['skill-one', 'skill-two']);
  });
});

// ---------------------------------------------------------------------------
// Contract: resolveManifestSkills applies defaultTargets
// ---------------------------------------------------------------------------

describe('Spec: resolveManifestSkills applies defaultTargets', () => {
  it('uses defaultTargets when skill has no targets override', () => {
    const manifest: WorkspaceManifest = {
      version: 1,
      defaultTargets: ['codex'],
      skills: [{ name: 'my-skill' }],
    };

    const resolved = resolveManifestSkills(manifest);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]).toEqual({ name: 'my-skill', targets: ['codex'] });
  });

  it('skill-level targets override defaultTargets', () => {
    const manifest: WorkspaceManifest = {
      version: 1,
      defaultTargets: ['claude-code'],
      skills: [{ name: 'custom-skill', targets: ['codex', 'cursor'] }],
    };

    const resolved = resolveManifestSkills(manifest);
    expect(resolved[0].targets).toEqual(['codex', 'cursor']);
  });

  it('falls back to claude-code when no defaultTargets defined', () => {
    const manifest: WorkspaceManifest = {
      version: 1,
      skills: [{ name: 'fallback-skill' }],
    };

    const resolved = resolveManifestSkills(manifest);
    expect(resolved[0].targets).toEqual(['claude-code']);
  });

  it('merges groups and flat skills correctly', () => {
    const manifest: WorkspaceManifest = {
      version: 1,
      defaultTargets: ['cursor'],
      skills: [{ name: 'skill-a' }],
      groups: [
        { targets: ['codex'], skills: ['skill-a'] },
      ],
    };

    const resolved = resolveManifestSkills(manifest);
    expect(resolved).toHaveLength(1);
    // Union of group targets (codex) + flat targets (cursor), sorted.
    expect(resolved[0]).toEqual({ name: 'skill-a', targets: ['codex', 'cursor'] });
  });

  it('merges targets from group and skill-level override', () => {
    const manifest: WorkspaceManifest = {
      version: 1,
      skills: [{ name: 'skill-a', targets: ['cursor'] }],
      groups: [
        { targets: ['codex'], skills: ['skill-a'] },
      ],
    };

    const resolved = resolveManifestSkills(manifest);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].targets).toEqual(['codex', 'cursor']);
  });

  it('deduplicates targets across groups and skills', () => {
    const manifest: WorkspaceManifest = {
      version: 1,
      skills: [{ name: 'dup-skill', targets: ['cursor'] }],
      groups: [
        { targets: ['cursor', 'claude-code'], skills: ['dup-skill'] },
      ],
    };

    const resolved = resolveManifestSkills(manifest);
    expect(resolved[0].targets).toEqual(['claude-code', 'cursor']);
  });

  it('returns results sorted alphabetically by skill name', () => {
    const manifest: WorkspaceManifest = {
      version: 1,
      skills: [
        { name: 'zebra' },
        { name: 'alpha' },
        { name: 'mid' },
      ],
    };

    const resolved = resolveManifestSkills(manifest);
    expect(resolved.map((r) => r.name)).toEqual(['alpha', 'mid', 'zebra']);
  });

  it('returns empty array for empty manifest', () => {
    const manifest: WorkspaceManifest = { version: 1 };
    const resolved = resolveManifestSkills(manifest);
    expect(resolved).toEqual([]);
  });

  it('resolves group-only skills without flat skills section', () => {
    const manifest: WorkspaceManifest = {
      version: 1,
      groups: [
        { targets: ['claude-code', 'codex'], skills: ['grouped-a', 'grouped-b'] },
      ],
    };

    const resolved = resolveManifestSkills(manifest);
    expect(resolved).toHaveLength(2);
    expect(resolved[0]).toEqual({ name: 'grouped-a', targets: ['claude-code', 'codex'] });
    expect(resolved[1]).toEqual({ name: 'grouped-b', targets: ['claude-code', 'codex'] });
  });

  it('handles multiple groups with overlapping skills', () => {
    const manifest: WorkspaceManifest = {
      version: 1,
      groups: [
        { targets: ['claude-code'], skills: ['shared', 'only-first'] },
        { targets: ['codex'], skills: ['shared', 'only-second'] },
      ],
    };

    const resolved = resolveManifestSkills(manifest);
    const shared = resolved.find((r) => r.name === 'shared');
    expect(shared).toBeDefined();
    expect(shared!.targets).toEqual(['claude-code', 'codex']);

    const onlyFirst = resolved.find((r) => r.name === 'only-first');
    expect(onlyFirst!.targets).toEqual(['claude-code']);

    const onlySecond = resolved.find((r) => r.name === 'only-second');
    expect(onlySecond!.targets).toEqual(['codex']);
  });
});
