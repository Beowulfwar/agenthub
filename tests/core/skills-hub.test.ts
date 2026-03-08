import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const { mockDetectLocalSkills, mockReadDetectedArtifactContent, mockBuildWorkspaceAppInventories } = vi.hoisted(() => ({
  mockDetectLocalSkills: vi.fn(),
  mockReadDetectedArtifactContent: vi.fn(),
  mockBuildWorkspaceAppInventories: vi.fn(),
}));

vi.mock('../../src/core/explorer.js', () => ({
  detectLocalSkills: mockDetectLocalSkills,
}));

vi.mock('../../src/core/app-artifacts.js', async () => ({
  buildWorkspaceAppInventories: mockBuildWorkspaceAppInventories,
  readDetectedArtifactContent: mockReadDetectedArtifactContent,
}));

import { buildSkillsHubWorkspaceDetail, performSkillsHubTransfer, performSkillsHubUpload } from '../../src/core/skills-hub.js';
import { loadProviderSkillIndex } from '../../src/core/workspace-catalog.js';
import { resolveManifestSkills, saveWorkspaceManifest, loadWorkspaceManifest } from '../../src/core/workspace.js';
import { serializeSkill } from '../../src/core/skill.js';
import type { AhubConfig, SkillPackage, WorkspaceManifest } from '../../src/core/types.js';
import type { StorageProvider } from '../../src/storage/provider.js';

const TEST_ROOT = path.join(os.tmpdir(), 'ahub-skills-hub-test');

function makePackage(
  name: string,
  options?: {
    type?: 'skill' | 'prompt' | 'subagent';
    description?: string;
    body?: string;
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
      body: options?.body ?? `# ${name}\n\nConteudo`,
      ...(type !== 'skill' ? { type } : {}),
      metadata,
    },
    files: [
      {
        relativePath: type === 'prompt' ? 'PROMPT.md' : type === 'subagent' ? 'AGENT.md' : 'SKILL.md',
        content: serializeSkill({
          name,
          description: options?.description ?? `Descricao ${name}`,
          body: options?.body ?? `# ${name}\n\nConteudo`,
          ...(type !== 'skill' ? { type } : {}),
          metadata,
        }),
      },
    ],
  };
}

function createProvider(pkgs: SkillPackage[]) {
  const map = new Map(pkgs.map((pkg) => [pkg.skill.name, pkg]));
  const put = vi.fn(async (pkg: SkillPackage) => {
    map.set(pkg.skill.name, pkg);
  });

  const provider: StorageProvider = {
    name: 'local',
    async healthCheck() {
      return { ok: true, message: 'ok' };
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
    put,
    async delete(name: string) {
      map.delete(name);
    },
    async *exportAll() {
      for (const pkg of map.values()) {
        yield pkg;
      }
    },
  };

  return { provider, map, put };
}

async function writeManifest(filePath: string, manifest: WorkspaceManifest) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await saveWorkspaceManifest(filePath, manifest);
}

async function writeCodexSkillPackage(workspaceDir: string, name: string, body: string) {
  const dir = path.join(workspaceDir, '.codex', 'skills', name);
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, 'SKILL.md'),
    serializeSkill({
      name,
      description: `Descricao ${name}`,
      body,
      metadata: {},
    }),
    'utf-8',
  );
  return dir;
}

