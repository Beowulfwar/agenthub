import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { planAppMigration } from '../../src/core/app-migration.js';

const TEST_ROOT = path.join(os.tmpdir(), 'ahub-app-migration-test');

beforeEach(async () => {
  await rm(TEST_ROOT, { recursive: true, force: true });
  await mkdir(TEST_ROOT, { recursive: true });
});

afterAll(async () => {
  await rm(TEST_ROOT, { recursive: true, force: true });
});

async function writePackage(relativeDir: string, name: string) {
  const dir = path.join(TEST_ROOT, relativeDir, name);
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, 'SKILL.md'),
    `---\nname: "${name}"\ndescription: "Descricao ${name}"\n---\n\n# ${name}\n`,
    'utf-8',
  );
}

describe('app-migration', () => {
  it('plans codex -> claude-code as lossy generation for skill packages', async () => {
    await writePackage('.codex/skills', 'alpha');

    const plan = await planAppMigration({
      workspaceDir: TEST_ROOT,
      fromApp: 'codex',
      toApp: 'claude-code',
      skill: 'alpha',
    });

    expect(plan.executable).toBe(true);
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0]?.lossiness).toBe('lossy_with_explicit_warning');
    expect(plan.items[0]?.targetPath).toBe(path.join(TEST_ROOT, '.claude', 'commands', 'alpha.md'));
  });

  it('blocks multi-item cursor -> cline migration because cline uses one file', async () => {
    await mkdir(path.join(TEST_ROOT, '.cursor', 'rules'), { recursive: true });
    await writeFile(path.join(TEST_ROOT, '.cursor', 'rules', 'one.md'), '# one\n', 'utf-8');
    await writeFile(path.join(TEST_ROOT, '.cursor', 'rules', 'two.md'), '# two\n', 'utf-8');

    const plan = await planAppMigration({
      workspaceDir: TEST_ROOT,
      fromApp: 'cursor',
      toApp: 'cline',
      all: true,
    });

    expect(plan.executable).toBe(false);
    expect(plan.blockedReasons).toContain('Cline usa um unico arquivo .clinerules. Selecione apenas um artefato por vez.');
  });
});
