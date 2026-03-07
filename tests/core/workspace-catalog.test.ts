import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDetectLocalSkills } = vi.hoisted(() => ({
  mockDetectLocalSkills: vi.fn(),
}));

vi.mock('../../src/core/explorer.js', () => ({
  detectLocalSkills: mockDetectLocalSkills,
}));

import {
  buildCloudSkillsCatalog,
  buildWorkspaceAgentInventories,
} from '../../src/core/workspace-catalog.js';
import type {
  DeployTargetDirectory,
  SkillPackage,
  WorkspaceManifest,
} from '../../src/core/types.js';
import type { StorageProvider } from '../../src/storage/provider.js';

function makePackage(
  name: string,
  options?: {
    type?: 'skill' | 'prompt' | 'subagent';
    description?: string;
    category?: string;
    tags?: string[];
  },
): SkillPackage {
  const type = options?.type ?? 'skill';
  const metadata: Record<string, unknown> = {};

  if (options?.category) metadata.category = options.category;
  if (options?.tags) metadata.tags = options.tags;

  return {
    skill: {
      name,
      description: options?.description ?? `Descricao ${name}`,
      body: `# ${name}\n\nConteudo`,
      type,
      metadata,
    },
    files: [
      {
        relativePath: type === 'prompt' ? 'PROMPT.md' : type === 'subagent' ? 'AGENT.md' : 'SKILL.md',
        content: `# ${name}\n`,
      },
    ],
  };
}

function createProvider(pkgs: SkillPackage[]): StorageProvider {
  const map = new Map(pkgs.map((pkg) => [pkg.skill.name, pkg]));

  return {
    name: 'local',
    async healthCheck() {
      return { ok: true };
    },
    async list() {
      return [...map.keys()].sort();
    },
    async exists(name: string) {
      return map.has(name);
    },
    async get(name: string) {
      const pkg = map.get(name);
      if (!pkg) {
        throw new Error(`Skill not found: ${name}`);
      }
      return pkg;
    },
    async put(pkg: SkillPackage) {
      map.set(pkg.skill.name, pkg);
    },
    async delete(name: string) {
      map.delete(name);
    },
    async *exportAll() {
      for (const pkg of map.values()) {
        yield pkg;
      }
    },
  };
}