describe('skills-hub', () => {
  const config = { version: 2, sources: [] } as AhubConfig;

  beforeEach(async () => {
    mockDetectLocalSkills.mockReset();
    mockReadDetectedArtifactContent.mockReset();
    mockBuildWorkspaceAppInventories.mockReset();
    mockBuildWorkspaceAppInventories.mockResolvedValue([]);
    await rm(TEST_ROOT, { recursive: true, force: true });
    await mkdir(TEST_ROOT, { recursive: true });
  });

  it('buildSkillsHubWorkspaceDetail marks a file-based local skill as synced when local content matches the rendered cloud content', async () => {
    const workspaceDir = path.join(TEST_ROOT, 'workspace-sync');
    const filePath = path.join(workspaceDir, 'ahub.workspace.json');
    await writeManifest(filePath, {
      version: 1,
      name: 'Workspace Sync',
      skills: [{ name: 'alpha', targets: ['claude-code'] }],
    });

    mockDetectLocalSkills.mockResolvedValue([
      {
        name: 'alpha',
        label: 'Claude Code commands',
        tool: 'claude-code',
        directoryPath: path.join(workspaceDir, '.claude', 'commands'),
        absolutePath: path.join(workspaceDir, '.claude', 'commands', 'alpha.md'),
        target: 'claude-code',
        artifactKind: 'command_file',
        appId: 'claude-code',
        appLabel: 'Claude Code',
      },
    ]);
    mockReadDetectedArtifactContent.mockResolvedValue('# alpha\n\nConteudo local');

    const { provider } = createProvider([
      makePackage('alpha', { body: '# alpha\n\nConteudo local' }),
    ]);

    const detail = await buildSkillsHubWorkspaceDetail({
      config,
      filePath,
      isActive: true,
      providerIndex: await loadProviderSkillIndex(provider),
      packageLoader: {
        get: async (name) => provider.get(name).catch(() => null),
      },
    });

    const agent = detail.agents.find((entry) => entry.target === 'claude-code');
    expect(agent?.skills.map((skill) => `${skill.name}:${skill.status}`)).toEqual([
      'alpha:synced',
    ]);
    expect(agent?.skills[0].lossiness).toBe('lossy_with_explicit_warning');
  });

  it('buildSkillsHubWorkspaceDetail marks a codex package as diverged when package content differs from cloud', async () => {
    const workspaceDir = path.join(TEST_ROOT, 'workspace-diverged');
    const filePath = path.join(workspaceDir, 'ahub.workspace.json');
    const localDir = await writeCodexSkillPackage(workspaceDir, 'beta', '# beta\n\nVersao local');
    await writeManifest(filePath, {
      version: 1,
      name: 'Workspace Diverged',
      skills: [{ name: 'beta', targets: ['codex'] }],
    });

    mockDetectLocalSkills.mockResolvedValue([
      {
        name: 'beta',
        label: 'Codex skills',
        tool: 'codex',
        directoryPath: path.join(workspaceDir, '.codex', 'skills'),
        absolutePath: localDir,
        target: 'codex',
        artifactKind: 'skill_package',
        appId: 'codex',
        appLabel: 'Codex',
      },
    ]);

    const { provider } = createProvider([
      makePackage('beta', { body: '# beta\n\nVersao da nuvem' }),
    ]);

    const detail = await buildSkillsHubWorkspaceDetail({
      config,
      filePath,
      isActive: false,
      providerIndex: await loadProviderSkillIndex(provider),
      packageLoader: {
        get: async (name) => provider.get(name).catch(() => null),
      },
    });

    const agent = detail.agents.find((entry) => entry.target === 'codex');
    expect(agent?.skills.map((skill) => `${skill.name}:${skill.status}`)).toEqual([
      'beta:diverged',
    ]);
    expect(agent?.skills[0].lossiness).toBe('lossless');
  });

  it('performSkillsHubUpload blocks diverged uploads without force and allows them with force', async () => {
    const workspaceDir = path.join(TEST_ROOT, 'workspace-upload');
    const filePath = path.join(workspaceDir, 'ahub.workspace.json');
    await writeManifest(filePath, {
      version: 1,
      name: 'Workspace Upload',
      skills: [{ name: 'alpha', targets: ['claude-code'] }],
    });

    mockDetectLocalSkills.mockResolvedValue([
      {
        name: 'alpha',
        label: 'Claude Code commands',
        tool: 'claude-code',
        directoryPath: path.join(workspaceDir, '.claude', 'commands'),
        absolutePath: path.join(workspaceDir, '.claude', 'commands', 'alpha.md'),
        target: 'claude-code',
        artifactKind: 'command_file',
        appId: 'claude-code',
        appLabel: 'Claude Code',
      },
    ]);
    mockReadDetectedArtifactContent.mockResolvedValue('# alpha\n\nVersao local');

    const { provider, put } = createProvider([
      makePackage('alpha', { body: '# alpha\n\nVersao da nuvem' }),
    ]);

    const blocked = await performSkillsHubUpload({
      provider,
      filePath,
      target: 'claude-code',
      skills: ['alpha'],
    });

    expect(blocked.successful).toEqual([]);
    expect(blocked.failed[0]?.code).toBe('DIFF_CONFIRMATION_REQUIRED');
    expect(put).not.toHaveBeenCalled();

    const forced = await performSkillsHubUpload({
      provider,
      filePath,
      target: 'claude-code',
      skills: ['alpha'],
      force: true,
    });

    expect(forced.failed).toEqual([]);
    expect(forced.successful[0]?.skill).toBe('alpha');
    expect(put).toHaveBeenCalledTimes(1);
  });

  it('performSkillsHubTransfer moves a local codex package to another workspace and updates both manifests', async () => {
    const sourceWorkspaceDir = path.join(TEST_ROOT, 'source-workspace');
    const destinationWorkspaceDir = path.join(TEST_ROOT, 'destination-workspace');
    const sourceFilePath = path.join(sourceWorkspaceDir, 'ahub.workspace.json');
    const destinationFilePath = path.join(destinationWorkspaceDir, 'ahub.workspace.json');
    const localDir = await writeCodexSkillPackage(sourceWorkspaceDir, 'alpha', '# alpha\n\nConteudo migrado');

    await writeManifest(sourceFilePath, {
      version: 1,
      name: 'Origem',
      skills: [{ name: 'alpha', targets: ['codex'] }],
    });
    await writeManifest(destinationFilePath, {
      version: 1,
      name: 'Destino',
      skills: [],
    });

    mockDetectLocalSkills.mockImplementation(async (workspaceDir: string) => {
      if (workspaceDir === sourceWorkspaceDir) {
        return [
          {
            name: 'alpha',
            label: 'Codex skills',
            tool: 'codex',
            directoryPath: path.join(sourceWorkspaceDir, '.codex', 'skills'),
            absolutePath: localDir,
            target: 'codex',
            artifactKind: 'skill_package',
            appId: 'codex',
            appLabel: 'Codex',
          },
        ];
      }

      return [];
    });

    const result = await performSkillsHubTransfer({
      config,
      sourceWorkspaceFilePath: sourceFilePath,
      sourceTarget: 'codex',
      destinationWorkspaceFilePath: destinationFilePath,
      destinationTarget: 'claude-code',
      skills: ['alpha'],
      mode: 'move',
    });

    expect(result.failed).toEqual([]);
    expect(result.successful[0]?.skill).toBe('alpha');

    const sourceManifest = await loadWorkspaceManifest(sourceFilePath);
    const destinationManifest = await loadWorkspaceManifest(destinationFilePath);
    expect(resolveManifestSkills(sourceManifest)).toEqual([]);
    expect(resolveManifestSkills(destinationManifest)).toEqual([
      { type: 'skill', name: 'alpha', targets: ['claude-code'] },
    ]);

    const destinationContent = await readFile(
      path.join(destinationWorkspaceDir, '.claude', 'commands', 'alpha.md'),
      'utf-8',
    );
    expect(destinationContent).toContain('Conteudo migrado');
  });
});
