import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { buildWorkspaceAppInventories, detectAppArtifacts } from '../../src/core/app-artifacts.js';

const TEST_ROOT = path.join(os.tmpdir(), 'ahub-app-artifacts-test');

beforeEach(async () => {
  await rm(TEST_ROOT, { recursive: true, force: true });
  await mkdir(TEST_ROOT, { recursive: true });
});

afterAll(async () => {
  await rm(TEST_ROOT, { recursive: true, force: true });
});

async function writePackage(rootDir: string, relativeDir: string, marker: 'SKILL.md' | 'PROMPT.md' | 'AGENT.md', name: string) {
  const dir = path.join(rootDir, relativeDir, name);
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, marker),
    `---\nname: "${name}"\ndescription: "Descricao ${name}"\n---\n\n# ${name}\n`,
    'utf-8',
  );
}

describe('app-artifacts', () => {
  it('detects canonical Codex packages and flags generic .skills as wrong repository', async () => {
    await writePackage(TEST_ROOT, '.codex/skills', 'SKILL.md', 'alpha');
    await writePackage(TEST_ROOT, '.skills', 'SKILL.md', 'beta');

    const artifacts = await detectAppArtifacts(TEST_ROOT);

    const codexAlpha = artifacts.find((artifact) => artifact.appId === 'codex' && artifact.name === 'alpha');
    const codexBeta = artifacts.find((artifact) => artifact.appId === 'codex' && artifact.name === 'beta');
    const claudeBeta = artifacts.find((artifact) => artifact.appId === 'claude-code' && artifact.name === 'beta');

    expect(codexAlpha?.visibilityStatus).toBe('visible_in_app');
    expect(codexAlpha?.expectedPath).toBe(path.join(TEST_ROOT, '.codex', 'skills', 'alpha'));

    expect(codexBeta?.visibilityStatus).toBe('found_in_wrong_repository');
    expect(codexBeta?.expectedPath).toBe(path.join(TEST_ROOT, '.codex', 'skills', 'beta'));
    expect(claudeBeta?.visibilityStatus).toBe('found_in_wrong_repository');
    expect(claudeBeta?.expectedPath).toBe(path.join(TEST_ROOT, '.claude', 'commands', 'beta.md'));
  });

  it('builds app inventories with counts for visible and wrong repositories', async () => {
    await writePackage(TEST_ROOT, '.codex/skills', 'SKILL.md', 'alpha');
    await writePackage(TEST_ROOT, '.skills', 'SKILL.md', 'beta');
    await mkdir(path.join(TEST_ROOT, '.github'), { recursive: true });
    await writeFile(path.join(TEST_ROOT, '.github', 'copilot-instructions.md'), '# Repo instructions\n', 'utf-8');

    const inventories = await buildWorkspaceAppInventories(TEST_ROOT);

    const codex = inventories.find((app) => app.appId === 'codex');
    const copilot = inventories.find((app) => app.appId === 'github-copilot');

    expect(codex?.counts.visible_in_app).toBe(1);
    expect(codex?.counts.found_in_wrong_repository).toBe(1);
    expect(codex?.artifacts.some((artifact) => artifact.name === 'beta')).toBe(true);

    expect(copilot?.counts.visible_in_app).toBe(1);
    expect(copilot?.artifacts[0]?.detectedPath).toBe(path.join(TEST_ROOT, '.github', 'copilot-instructions.md'));
  });
});