describe('workspace-catalog', () => {
  beforeEach(() => {
    mockDetectLocalSkills.mockReset();
  });

  it('buildCloudSkillsCatalog returns provider skills once and resolves install state by explicit target', async () => {
    mockDetectLocalSkills.mockResolvedValue([
      {
        name: 'alpha',
        label: 'Codex skills',
        tool: 'codex',
        directoryPath: '/tmp/projeto/.codex/skills',
        absolutePath: '/tmp/projeto/.codex/skills/alpha',
        target: 'codex',
      },
      {
        name: 'alpha',
        label: 'Claude Code skills',
        tool: 'claude-code',
        directoryPath: '/tmp/projeto/.claude/skills',
        absolutePath: '/tmp/projeto/.claude/skills/alpha',
        target: 'claude-code',
      },
      {
        name: 'local-only',
        label: 'Codex skills',
        tool: 'codex',
        directoryPath: '/tmp/projeto/.codex/skills',
        absolutePath: '/tmp/projeto/.codex/skills/local-only',
        target: 'codex',
      },
    ]);

    const provider = createProvider([
      makePackage('alpha', { category: 'financeiro', tags: ['erp', 'fiscal'] }),
      makePackage('beta', { type: 'prompt', category: 'financeiro', tags: ['erp'] }),
    ]);

    const manifest: WorkspaceManifest = {
      version: 1,
      name: 'Projeto Fiscal',
      skills: [{ name: 'alpha', targets: ['codex'] }],
    };

    const catalog = await buildCloudSkillsCatalog({
      provider,
      loadManifest: async () => manifest,
      workspaceFilePath: '/tmp/projeto/ahub.workspace.json',
      target: 'codex',
    });

    expect(catalog.items.map((item) => item.name)).toEqual(['alpha', 'beta']);
    expect(catalog.items.find((item) => item.name === 'alpha')?.installState).toBe('installed');
    expect(catalog.items.find((item) => item.name === 'beta')?.installState).toBe('not_installed');
    expect(catalog.destinationScope.workspaceName).toBe('Projeto Fiscal');
    expect(catalog.destinationScope.ready).toBe(true);
    expect(catalog.counts).toEqual({
      installed: 1,
      not_installed: 1,
      unknown: 0,
    });

    const installedOnly = await buildCloudSkillsCatalog({
      provider,
      loadManifest: async () => manifest,
      workspaceFilePath: '/tmp/projeto/ahub.workspace.json',
      target: 'codex',
      installState: 'installed',
    });

    expect(installedOnly.items.map((item) => item.name)).toEqual(['alpha']);
    expect(installedOnly.counts).toEqual({
      installed: 1,
      not_installed: 1,
      unknown: 0,
    });
  });

  it('buildWorkspaceAgentInventories groups local skills by target and exposes drift states', async () => {
    mockDetectLocalSkills.mockResolvedValue([
      {
        name: 'alpha',
        label: 'Codex skills',
        tool: 'codex',
        directoryPath: '/tmp/projeto/.codex/skills',
        absolutePath: '/tmp/projeto/.codex/skills/alpha',
        target: 'codex',
      },
      {
        name: 'stray',
        label: 'Codex skills',
        tool: 'codex',
        directoryPath: '/tmp/projeto/.codex/skills',
        absolutePath: '/tmp/projeto/.codex/skills/stray',
        target: 'codex',
      },
      {
        name: 'beta',
        label: 'Claude Code skills',
        tool: 'claude-code',
        directoryPath: '/tmp/projeto/.claude/skills',
        absolutePath: '/tmp/projeto/.claude/skills/beta',
        target: 'claude-code',
      },
    ]);

    const manifest: WorkspaceManifest = {
      version: 1,
      name: 'Projeto Fiscal',
      skills: [
        { name: 'alpha', targets: ['codex'] },
        { name: 'missing-provider', targets: ['codex'] },
        { name: 'beta', targets: ['claude-code'] },
        { name: 'gamma', targets: ['claude-code'] },
      ],
    };

    const targetDirectories: DeployTargetDirectory[] = [
      {
        target: 'codex',
        label: 'Codex',
        source: 'workspace-local',
        rootPath: '/tmp/projeto/.codex',
        exists: true,
        directories: {
          skill: '/tmp/projeto/.codex/skills',
          prompt: '/tmp/projeto/.codex/prompts',
          subagent: '/tmp/projeto/.codex/agents',
        },
      },
      {
        target: 'claude-code',
        label: 'Claude Code',
        source: 'workspace-local',
        rootPath: '/tmp/projeto/.claude',
        exists: true,
        directories: {
          skill: '/tmp/projeto/.claude/skills',
          prompt: '/tmp/projeto/.claude/prompts',
          subagent: '/tmp/projeto/.claude/agents',
        },
      },
    ];

    const inventories = await buildWorkspaceAgentInventories({
      workspaceDir: '/tmp/projeto',
      manifest,
      targetDirectories,
      providerIndex: new Map([
        [
          'alpha',
          {
            name: 'alpha',
            type: 'skill',
            description: 'Descricao alpha',
            category: null,
            tags: [],
            fileCount: 1,
          },
        ],
        [
          'beta',
          {
            name: 'beta',
            type: 'skill',
            description: 'Descricao beta',
            category: null,
            tags: [],
            fileCount: 1,
          },
        ],
        [
          'gamma',
          {
            name: 'gamma',
            type: 'skill',
            description: 'Descricao gamma',
            category: null,
            tags: [],
            fileCount: 1,
          },
        ],
      ]),
    });

    const codex = inventories.find((entry) => entry.target === 'codex');
    const claude = inventories.find((entry) => entry.target === 'claude-code');

    expect(codex?.skills.map((skill) => `${skill.name}:${skill.status}`)).toEqual([
      'alpha:manifest_and_installed',
      'missing-provider:missing_in_provider',
      'stray:local_outside_manifest',
    ]);
    expect(codex?.counts).toEqual({
      total: 3,
      manifest_and_installed: 1,
      manifest_missing_local: 0,
      local_outside_manifest: 1,
      missing_in_provider: 1,
    });

    expect(claude?.skills.map((skill) => `${skill.name}:${skill.status}`)).toEqual([
      'beta:manifest_and_installed',
      'gamma:manifest_missing_local',
    ]);
    expect(claude?.counts).toEqual({
      total: 2,
      manifest_and_installed: 1,
      manifest_missing_local: 1,
      local_outside_manifest: 0,
      missing_in_provider: 0,
    });
  });
});
