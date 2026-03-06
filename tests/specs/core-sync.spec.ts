/**
 * Characterization tests for core-sync module.
 *
 * These tests validate the behavioral contracts documented in
 * docs/specs/core-sync.md. They focus on observable behavior,
 * not implementation details.
 *
 * @see docs/specs/core-sync.md
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  AhubConfig,
  DeployTarget,
  SkillPackage,
  SyncProgressEvent,
  WorkspaceManifest,
} from '../../src/core/types.js';

// ---------------------------------------------------------------------------
// Mocks (must be before imports due to vi.mock hoisting)
// ---------------------------------------------------------------------------

const mockProviderGet = vi.fn<(name: string) => Promise<SkillPackage>>();
vi.mock('../../src/storage/factory.js', () => ({
  createProvider: () => ({
    name: 'mock-provider',
    get: mockProviderGet,
  }),
}));

const mockDeployerDeploy = vi.fn<(pkg: SkillPackage) => Promise<string>>();
vi.mock('../../src/deploy/deployer.js', () => ({
  createDeployer: () => Promise.resolve({
    deploy: mockDeployerDeploy,
  }),
}));

const mockIsFresh = vi.fn<(name: string) => Promise<boolean>>();
const mockGetCachedSkill = vi.fn<(name: string) => Promise<SkillPackage | null>>();
const mockCacheSkill = vi.fn<(pkg: SkillPackage) => Promise<void>>();
vi.mock('../../src/core/cache.js', () => ({
  CacheManager: vi.fn().mockImplementation(() => ({
    isFresh: mockIsFresh,
    getCachedSkill: mockGetCachedSkill,
    cacheSkill: mockCacheSkill,
  })),
}));

// Import after mocks
import { syncWorkspace } from '../../src/core/sync.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePkg(name: string): SkillPackage {
  return {
    skill: {
      name,
      description: `Description for ${name}`,
      body: `# ${name}\n\nBody.`,
      metadata: {},
    },
    files: [
      { relativePath: 'SKILL.md', content: `---\nname: "${name}"\n---\n# ${name}\n` },
    ],
  };
}

const baseConfig: AhubConfig = {
  provider: 'git',
  git: { repoUrl: 'https://example.com/repo.git', branch: 'main', skillsDir: '.' },
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockIsFresh.mockResolvedValue(false);
  mockGetCachedSkill.mockResolvedValue(null);
  mockCacheSkill.mockResolvedValue(undefined);
});

// ===========================================================================
// Spec: SyncResult always has three arrays
// ===========================================================================

describe('Spec: SyncResult always has three arrays', () => {
  it('deployed, failed, and skipped are always present even for a populated manifest', async () => {
    const manifest: WorkspaceManifest = {
      version: 1,
      defaultTargets: ['claude-code'],
      skills: [{ name: 'alpha' }],
    };

    mockProviderGet.mockResolvedValue(makePkg('alpha'));
    mockDeployerDeploy.mockResolvedValue('/deployed/alpha.md');

    const result = await syncWorkspace(manifest, baseConfig);

    expect(result).toHaveProperty('deployed');
    expect(result).toHaveProperty('failed');
    expect(result).toHaveProperty('skipped');
    expect(Array.isArray(result.deployed)).toBe(true);
    expect(Array.isArray(result.failed)).toBe(true);
    expect(Array.isArray(result.skipped)).toBe(true);
  });

  it('empty manifest returns all three as empty arrays', async () => {
    const manifest: WorkspaceManifest = { version: 1 };

    const result = await syncWorkspace(manifest, baseConfig);

    expect(result.deployed).toEqual([]);
    expect(result.failed).toEqual([]);
    expect(result.skipped).toEqual([]);
  });

  it('manifest with only groups still returns all three arrays', async () => {
    const manifest: WorkspaceManifest = {
      version: 1,
      groups: [
        { targets: ['cursor'], skills: ['group-only'] },
      ],
    };

    mockProviderGet.mockResolvedValue(makePkg('group-only'));
    mockDeployerDeploy.mockResolvedValue('/deployed/group-only.md');

    const result = await syncWorkspace(manifest, baseConfig);

    expect(result).toHaveProperty('deployed');
    expect(result).toHaveProperty('failed');
    expect(result).toHaveProperty('skipped');
  });
});

// ===========================================================================
// Spec: Failed skills do not interrupt remaining
// ===========================================================================

describe('Spec: Failed skills do not interrupt remaining', () => {
  it('when first skill fetch fails, second skill still deploys', async () => {
    const manifest: WorkspaceManifest = {
      version: 1,
      defaultTargets: ['claude-code'],
      skills: [
        { name: 'bad-skill' },
        { name: 'good-skill' },
      ],
    };

    mockProviderGet
      .mockRejectedValueOnce(new Error('storage unavailable'))
      .mockResolvedValueOnce(makePkg('good-skill'));
    mockDeployerDeploy.mockResolvedValue('/deployed/good-skill.md');

    const result = await syncWorkspace(manifest, baseConfig);

    expect(result.deployed).toHaveLength(1);
    expect(result.deployed[0].skill).toBe('good-skill');
    expect(result.failed.length).toBeGreaterThanOrEqual(1);
  });

  it('records failed skill with error message from fetch', async () => {
    const manifest: WorkspaceManifest = {
      version: 1,
      defaultTargets: ['claude-code'],
      skills: [{ name: 'broken-skill' }],
    };

    mockProviderGet.mockRejectedValue(new Error('connection refused'));

    const result = await syncWorkspace(manifest, baseConfig);

    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].skill).toBe('broken-skill');
    expect(result.failed[0].error).toContain('connection refused');
  });

  it('records failed skill with error message from deploy', async () => {
    const manifest: WorkspaceManifest = {
      version: 1,
      defaultTargets: ['claude-code'],
      skills: [{ name: 'deploy-broken' }],
    };

    mockProviderGet.mockResolvedValue(makePkg('deploy-broken'));
    mockDeployerDeploy.mockRejectedValue(new Error('permission denied'));

    const result = await syncWorkspace(manifest, baseConfig);

    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].skill).toBe('deploy-broken');
    expect(result.failed[0].error).toContain('permission denied');
  });

  it('multiple failures are all recorded independently', async () => {
    const manifest: WorkspaceManifest = {
      version: 1,
      defaultTargets: ['claude-code'],
      skills: [
        { name: 'fail-a' },
        { name: 'fail-b' },
        { name: 'succeed-c' },
      ],
    };

    mockProviderGet
      .mockRejectedValueOnce(new Error('error-a'))
      .mockRejectedValueOnce(new Error('error-b'))
      .mockResolvedValueOnce(makePkg('succeed-c'));
    mockDeployerDeploy.mockResolvedValue('/deployed/succeed-c.md');

    const result = await syncWorkspace(manifest, baseConfig);

    expect(result.deployed).toHaveLength(1);
    expect(result.deployed[0].skill).toBe('succeed-c');
    expect(result.failed.length).toBeGreaterThanOrEqual(2);
    expect(result.failed.some((f) => f.error.includes('error-a'))).toBe(true);
    expect(result.failed.some((f) => f.error.includes('error-b'))).toBe(true);
  });
});

// ===========================================================================
// Spec: filter option reduces processed skills
// ===========================================================================

describe('Spec: filter option reduces processed skills', () => {
  it('only filtered skills are fetched and deployed', async () => {
    const manifest: WorkspaceManifest = {
      version: 1,
      defaultTargets: ['claude-code'],
      skills: [
        { name: 'wanted' },
        { name: 'unwanted' },
        { name: 'also-unwanted' },
      ],
    };

    mockProviderGet.mockResolvedValue(makePkg('wanted'));
    mockDeployerDeploy.mockResolvedValue('/deployed/wanted.md');

    const result = await syncWorkspace(manifest, baseConfig, {
      filter: ['wanted'],
    });

    expect(mockProviderGet).toHaveBeenCalledTimes(1);
    expect(mockProviderGet).toHaveBeenCalledWith('wanted');
    expect(result.deployed).toHaveLength(1);
    expect(result.deployed[0].skill).toBe('wanted');
  });

  it('unfiltered skills are not fetched at all', async () => {
    const manifest: WorkspaceManifest = {
      version: 1,
      defaultTargets: ['claude-code'],
      skills: [
        { name: 'include-me' },
        { name: 'skip-me' },
      ],
    };

    mockProviderGet.mockResolvedValue(makePkg('include-me'));
    mockDeployerDeploy.mockResolvedValue('/deployed/include-me.md');

    await syncWorkspace(manifest, baseConfig, { filter: ['include-me'] });

    expect(mockProviderGet).not.toHaveBeenCalledWith('skip-me');
  });

  it('filter with no matches yields empty result', async () => {
    const manifest: WorkspaceManifest = {
      version: 1,
      defaultTargets: ['claude-code'],
      skills: [{ name: 'existing-skill' }],
    };

    const result = await syncWorkspace(manifest, baseConfig, {
      filter: ['nonexistent-skill'],
    });

    expect(mockProviderGet).not.toHaveBeenCalled();
    expect(result.deployed).toHaveLength(0);
    expect(result.failed).toHaveLength(0);
  });

  it('filter is case-insensitive', async () => {
    const manifest: WorkspaceManifest = {
      version: 1,
      defaultTargets: ['claude-code'],
      skills: [{ name: 'My-Skill' }],
    };

    mockProviderGet.mockResolvedValue(makePkg('My-Skill'));
    mockDeployerDeploy.mockResolvedValue('/deployed/My-Skill.md');

    const result = await syncWorkspace(manifest, baseConfig, {
      filter: ['my-skill'],
    });

    expect(result.deployed).toHaveLength(1);
  });
});

// ===========================================================================
// Spec: dryRun does not modify filesystem
// ===========================================================================

describe('Spec: dryRun does not modify filesystem', () => {
  it('provider.get() is not called during dry run', async () => {
    const manifest: WorkspaceManifest = {
      version: 1,
      defaultTargets: ['claude-code'],
      skills: [{ name: 'dry-skill' }],
    };

    await syncWorkspace(manifest, baseConfig, { dryRun: true });

    expect(mockProviderGet).not.toHaveBeenCalled();
  });

  it('deployer.deploy() is not called during dry run', async () => {
    const manifest: WorkspaceManifest = {
      version: 1,
      defaultTargets: ['claude-code'],
      skills: [{ name: 'dry-skill' }],
    };

    await syncWorkspace(manifest, baseConfig, { dryRun: true });

    expect(mockDeployerDeploy).not.toHaveBeenCalled();
  });

  it('deployed array contains (dry-run) paths', async () => {
    const manifest: WorkspaceManifest = {
      version: 1,
      defaultTargets: ['claude-code'],
      skills: [{ name: 'dry-skill-a' }, { name: 'dry-skill-b' }],
    };

    const result = await syncWorkspace(manifest, baseConfig, { dryRun: true });

    expect(result.deployed).toHaveLength(2);
    for (const entry of result.deployed) {
      expect(entry.path).toBe('(dry-run)');
    }
  });

  it('dry run with multiple targets still produces (dry-run) for each', async () => {
    const manifest: WorkspaceManifest = {
      version: 1,
      groups: [
        { targets: ['claude-code', 'cursor'], skills: ['multi-target-dry'] },
      ],
    };

    const result = await syncWorkspace(manifest, baseConfig, { dryRun: true });

    expect(result.deployed).toHaveLength(2);
    expect(result.deployed.every((e) => e.path === '(dry-run)')).toBe(true);
    expect(result.deployed.map((e) => e.target).sort()).toEqual(['claude-code', 'cursor']);
  });
});

// ===========================================================================
// Spec: Progress events emitted in order
// ===========================================================================

describe('Spec: Progress events emitted in order', () => {
  it('onProgress callback receives events with phase fetch then deploy', async () => {
    const manifest: WorkspaceManifest = {
      version: 1,
      defaultTargets: ['claude-code'],
      skills: [{ name: 'progress-skill' }],
    };

    mockProviderGet.mockResolvedValue(makePkg('progress-skill'));
    mockDeployerDeploy.mockResolvedValue('/deployed/progress-skill.md');

    const events: SyncProgressEvent[] = [];
    await syncWorkspace(manifest, baseConfig, {
      onProgress: (event) => events.push(event),
    });

    expect(events.length).toBeGreaterThanOrEqual(2);

    // The first event for this skill should be a fetch phase.
    const fetchIndex = events.findIndex((e) => e.phase === 'fetch');
    const deployIndex = events.findIndex((e) => e.phase === 'deploy');

    expect(fetchIndex).toBeGreaterThanOrEqual(0);
    expect(deployIndex).toBeGreaterThanOrEqual(0);
    expect(fetchIndex).toBeLessThan(deployIndex);
  });

  it('current/total counts are correct for a single skill', async () => {
    const manifest: WorkspaceManifest = {
      version: 1,
      defaultTargets: ['claude-code'],
      skills: [{ name: 'counted-skill' }],
    };

    mockProviderGet.mockResolvedValue(makePkg('counted-skill'));
    mockDeployerDeploy.mockResolvedValue('/deployed/counted-skill.md');

    const events: SyncProgressEvent[] = [];
    await syncWorkspace(manifest, baseConfig, {
      onProgress: (event) => events.push(event),
    });

    // Total should reflect the number of deploy operations (1 skill x 1 target = 1).
    const deployEvent = events.find((e) => e.phase === 'deploy');
    expect(deployEvent).toBeDefined();
    expect(deployEvent!.total).toBe(1);
    expect(deployEvent!.current).toBe(1);
  });

  it('current/total counts are correct for multiple skills and targets', async () => {
    const manifest: WorkspaceManifest = {
      version: 1,
      groups: [
        { targets: ['claude-code', 'cursor'], skills: ['multi-a'] },
      ],
      skills: [{ name: 'multi-b' }],
      defaultTargets: ['claude-code'],
    };

    mockProviderGet.mockImplementation(async (name: string) => makePkg(name));
    mockDeployerDeploy.mockResolvedValue('/deployed/skill.md');

    const events: SyncProgressEvent[] = [];
    await syncWorkspace(manifest, baseConfig, {
      onProgress: (event) => events.push(event),
    });

    // multi-a -> 2 targets, multi-b -> 1 target = 3 total deploy ops.
    const deployEvents = events.filter((e) => e.phase === 'deploy');
    expect(deployEvents.length).toBe(3);

    // All deploy events should have total === 3.
    for (const e of deployEvents) {
      expect(e.total).toBe(3);
    }

    // current should be monotonically increasing.
    const currents = deployEvents.map((e) => e.current);
    for (let i = 1; i < currents.length; i++) {
      expect(currents[i]).toBeGreaterThan(currents[i - 1]);
    }
  });

  it('each event includes the skill name', async () => {
    const manifest: WorkspaceManifest = {
      version: 1,
      defaultTargets: ['claude-code'],
      skills: [{ name: 'named-skill' }],
    };

    mockProviderGet.mockResolvedValue(makePkg('named-skill'));
    mockDeployerDeploy.mockResolvedValue('/deployed/named-skill.md');

    const events: SyncProgressEvent[] = [];
    await syncWorkspace(manifest, baseConfig, {
      onProgress: (event) => events.push(event),
    });

    for (const e of events) {
      expect(e.skill).toBe('named-skill');
    }
  });
});

// ===========================================================================
// Spec: Groups and skills merged for deployment
// ===========================================================================

describe('Spec: Groups and skills merged for deployment', () => {
  it('skills from groups deploy to group targets', async () => {
    const manifest: WorkspaceManifest = {
      version: 1,
      groups: [
        { targets: ['cursor', 'codex'], skills: ['group-skill'] },
      ],
    };

    mockProviderGet.mockResolvedValue(makePkg('group-skill'));
    mockDeployerDeploy.mockResolvedValue('/deployed/group-skill.md');

    const result = await syncWorkspace(manifest, baseConfig);

    expect(result.deployed).toHaveLength(2);
    const targets = result.deployed.map((d) => d.target).sort();
    expect(targets).toEqual(['codex', 'cursor']);
    for (const entry of result.deployed) {
      expect(entry.skill).toBe('group-skill');
    }
  });

  it('defaultTargets applied to flat skills without explicit targets', async () => {
    const manifest: WorkspaceManifest = {
      version: 1,
      defaultTargets: ['cursor'],
      skills: [{ name: 'flat-skill' }],
    };

    mockProviderGet.mockResolvedValue(makePkg('flat-skill'));
    mockDeployerDeploy.mockResolvedValue('/deployed/flat-skill.md');

    const result = await syncWorkspace(manifest, baseConfig);

    expect(result.deployed).toHaveLength(1);
    expect(result.deployed[0].target).toBe('cursor');
  });

  it('flat skills with explicit targets override defaultTargets', async () => {
    const manifest: WorkspaceManifest = {
      version: 1,
      defaultTargets: ['claude-code'],
      skills: [{ name: 'explicit-skill', targets: ['codex'] }],
    };

    mockProviderGet.mockResolvedValue(makePkg('explicit-skill'));
    mockDeployerDeploy.mockResolvedValue('/deployed/explicit-skill.md');

    const result = await syncWorkspace(manifest, baseConfig);

    expect(result.deployed).toHaveLength(1);
    expect(result.deployed[0].target).toBe('codex');
  });

  it('when no defaultTargets, flat skills default to claude-code', async () => {
    const manifest: WorkspaceManifest = {
      version: 1,
      skills: [{ name: 'fallback-skill' }],
    };

    mockProviderGet.mockResolvedValue(makePkg('fallback-skill'));
    mockDeployerDeploy.mockResolvedValue('/deployed/fallback-skill.md');

    const result = await syncWorkspace(manifest, baseConfig);

    expect(result.deployed).toHaveLength(1);
    expect(result.deployed[0].target).toBe('claude-code');
  });

  it('skill in both groups and skills has targets merged', async () => {
    const manifest: WorkspaceManifest = {
      version: 1,
      defaultTargets: ['claude-code'],
      groups: [
        { targets: ['cursor'], skills: ['shared-skill'] },
      ],
      skills: [{ name: 'shared-skill' }],
    };

    mockProviderGet.mockResolvedValue(makePkg('shared-skill'));
    mockDeployerDeploy.mockResolvedValue('/deployed/shared-skill.md');

    const result = await syncWorkspace(manifest, baseConfig);

    // Targets from group (cursor) + defaultTargets from flat (claude-code) = 2.
    expect(result.deployed).toHaveLength(2);
    const targets = result.deployed.map((d) => d.target).sort();
    expect(targets).toEqual(['claude-code', 'cursor']);
  });

  it('multiple groups with different targets for different skills', async () => {
    const manifest: WorkspaceManifest = {
      version: 1,
      groups: [
        { targets: ['claude-code'], skills: ['skill-a'] },
        { targets: ['cursor'], skills: ['skill-b'] },
      ],
    };

    mockProviderGet.mockImplementation(async (name: string) => makePkg(name));
    mockDeployerDeploy.mockImplementation(async (pkg) =>
      `/deployed/${pkg.skill.name}.md`,
    );

    const result = await syncWorkspace(manifest, baseConfig);

    expect(result.deployed).toHaveLength(2);

    const entryA = result.deployed.find((d) => d.skill === 'skill-a');
    const entryB = result.deployed.find((d) => d.skill === 'skill-b');

    expect(entryA).toBeDefined();
    expect(entryA!.target).toBe('claude-code');
    expect(entryB).toBeDefined();
    expect(entryB!.target).toBe('cursor');
  });
});
