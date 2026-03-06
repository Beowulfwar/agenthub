import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  AhubConfig,
  DeployTarget,
  SkillPackage,
  WorkspaceManifest,
} from '../../src/core/types.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock the storage factory.
const mockProviderGet = vi.fn<(name: string) => Promise<SkillPackage>>();
vi.mock('../../src/storage/factory.js', () => ({
  createProvider: () => ({
    name: 'mock-provider',
    get: mockProviderGet,
  }),
}));

// Mock the deployer factory.
const mockDeployerDeploy = vi.fn<(pkg: SkillPackage) => Promise<string>>();
vi.mock('../../src/deploy/deployer.js', () => ({
  createDeployer: () => Promise.resolve({
    deploy: mockDeployerDeploy,
  }),
}));

// Mock the CacheManager.
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

// Import after mocks are set up.
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
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  // By default, cache reports stale (not fresh) so sync fetches from provider.
  mockIsFresh.mockResolvedValue(false);
  mockGetCachedSkill.mockResolvedValue(null);
  mockCacheSkill.mockResolvedValue(undefined);
});

describe('syncWorkspace', () => {
  it('fetches and deploys skills from a simple manifest', async () => {
    const manifest: WorkspaceManifest = {
      version: 1,
      defaultTargets: ['claude-code'],
      skills: [{ name: 'my-skill' }],
    };

    const pkg = makePkg('my-skill');
    mockProviderGet.mockResolvedValue(pkg);
    mockDeployerDeploy.mockResolvedValue('/deployed/my-skill.md');

    const result = await syncWorkspace(manifest, baseConfig);

    expect(mockProviderGet).toHaveBeenCalledWith('my-skill');
    expect(mockDeployerDeploy).toHaveBeenCalledWith(pkg);
    expect(result.deployed).toHaveLength(1);
    expect(result.deployed[0]).toEqual({
      skill: 'my-skill',
      target: 'claude-code',
      path: '/deployed/my-skill.md',
    });
    expect(result.failed).toHaveLength(0);
  });

  it('deploys to multiple targets from groups', async () => {
    const manifest: WorkspaceManifest = {
      version: 1,
      groups: [
        { targets: ['claude-code', 'cursor'], skills: ['group-skill'] },
      ],
    };

    mockProviderGet.mockResolvedValue(makePkg('group-skill'));
    mockDeployerDeploy.mockResolvedValue('/deployed/group-skill');

    const result = await syncWorkspace(manifest, baseConfig);

    expect(result.deployed).toHaveLength(2);
    expect(result.deployed.map((d) => d.target).sort()).toEqual(['claude-code', 'cursor']);
  });

  it('records failed skills when fetch throws', async () => {
    const manifest: WorkspaceManifest = {
      version: 1,
      skills: [{ name: 'fail-skill' }],
    };

    mockProviderGet.mockRejectedValue(new Error('network error'));

    const result = await syncWorkspace(manifest, baseConfig);

    expect(result.deployed).toHaveLength(0);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].skill).toBe('fail-skill');
    expect(result.failed[0].error).toContain('network error');
  });

  it('records failed skills when deploy throws', async () => {
    const manifest: WorkspaceManifest = {
      version: 1,
      skills: [{ name: 'deploy-fail' }],
    };

    mockProviderGet.mockResolvedValue(makePkg('deploy-fail'));
    mockDeployerDeploy.mockRejectedValue(new Error('disk full'));

    const result = await syncWorkspace(manifest, baseConfig);

    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].error).toContain('disk full');
  });

  it('filters skills when filter option is given', async () => {
    const manifest: WorkspaceManifest = {
      version: 1,
      skills: [
        { name: 'keep-this' },
        { name: 'skip-this' },
      ],
    };

    mockProviderGet.mockResolvedValue(makePkg('keep-this'));
    mockDeployerDeploy.mockResolvedValue('/deployed/keep-this');

    const result = await syncWorkspace(manifest, baseConfig, {
      filter: ['keep-this'],
    });

    expect(mockProviderGet).toHaveBeenCalledTimes(1);
    expect(mockProviderGet).toHaveBeenCalledWith('keep-this');
    expect(result.deployed).toHaveLength(1);
    expect(result.deployed[0].skill).toBe('keep-this');
  });

  it('returns dry-run placeholders without fetching', async () => {
    const manifest: WorkspaceManifest = {
      version: 1,
      skills: [{ name: 'dry-skill' }],
    };

    const result = await syncWorkspace(manifest, baseConfig, { dryRun: true });

    expect(mockProviderGet).not.toHaveBeenCalled();
    expect(result.deployed).toHaveLength(1);
    expect(result.deployed[0].path).toBe('(dry-run)');
  });

  it('returns empty result for empty manifest', async () => {
    const manifest: WorkspaceManifest = { version: 1 };
    const result = await syncWorkspace(manifest, baseConfig);

    expect(result.deployed).toHaveLength(0);
    expect(result.failed).toHaveLength(0);
    expect(result.skipped).toHaveLength(0);
  });

  it('calls onProgress callback during sync', async () => {
    const manifest: WorkspaceManifest = {
      version: 1,
      skills: [{ name: 'progress-skill' }],
    };

    mockProviderGet.mockResolvedValue(makePkg('progress-skill'));
    mockDeployerDeploy.mockResolvedValue('/deployed/progress-skill');

    const progressEvents: unknown[] = [];
    const result = await syncWorkspace(manifest, baseConfig, {
      onProgress: (event) => progressEvents.push(event),
    });

    expect(result.deployed).toHaveLength(1);
    expect(progressEvents.length).toBeGreaterThanOrEqual(1);
    // At least one fetch and one deploy event.
    expect(progressEvents.some((e: any) => e.phase === 'fetch')).toBe(true);
    expect(progressEvents.some((e: any) => e.phase === 'deploy')).toBe(true);
  });

  it('uses cached skill when cache is fresh', async () => {
    const manifest: WorkspaceManifest = {
      version: 1,
      skills: [{ name: 'cached-skill' }],
    };

    const cachedPkg = makePkg('cached-skill');
    mockIsFresh.mockResolvedValue(true);
    mockGetCachedSkill.mockResolvedValue(cachedPkg);
    mockDeployerDeploy.mockResolvedValue('/deployed/cached-skill');

    const result = await syncWorkspace(manifest, baseConfig);

    // Provider.get should NOT have been called — used cache instead.
    expect(mockProviderGet).not.toHaveBeenCalled();
    expect(mockDeployerDeploy).toHaveBeenCalledWith(cachedPkg);
    expect(result.deployed).toHaveLength(1);
  });

  it('falls through to fetch when cache returns null despite isFresh', async () => {
    const manifest: WorkspaceManifest = {
      version: 1,
      skills: [{ name: 'cache-null-skill' }],
    };

    mockIsFresh.mockResolvedValue(true);
    mockGetCachedSkill.mockResolvedValue(null); // Cache says fresh but returns null.
    mockProviderGet.mockResolvedValue(makePkg('cache-null-skill'));
    mockDeployerDeploy.mockResolvedValue('/deployed/cache-null-skill');

    const result = await syncWorkspace(manifest, baseConfig);

    // Should fall through to fetch from provider.
    expect(mockProviderGet).toHaveBeenCalledWith('cache-null-skill');
    expect(result.deployed).toHaveLength(1);
  });

  it('force option bypasses cache', async () => {
    const manifest: WorkspaceManifest = {
      version: 1,
      skills: [{ name: 'forced-skill' }],
    };

    mockIsFresh.mockResolvedValue(true); // Would normally use cache.
    mockProviderGet.mockResolvedValue(makePkg('forced-skill'));
    mockDeployerDeploy.mockResolvedValue('/deployed/forced-skill');

    const result = await syncWorkspace(manifest, baseConfig, { force: true });

    // Force should skip cache check entirely and fetch.
    expect(mockIsFresh).not.toHaveBeenCalled();
    expect(mockProviderGet).toHaveBeenCalledWith('forced-skill');
    expect(result.deployed).toHaveLength(1);
  });

  it('filter is case-insensitive', async () => {
    const manifest: WorkspaceManifest = {
      version: 1,
      skills: [{ name: 'My-Skill' }],
    };

    mockProviderGet.mockResolvedValue(makePkg('My-Skill'));
    mockDeployerDeploy.mockResolvedValue('/deployed/My-Skill');

    const result = await syncWorkspace(manifest, baseConfig, {
      filter: ['my-skill'],
    });

    expect(result.deployed).toHaveLength(1);
  });
});
